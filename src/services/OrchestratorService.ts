import crypto from 'node:crypto';
import { PanelDatabase } from '../storage/PanelDatabase';
import { BotRecord, WorkerRecord } from '../types';
import { decryptSecret, sha256 } from '../utils/crypto';
import { RealtimePublisher } from './RealtimePublisher';

export class OrchestratorService {
  private readonly migrationCooldowns = new Map<string, number>();
  private readonly recoveryCooldowns = new Map<string, number>();
  private readonly migrationLocks = new Set<string>();
  private readonly heartbeatTimeoutMs: number;
  private readonly migrationCooldownMs: number;

  constructor(
    private readonly db: PanelDatabase,
    private readonly realtime: RealtimePublisher,
    options?: { heartbeatTimeoutMs?: number; migrationCooldownMs?: number }
  ) {
    this.heartbeatTimeoutMs = options?.heartbeatTimeoutMs ?? Number(process.env.WORKER_HEARTBEAT_TIMEOUT_MS || 30000);
    this.migrationCooldownMs = options?.migrationCooldownMs ?? Number(process.env.MIGRATION_COOLDOWN_MS || 60000);
  }

  private getWorkerSigningSecret(): string {
    return (
      process.env.SESSION_SECRET?.trim() ||
      process.env.CREDENTIAL_ENCRYPTION_KEY?.trim() ||
      'craftopia-cafe-default-session-secret'
    );
  }

