"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrchestratorService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const crypto_1 = require("../utils/crypto");
class OrchestratorService {
    db;
    realtime;
    migrationCooldowns = new Map();
    recoveryCooldowns = new Map();
    migrationLocks = new Set();
    heartbeatTimeoutMs;
    migrationCooldownMs;
    constructor(db, realtime, options) {
        this.db = db;
        this.realtime = realtime;
        this.heartbeatTimeoutMs = options?.heartbeatTimeoutMs ?? Number(process.env.WORKER_HEARTBEAT_TIMEOUT_MS || 30000);
        this.migrationCooldownMs = options?.migrationCooldownMs ?? Number(process.env.MIGRATION_COOLDOWN_MS || 60000);
    }
    async createWorker(name, maxBots) {
        const rawToken = `wk_${node_crypto_1.default.randomBytes(24).toString('hex')}`;
        const worker = {
            id: `worker-${node_crypto_1.default.randomUUID().slice(0, 8)}`,
            name: name.trim(),
            tokenHash: (0, crypto_1.sha256)(rawToken),
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
    async authenticateWorker(workerId, rawToken) {
        const w = await this.db.getWorker(workerId);
        if (!w || w.revokedAt)
            return null;
        if (w.tokenHash !== (0, crypto_1.sha256)(rawToken))
            return null;
        return w;
    }
    async rotateWorkerToken(workerId, actorId) {
        const w = await this.db.getWorker(workerId);
        if (!w)
            throw new Error('Không tìm thấy worker.');
        const rawToken = `wk_${node_crypto_1.default.randomBytes(24).toString('hex')}`;
        const updated = { ...w, tokenHash: (0, crypto_1.sha256)(rawToken), revokedAt: null };
        await this.db.upsertWorker(updated);
        await this.db.appendAuditLog({
            id: node_crypto_1.default.randomUUID(),
            actorId,
            action: 'WORKER_TOKEN_ROTATED',
            targetType: 'worker',
            targetId: workerId,
            detail: `Xoay vòng token cho worker ${w.name}`,
            createdAt: new Date().toISOString(),
        });
        return { worker: updated, rawToken };
    }
    async revokeWorker(workerId, actorId) {
        const w = await this.db.getWorker(workerId);
        if (!w)
            throw new Error('Không tìm thấy worker.');
        const updated = { ...w, revokedAt: new Date().toISOString(), status: 'OFFLINE' };
        await this.db.upsertWorker(updated);
        await this.db.appendAuditLog({
            id: node_crypto_1.default.randomUUID(),
            actorId,
            action: 'WORKER_REVOKED',
            targetType: 'worker',
            targetId: workerId,
            detail: `Thu hồi token worker ${w.name}`,
            createdAt: new Date().toISOString(),
        });
        return updated;
    }
    async recordHeartbeat(workerId, stats) {
        const w = await this.db.getWorker(workerId);
        if (!w || w.revokedAt)
            throw new Error('Worker không hợp lệ hoặc đã bị thu hồi.');
        const wasNotHealthy = w.status !== 'HEALTHY';
        const updated = {
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
    canAttemptRecovery(botId, cooldownMs = 60_000) {
        const now = Date.now();
        const last = this.recoveryCooldowns.get(botId) ?? 0;
        if (now - last < cooldownMs)
            return false;
        this.recoveryCooldowns.set(botId, now);
        return true;
    }
    async recoverBotsForWorker(workerId) {
        const bots = await this.db.listAllBots();
        const targets = bots.filter((b) => b.workerId === workerId &&
            b.status !== 'STOPPED' &&
            b.reconnect?.enabled !== false &&
            this.canAttemptRecovery(b.id));
        let recovered = 0;
        for (const bot of targets) {
            try {
                await this.dispatchStartBot(bot, false);
                recovered += 1;
                await new Promise((r) => setTimeout(r, 250));
            }
            catch {
                // Ignore if worker filled up mid-recovery; 5-min watchdog handles remainder
            }
        }
        return recovered;
    }
    /**
     * Periodic 5-minute node health ping + auto-recovery sweep.
     * Staggers restarts (250ms apart) with a 60s per-bot cooldown so it never lags the host.
     */
    async runPeriodicNodePingAndRecovery(localStarter, isRunningLocally) {
        try {
            await this.evaluateHealthAndMigrate('system-watchdog-5m');
            const bots = await this.db.listAllBots();
            const healthyWorker = await this.selectHealthyWorker();
            for (const bot of bots) {
                if (bot.status === 'STOPPED' || bot.reconnect?.enabled === false)
                    continue;
                if (bot.workerId === 'local-panel-core') {
                    const running = isRunningLocally ? isRunningLocally(bot.id) : false;
                    if (!running && localStarter && this.canAttemptRecovery(bot.id)) {
                        await localStarter(bot).catch(() => { });
                        await new Promise((r) => setTimeout(r, 250));
                    }
                }
                else if (bot.status === 'ERROR' && healthyWorker && this.canAttemptRecovery(bot.id)) {
                    await this.dispatchStartBot(bot, false).catch(() => { });
                    await new Promise((r) => setTimeout(r, 250));
                }
            }
        }
        catch {
            // Never crash background watchdog
        }
    }
    async selectHealthyWorker(excludeWorkerId) {
        const workers = await this.db.listWorkers();
        const candidates = workers.filter((w) => !w.revokedAt &&
            w.id !== excludeWorkerId &&
            w.status === 'HEALTHY' &&
            w.activeBots < w.maxBots);
        if (candidates.length === 0)
            return null;
        candidates.sort((a, b) => a.activeBots / Math.max(1, a.maxBots) - b.activeBots / Math.max(1, b.maxBots));
        return candidates[0];
    }
    async dispatchStartBot(bot, isMigration = false) {
        let targetWorker = null;
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
        const password = envelope ? (0, crypto_1.decryptSecret)(envelope) : undefined;
        await this.db.assignBotToWorker(bot.id, targetWorker.id);
        const updatedBot = {
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
            id: node_crypto_1.default.randomUUID(),
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
    async evaluateHealthAndMigrate(actorId = 'system-orchestrator') {
        const now = Date.now();
        const workers = await this.db.listWorkers();
        const unhealthyWorkers = [];
        for (const w of workers) {
            if (w.revokedAt)
                continue;
            if (w.status === 'HEALTHY') {
                const lastHb = w.lastHeartbeatAt ? Date.parse(w.lastHeartbeatAt) : 0;
                if (!lastHb || now - lastHb > this.heartbeatTimeoutMs) {
                    const marked = { ...w, status: 'UNHEALTHY', lastError: 'Heartbeat timeout' };
                    await this.db.upsertWorker(marked);
                    unhealthyWorkers.push(w.id);
                }
            }
            else if (w.status === 'UNHEALTHY') {
                unhealthyWorkers.push(w.id);
            }
        }
        const migratedBots = [];
        const failedMigrations = [];
        if (unhealthyWorkers.length === 0) {
            return { unhealthyWorkers, migratedBots, failedMigrations };
        }
        const allBots = await this.db.listAllBots();
        const affected = allBots.filter((b) => b.workerId &&
            unhealthyWorkers.includes(b.workerId) &&
            b.status !== 'STOPPED' &&
            b.status !== 'ERROR');
        for (const bot of affected) {
            if (this.migrationLocks.has(bot.id))
                continue;
            const lastMig = this.migrationCooldowns.get(bot.id) ?? 0;
            if (now - lastMig < this.migrationCooldownMs) {
                failedMigrations.push({ botId: bot.id, reason: 'Đang trong thời gian cooldown migration.' });
                continue;
            }
            this.migrationLocks.add(bot.id);
            try {
                const fromWorkerId = bot.workerId;
                const { workerId: toWorkerId } = await this.dispatchStartBot(bot, true);
                this.migrationCooldowns.set(bot.id, Date.now());
                migratedBots.push({ botId: bot.id, fromWorkerId, toWorkerId });
                await this.db.appendAuditLog({
                    id: node_crypto_1.default.randomUUID(),
                    actorId,
                    action: 'BOT_MIGRATED',
                    targetType: 'bot',
                    targetId: bot.id,
                    detail: `Chuyển bot ${bot.name} (${bot.id}) từ ${fromWorkerId} sang ${toWorkerId} do worker mất heartbeat.`,
                    createdAt: new Date().toISOString(),
                });
            }
            catch (err) {
                const reason = err instanceof Error ? err.message : 'Migration thất bại';
                failedMigrations.push({ botId: bot.id, reason });
                await this.db.saveBot({ ...bot, status: 'ERROR', lastError: reason, updatedAt: new Date().toISOString() });
            }
            finally {
                this.migrationLocks.delete(bot.id);
            }
        }
        return { unhealthyWorkers, migratedBots, failedMigrations };
    }
}
exports.OrchestratorService = OrchestratorService;