  private signWorkerToken(workerId: string, name: string, maxBots: number): string {
    const payload = Buffer.from(
      JSON.stringify({ id: workerId, name, maxBots, nonce: crypto.randomBytes(8).toString('hex') }),
      'utf8'
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', this.getWorkerSigningSecret()).update(payload).digest('base64url');
    return `wk2_${payload}.${sig}`;
  }

  private verifySignedWorkerToken(
    rawToken: string
  ): { id: string; name: string; maxBots: number } | null {
    if (!rawToken.startsWith('wk2_')) return null;
    const body = rawToken.slice(4);
    const parts = body.split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expected = crypto
      .createHmac('sha256', this.getWorkerSigningSecret())
      .update(payload)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        id: string;
        name: string;
        maxBots: number;
      };
      if (!parsed.id) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  public async createWorker(name: string, maxBots: number): Promise<{ worker: WorkerRecord; rawToken: string }> {
    const id = `worker-${crypto.randomUUID().slice(0, 8)}`;
    const rawToken = this.signWorkerToken(id, name.trim(), maxBots);
    const worker: WorkerRecord = {
      id,
      name: name.trim(),
      tokenHash: sha256(rawToken),
      version: '1.0.0',
      status: 'OFFLINE',
      maxBots,
      activeBots: 0,
      rssMb: 0,
      heapMb: 0,
      eventLoopLagMs: 0,
      lastError: null,
      lastHeartbeatAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    };
    await this.db.upsertWorker(worker);
    return { worker, rawToken };
  }

  public async authenticateWorker(workerId: string, rawToken: string): Promise<WorkerRecord | null> {
    const w = await this.db.getWorker(workerId);
    if (w) {
      if (w.revokedAt) return null;
      if (w.tokenHash !== sha256(rawToken)) return null;
      return w;
    }

    // Stateless fallback when serverless /tmp doesn't share worker rows across instances
    if (!this.db.isPostgres()) {
      const signed = this.verifySignedWorkerToken(rawToken);
      if (signed && signed.id === workerId) {
        const hydrated: WorkerRecord = {
          id: signed.id,
          name: signed.name || workerId,
          tokenHash: sha256(rawToken),
          version: '1.0.0',
          status: 'OFFLINE',
          maxBots: Number(signed.maxBots || 4),
          activeBots: 0,
          rssMb: 0,
          heapMb: 0,
          eventLoopLagMs: 0,
          lastError: null,
          lastHeartbeatAt: null,
          revokedAt: null,
          createdAt: new Date().toISOString(),
        };
        await this.db.upsertWorker(hydrated);
        return hydrated;
      }
    }
    return null;
  }

  public async rotateWorkerToken(workerId: string, actorId: string): Promise<{ worker: WorkerRecord; rawToken: string }> {
    const w = await this.db.getWorker(workerId);
    if (!w) throw new Error('Không tìm thấy worker.');
    const rawToken = `wk_${crypto.randomBytes(24).toString('hex')}`;
    const updated: WorkerRecord = { ...w, tokenHash: sha256(rawToken), revokedAt: null };
    await this.db.upsertWorker(updated);
    await this.db.appendAuditLog({
      id: crypto.randomUUID(),
      actorId,
      action: 'WORKER_TOKEN_ROTATED',
      targetType: 'worker',
      targetId: workerId,
      detail: `Xoay vòng token cho worker ${w.name}`,
      createdAt: new Date().toISOString(),
    });
    return { worker: updated, rawToken };
  }

  public async revokeWorker(workerId: string, actorId: string): Promise<WorkerRecord> {
    const w = await this.db.getWorker(workerId);
    if (!w) throw new Error('Không tìm thấy worker.');
    const updated: WorkerRecord = { ...w, revokedAt: new Date().toISOString(), status: 'OFFLINE' };
    await this.db.upsertWorker(updated);
    await this.db.appendAuditLog({
      id: crypto.randomUUID(),
      actorId,
      action: 'WORKER_REVOKED',
      targetType: 'worker',
      targetId: workerId,
      detail: `Thu hồi token worker ${w.name}`,
      createdAt: new Date().toISOString(),
    });
    return updated;
  }

  public async recordHeartbeat(
    workerId: string,
    stats: { activeBots: number; maxBots: number; rssMb: number; heapUsedMb: number; eventLoopLagMs: number; draining?: boolean }
  ): Promise<WorkerRecord> {
    const w = await this.db.getWorker(workerId);
    if (!w || w.revokedAt) throw new Error('Worker không hợp lệ hoặc đã bị thu hồi.');
    const wasNotHealthy = w.status !== 'HEALTHY';
    const updated: WorkerRecord = {
      ...w,
      status: stats.draining ? 'DRAINING' : 'HEALTHY',
      activeBots: stats.activeBots,
      maxBots: stats.maxBots,
      rssMb: stats.rssMb,
      heapMb: stats.heapUsedMb,
      eventLoopLagMs: stats.eventLoopLagMs,
      lastHeartbeatAt: new Date().toISOString(),
    };
    await this.db.upsertWorker(updated);

    // When a node recovers from OFFLINE/UNHEALTHY (e.g. Discord host restarted),
    // automatically reconnect its non-stopped bots in a staggered, zero-lag pass.
    if (wasNotHealthy && updated.status === 'HEALTHY') {
      void this.recoverBotsForWorker(workerId);
    }
    return updated;
  }

  private canAttemptRecovery(botId: string, cooldownMs = 60_000): boolean {
    const now = Date.now();
    const last = this.recoveryCooldowns.get(botId) ?? 0;
    if (now - last < cooldownMs) return false;
    this.recoveryCooldowns.set(botId, now);
    return true;
  }

  public async recoverBotsForWorker(workerId: string): Promise<number> {
    const bots = await this.db.listAllBots();
    const targets = bots.filter(
      (b) =>
        b.workerId === workerId &&
        b.status !== 'STOPPED' &&
        b.reconnect?.enabled !== false &&
        this.canAttemptRecovery(b.id)
    );
    let recovered = 0;
    for (const bot of targets) {
      try {
        await this.dispatchStartBot(bot, false);
        recovered += 1;
        await new Promise((r) => setTimeout(r, 250));
      } catch {
        // Ignore if worker filled up mid-recovery; 5-min watchdog handles remainder
      }
    }
    return recovered;
  }

  /**
   * Periodic 5-minute node health ping + auto-recovery sweep.
   * Staggers restarts (250ms apart) with a 60s per-bot cooldown so it never lags the host.
   */
  public async runPeriodicNodePingAndRecovery(
    localStarter?: (bot: BotRecord) => Promise<void>,
    isRunningLocally?: (botId: string) => boolean
  ): Promise<void> {
    try {
      await this.evaluateHealthAndMigrate('system-watchdog-5m');
      const bots = await this.db.listAllBots();
      const healthyWorker = await this.selectHealthyWorker();

      for (const bot of bots) {
        if (bot.status === 'STOPPED' || bot.reconnect?.enabled === false) continue;

        if (bot.workerId === 'local-panel-core') {
          const running = isRunningLocally ? isRunningLocally(bot.id) : false;
          if (!running && localStarter && this.canAttemptRecovery(bot.id)) {
            await localStarter(bot).catch(() => {});
            await new Promise((r) => setTimeout(r, 250));
          }
        } else if (bot.status === 'ERROR' && healthyWorker && this.canAttemptRecovery(bot.id)) {
          await this.dispatchStartBot(bot, false).catch(() => {});
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    } catch {
      // Never crash background watchdog
    }
  }

  public async selectHealthyWorker(excludeWorkerId?: string): Promise<WorkerRecord | null> {
    const workers = await this.db.listWorkers();
    const candidates = workers.filter(
      (w) =>
        !w.revokedAt &&
        w.id !== excludeWorkerId &&
        w.status === 'HEALTHY' &&
        w.activeBots < w.maxBots
    );
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.activeBots / Math.max(1, a.maxBots) - b.activeBots / Math.max(1, b.maxBots));
    return candidates[0];
  }

  public async dispatchStartBot(bot: BotRecord, isMigration = false): Promise<{ workerId: string; requestId: string }> {
    let targetWorker: WorkerRecord | null = null;
    if (bot.workerId && !isMigration) {
      const curr = await this.db.getWorker(bot.workerId);
      if (curr && !curr.revokedAt && curr.status === 'HEALTHY' && curr.activeBots < curr.maxBots) {
        targetWorker = curr;
      }
    }
    if (!targetWorker) {
      targetWorker = await this.selectHealthyWorker(isMigration ? bot.workerId || undefined : undefined);
    }
    if (!targetWorker) {
      throw new Error('Không có worker nào đang khỏe và còn tài nguyên khả dụng.');
    }

    const envelope = await this.db.getBotCredentialEnvelope(bot.id);
    const password = envelope ? decryptSecret(envelope) : undefined;

    await this.db.assignBotToWorker(bot.id, targetWorker.id);
    const updatedBot: BotRecord = {
      ...bot,
      workerId: targetWorker.id,
      status: 'QUEUED',
      updatedAt: new Date().toISOString(),
    };
    await this.db.saveBot(updatedBot);

    const { requestId } = await this.realtime.publish({
      type: isMigration ? 'MIGRATION_REQUEST' : 'START_BOT',
      workerId: targetWorker.id,
      botId: bot.id,
      payload: {
        botId: bot.id,
        ownerId: bot.ownerId,
        name: bot.name,
        username: bot.mcUsername,
        host: bot.host,
        port: bot.port,
        version: bot.version,
        auth: bot.authMode,
        reconnect: bot.reconnect,
        autoAuth: { ...bot.autoAuth, ...(password ? { password } : {}) },
      },
    });

    await this.db.recordCommand({
      id: crypto.randomUUID(),
      requestId,
      botId: bot.id,
      workerId: targetWorker.id,
      type: isMigration ? 'MIGRATION_REQUEST' : 'START_BOT',
      status: 'pending',
      latencyMs: null,
      result: null,
      createdAt: new Date().toISOString(),
    });

    return { workerId: targetWorker.id, requestId };
  }

  /**
   * Checks worker heartbeats, marks stale workers UNHEALTHY, and migrates affected running bots
   * to healthy workers with cooldown, single-owner lock, and audit logging.
   * Preserves botId, ownerId, username, config, and subscription.
   */
  public async evaluateHealthAndMigrate(actorId = 'system-orchestrator'): Promise<{
    unhealthyWorkers: string[];
    migratedBots: Array<{ botId: string; fromWorkerId: string; toWorkerId: string }>;
    failedMigrations: Array<{ botId: string; reason: string }>;
  }> {
    const now = Date.now();
    const workers = await this.db.listWorkers();
    const unhealthyWorkers: string[] = [];

    for (const w of workers) {
      if (w.revokedAt) continue;
      if (w.status === 'HEALTHY') {
        const lastHb = w.lastHeartbeatAt ? Date.parse(w.lastHeartbeatAt) : 0;
        if (!lastHb || now - lastHb > this.heartbeatTimeoutMs) {
          const marked: WorkerRecord = { ...w, status: 'UNHEALTHY', lastError: 'Heartbeat timeout' };
          await this.db.upsertWorker(marked);
          unhealthyWorkers.push(w.id);
        }
      } else if (w.status === 'UNHEALTHY') {
        unhealthyWorkers.push(w.id);
      }
    }

    const migratedBots: Array<{ botId: string; fromWorkerId: string; toWorkerId: string }> = [];
    const failedMigrations: Array<{ botId: string; reason: string }> = [];
    if (unhealthyWorkers.length === 0) {
      return { unhealthyWorkers, migratedBots, failedMigrations };
    }

    const allBots = await this.db.listAllBots();
    const affected = allBots.filter(
      (b) =>
        b.workerId &&
        unhealthyWorkers.includes(b.workerId) &&
        b.status !== 'STOPPED' &&
        b.status !== 'ERROR'
    );

    for (const bot of affected) {
      if (this.migrationLocks.has(bot.id)) continue;
      const lastMig = this.migrationCooldowns.get(bot.id) ?? 0;
      if (now - lastMig < this.migrationCooldownMs) {
        failedMigrations.push({ botId: bot.id, reason: 'Đang trong thời gian cooldown migration.' });
        continue;
      }

      this.migrationLocks.add(bot.id);
      try {
        const fromWorkerId = bot.workerId!;
        const { workerId: toWorkerId } = await this.dispatchStartBot(bot, true);
        this.migrationCooldowns.set(bot.id, Date.now());
        migratedBots.push({ botId: bot.id, fromWorkerId, toWorkerId });

        await this.db.appendAuditLog({
          id: crypto.randomUUID(),
          actorId,
          action: 'BOT_MIGRATED',
          targetType: 'bot',
          targetId: bot.id,
          detail: `Chuyển bot ${bot.name} (${bot.id}) từ ${fromWorkerId} sang ${toWorkerId} do worker mất heartbeat.`,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Migration thất bại';
        failedMigrations.push({ botId: bot.id, reason });
        await this.db.saveBot({ ...bot, status: 'ERROR', lastError: reason, updatedAt: new Date().toISOString() });
      } finally {
        this.migrationLocks.delete(bot.id);
      }
    }

    return { unhealthyWorkers, migratedBots, failedMigrations };
  }
}
