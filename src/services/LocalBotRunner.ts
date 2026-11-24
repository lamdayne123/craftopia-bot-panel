import crypto from 'node:crypto';
import { z } from 'zod';
import { PanelDatabase } from '../storage/PanelDatabase';
import { BotRecord } from '../types';
import { decryptSecret, redactSecrets } from '../utils/crypto';

export const LOCAL_PANEL_WORKER_ID = 'local-panel-core';
type BotStatus = BotRecord['status'];

export interface LocalLiveLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'CMD' | 'SYSTEM';
  source: string;
  message: string;
}

export interface LocalBotTelemetry {
  health: number;
  food: number;
  position: { x: number; y: number; z: number } | null;
  yaw: number;
  pitch: number;
  quickBarSlot: number;
  dimension: string;
  playersOnline: number;
  uptimeMs: number;
}

const liveControlSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('state'),
    control: z.enum(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']),
    state: z.boolean(),
  }),
  z.object({ kind: z.literal('release_all') }),
  z.object({
    kind: z.literal('look_delta'),
    dYaw: z.number().finite().min(-Math.PI).max(Math.PI),
    dPitch: z.number().finite().min(-Math.PI).max(Math.PI),
  }),
  z.object({
    kind: z.literal('look'),
    yaw: z.number().finite(),
    pitch: z.number().finite(),
  }),
  z.object({
    kind: z.literal('hotbar'),
    slot: z.number().int().min(0).max(8),
  }),
  z.object({ kind: z.literal('primary') }),
  z.object({ kind: z.literal('secondary') }),
]);

const REGISTER_PATTERNS = [/\/register\b/i, /\bplease\s+register\b/i, /đăng\s*ký/i, /\/reg\s+</i];
const LOGIN_PATTERNS = [/\/login\b/i, /\bplease\s+login\b/i, /đăng\s*nhập/i, /\/l\s+</i];
const ALREADY_REG_PATTERNS = [/already\s+registered/i, /đã\s*đăng\s*ký/i, /already\s+exists/i];
const WRONG_PASS_PATTERNS = [/wrong\s+password/i, /incorrect\s+password/i, /sai\s*mật\s*khẩu/i];
const AUTH_OK_PATTERNS = [
  /successfully\s+(logged\s+in|registered)/i,
  /welcome\s+back/i,
  /đăng\s*(nhập|ký)\s*thành\s*công/i,
];

interface ManagedLocalBot {
  botId: string;
  ownerId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bot: any | null;
  status: BotStatus;
  spawned: boolean;
  manualStop: boolean;
  connectedAt: number | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  connectTimer: NodeJS.Timeout | null;
  lastError: string | null;
  authState: BotRecord['inGameAuthState'];
  registerAttempts: number;
  loginAttempts: number;
  lastAuthSendAt: number;
  password: string | null;
  snapshot: BotRecord;
}

function loadMineflayer(): { createBot: (opts: Record<string, unknown>) => unknown } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('mineflayer') as { createBot: (opts: Record<string, unknown>) => unknown };
  } catch {
    throw new Error('Core Mineflayer chưa sẵn sàng trên runtime này (thiếu module mineflayer).');
  }
}

export class LocalBotRunner {
  private readonly bots = new Map<string, ManagedLocalBot>();
  private readonly liveLogs = new Map<string, LocalLiveLogEntry[]>();

  constructor(private readonly db: PanelDatabase) {}

  public isRunningLocally(botId: string): boolean {
    const m = this.bots.get(botId);
    return Boolean(m && m.status !== 'STOPPED' && m.status !== 'ERROR');
  }

  public async ensureBotRunning(botRecord: BotRecord): Promise<void> {
    if (this.isRunningLocally(botRecord.id)) return;
    await this.startBot(botRecord);
  }

  public getLiveLogs(botId: string): LocalLiveLogEntry[] {
    return this.liveLogs.get(botId) ?? [];
  }

  public getTelemetry(botId: string): LocalBotTelemetry | null {
    const managed = this.bots.get(botId);
    if (!managed || !managed.bot || !managed.spawned) return null;
    const bot = managed.bot;
    const pos = bot.entity?.position;
    return {
      health: typeof bot.health === 'number' ? Math.round(bot.health * 10) / 10 : 20,
      food: typeof bot.food === 'number' ? Math.round(bot.food * 10) / 10 : 20,
      position: pos
        ? {
            x: Math.round(pos.x * 10) / 10,
            y: Math.round(pos.y * 10) / 10,
            z: Math.round(pos.z * 10) / 10,
          }
        : null,
      yaw: typeof bot.entity?.yaw === 'number' ? Math.round(bot.entity.yaw * 100) / 100 : 0,
      pitch: typeof bot.entity?.pitch === 'number' ? Math.round(bot.entity.pitch * 100) / 100 : 0,
      quickBarSlot: typeof bot.quickBarSlot === 'number' ? bot.quickBarSlot : 0,
      dimension: String(bot.game?.dimension || 'overworld'),
      playersOnline: bot.players ? Object.keys(bot.players).length : 0,
      uptimeMs: managed.connectedAt ? Date.now() - managed.connectedAt : 0,
    };
  }

  public getLiveSnapshot(botRecord: BotRecord): BotRecord {
    const managed = this.bots.get(botRecord.id);
    if (!managed) return botRecord;
    return {
      ...botRecord,
      status: managed.status,
      inGameAuthState: managed.authState,
      uptimeMs: managed.connectedAt ? Date.now() - managed.connectedAt : botRecord.uptimeMs,
    };
  }

  public async startBot(botRecord: BotRecord): Promise<void> {
    const existing = this.bots.get(botRecord.id);
    if (
      existing &&
      (existing.status === 'ONLINE' ||
        existing.status === 'CONNECTING' ||
        existing.status === 'AUTHENTICATING')
    ) {
      return;
    }

    const envelope = await this.db.getBotCredentialEnvelope(botRecord.id);
    const password = envelope ? decryptSecret(envelope) : null;

    if (existing) {
      this.cleanupRuntime(existing);
    }

    const managed: ManagedLocalBot = {
      botId: botRecord.id,
      ownerId: botRecord.ownerId,
      bot: null,
      status: 'QUEUED',
      spawned: false,
      manualStop: false,
      connectedAt: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      connectTimer: null,
      lastError: null,
      authState: 'idle',
      registerAttempts: 0,
      loginAttempts: 0,
      lastAuthSendAt: 0,
      password,
      snapshot: { ...botRecord, workerId: LOCAL_PANEL_WORKER_ID },
    };

    this.bots.set(botRecord.id, managed);
    this.pushLiveLog(botRecord.id, 'SYSTEM', 'PANEL_CORE', `Khởi chạy ${botRecord.mcUsername} -> ${botRecord.host}:${botRecord.port}`);
    await this.persistStatus(managed, 'QUEUED', 'Đang khởi chạy trực tiếp trên Panel Core');
    this.connectInternal(managed, false);
  }

  public async stopBot(botId: string): Promise<void> {
    const managed = this.bots.get(botId);
    if (!managed) return;
    managed.manualStop = true;
    this.cleanupRuntime(managed);
    this.pushLiveLog(botId, 'SYSTEM', 'PANEL_CORE', 'Bot đã dừng sạch sẽ trên Panel Core.');
    await this.persistStatus(managed, 'STOPPED', 'Đã dừng bot trên Panel Core');
    await this.appendLog(managed, 'BOT_LOG', 'Bot đã dừng sạch sẽ trên Panel Core.');
  }

  public async reconnectBot(botRecord: BotRecord): Promise<void> {
    const managed = this.bots.get(botRecord.id);
    if (!managed) {
      await this.startBot(botRecord);
      return;
    }
    managed.manualStop = false;
    managed.reconnectAttempts = 0;
    managed.snapshot = { ...botRecord, workerId: LOCAL_PANEL_WORKER_ID };
    this.pushLiveLog(botRecord.id, 'SYSTEM', 'PANEL_CORE', 'Đang kết nối lại tới server...');
    this.connectInternal(managed, true);
  }

  public sendChat(botId: string, message: string): void {
    const managed = this.bots.get(botId);
    if (!managed || !managed.bot || !managed.spawned) {
      throw new Error('Bot chưa ONLINE trên Panel Core.');
    }
    managed.bot.chat(message);
  }

  public applyControl(botId: string, rawControl: unknown): void {
    const managed = this.bots.get(botId);
    if (!managed || !managed.bot || !managed.spawned) {
      throw new Error('Bot chưa ONLINE để điều khiển.');
    }
    const ctrl = liveControlSchema.parse(rawControl);
    const bot = managed.bot;
    const maxPitch = Math.PI / 2 - 0.01;
    const clampPitch = (p: number) => Math.max(-maxPitch, Math.min(maxPitch, p));

    switch (ctrl.kind) {
      case 'state':
        bot.setControlState(ctrl.control, ctrl.state);
        return;
      case 'release_all':
        bot.clearControlStates();
        return;
      case 'look_delta': {
        const yaw = (bot.entity?.yaw ?? 0) + ctrl.dYaw;
        const pitch = clampPitch((bot.entity?.pitch ?? 0) + ctrl.dPitch);
        void bot.look(yaw, pitch, true).catch(() => {});
        return;
      }
      case 'look':
        void bot.look(ctrl.yaw, clampPitch(ctrl.pitch), true).catch(() => {});
        return;
      case 'hotbar':
        bot.setQuickBarSlot(ctrl.slot);
        return;
      case 'primary': {
        const target = bot.nearestEntity(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e: any) =>
            e !== bot.entity &&
            Boolean(e.position) &&
            e.position.distanceTo(bot.entity.position) <= 3.5 &&
            (e.type === 'player' || e.type === 'mob' || e.type === 'hostile')
        );
        if (target) {
          bot.attack(target);
          return;
        }
        const block = bot.blockAtCursor(4.5);
        bot.swingArm('right', false);
        if (block && block.diggable) void bot.dig(block, true).catch(() => {});
        return;
      }
      case 'secondary': {
        const block = bot.blockAtCursor(4.5);
        if (block) void bot.activateBlock(block).catch(() => {});
        else bot.activateItem();
        return;
      }
    }
  }

  private connectInternal(managed: ManagedLocalBot, isReconnect: boolean): void {
    const mf = loadMineflayer();
    const cfg = managed.snapshot;
    this.cleanupRuntime(managed);
    managed.spawned = false;
    managed.registerAttempts = 0;
    managed.loginAttempts = 0;
    managed.lastAuthSendAt = 0;
    if (isReconnect && !cfg.autoAuth.handleOnReconnect) {
      managed.authState = 'idle';
    } else if (cfg.autoAuth.autoRegister || cfg.autoAuth.autoLogin) {
      managed.authState = 'awaiting_auth';
    } else {
      managed.authState = 'idle';
    }

    this.pushLiveLog(
      cfg.id,
      'INFO',
      'CONNECT',
      isReconnect ? `Đang reconnect tới ${cfg.host}:${cfg.port}...` : `Đang kết nối tới ${cfg.host}:${cfg.port}...`
    );
    void this.persistStatus(
      managed,
      isReconnect ? 'RECONNECTING' : 'CONNECTING',
      'Đang kết nối từ IP máy chủ Panel...'
    );

    const connectTimeoutMs = Math.max(10_000, cfg.reconnect.connectTimeoutMs || 25_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bot = mf.createBot({
      host: cfg.host,
      port: cfg.port,
      username: cfg.mcUsername,
      version: cfg.version === 'auto' ? false : cfg.version,
      auth: cfg.authMode,
      hideErrors: true,
      respawn: true,
      keepAlive: true,
      viewDistance: 'tiny',
      checkTimeoutInterval: Math.max(connectTimeoutMs, 30_000),
    }) as any;

    managed.bot = bot;

    managed.connectTimer = setTimeout(() => {
      if (!managed.spawned && managed.bot === bot && !managed.manualStop) {
        this.handleDisconnectOrError(managed, new Error('Hết thời gian chờ kết nối Minecraft'));
      }
    }, connectTimeoutMs);

    bot._client?.socket?.on?.('error', (err: unknown) => {
      if (managed.bot === bot) this.handleDisconnectOrError(managed, err);
    });
    bot._client?.on?.('error', (err: unknown) => {
      if (managed.bot === bot) this.handleDisconnectOrError(managed, err);
    });

    bot.on('login', () => {
      if (managed.bot !== bot || managed.manualStop) return;
      this.pushLiveLog(cfg.id, 'INFO', 'LOGIN', 'Đã đăng nhập server, đang chờ spawn...');
      void this.persistStatus(managed, 'AUTHENTICATING', 'Đã đăng nhập, đang chờ spawn');
    });

    bot.once('spawn', () => {
      if (managed.bot !== bot || managed.manualStop) return;
      if (managed.connectTimer) {
        clearTimeout(managed.connectTimer);
        managed.connectTimer = null;
      }
      managed.spawned = true;
      managed.reconnectAttempts = 0;
      managed.connectedAt = Date.now();
      managed.lastError = null;
      this.pushLiveLog(cfg.id, 'INFO', 'SPAWN', `Bot ${cfg.mcUsername} đã vào ${cfg.host}:${cfg.port} (ONLINE).`);
      void this.persistStatus(managed, 'ONLINE', 'Đã spawn vào server (Panel Core)');
      void this.appendLog(managed, 'BOT_LOG', `Bot ${cfg.mcUsername} đã vào ${cfg.host}:${cfg.port} bằng IP Panel.`);
    });

    bot.on('messagestr', (message: string) => {
      if (managed.bot !== bot || managed.manualStop) return;
      const clean = redactSecrets(String(message || '').trim());
      if (!clean) return;
      this.pushLiveLog(cfg.id, 'INFO', 'GAME_CHAT', clean);
      void this.handleServerMessage(managed, clean);
    });

    bot.on('death', () => {
      if (managed.bot !== bot || managed.manualStop) return;
      this.pushLiveLog(cfg.id, 'WARN', 'GAME_EVENT', 'Bot vừa bị hạ gục và sẽ tự hồi sinh.');
    });

    bot.on('kicked', (reason: unknown) => {
      if (managed.bot === bot) {
        this.handleDisconnectOrError(managed, new Error(`Bị kick: ${redactSecrets(String(reason))}`));
      }
    });

    bot.on('error', (err: Error) => {
      if (managed.bot === bot) this.handleDisconnectOrError(managed, err);
    });

    bot.on('end', (reason: string) => {
      if (managed.bot === bot && !managed.manualStop) {
        this.handleDisconnectOrError(managed, new Error(reason || 'Kết nối đóng'));
      }
    });
  }

  private async handleServerMessage(managed: ManagedLocalBot, text: string): Promise<void> {
    const cfg = managed.snapshot.autoAuth;
    if (!cfg.autoRegister && !cfg.autoLogin) return;
    if (
      managed.authState === 'authenticated' ||
      managed.authState === 'manual_required' ||
      managed.authState === 'failed'
    ) {
      return;
    }

    if (AUTH_OK_PATTERNS.some((re) => re.test(text))) {
      managed.authState = 'authenticated';
      this.pushLiveLog(managed.botId, 'INFO', 'AUTO_AUTH', 'Xác thực trong game thành công.');
      await this.persistStatus(managed, managed.status, 'Xác thực thành công');
      return;
    }

    if (WRONG_PASS_PATTERNS.some((re) => re.test(text))) {
      managed.authState = 'failed';
      this.pushLiveLog(managed.botId, 'ERROR', 'AUTO_AUTH', 'Server báo sai mật khẩu, đã dừng retry.');
      await this.persistStatus(managed, managed.status, 'Sai mật khẩu server');
      return;
    }

    const trySend = async (mode: 'register' | 'login') => {
      const now = Date.now();
      if (now - managed.lastAuthSendAt < 2500) return;
      if (!managed.password || !managed.bot || !managed.spawned) return;
      const tpl = mode === 'register' ? cfg.registerTemplate : cfg.loginTemplate;
      const cmd = tpl.replace(/\{password\}/g, managed.password);
      managed.lastAuthSendAt = now;
      if (mode === 'register') {
        managed.registerAttempts += 1;
        managed.authState = 'register_sent';
      } else {
        managed.loginAttempts += 1;
        managed.authState = 'login_sent';
      }
      managed.bot.chat(cmd);
      this.pushLiveLog(managed.botId, 'CMD', 'AUTO_AUTH', `Đã gửi lệnh ${mode} (ẩn mật khẩu).`);
      await this.persistStatus(managed, managed.status, `Đã gửi lệnh ${mode}`);
    };

    if (ALREADY_REG_PATTERNS.some((re) => re.test(text))) {
      if (cfg.autoLogin && managed.loginAttempts < 2) await trySend('login');
      else managed.authState = 'manual_required';
      return;
    }

    if (REGISTER_PATTERNS.some((re) => re.test(text)) && cfg.autoRegister && managed.registerAttempts < 2) {
      await trySend('register');
    } else if (LOGIN_PATTERNS.some((re) => re.test(text)) && cfg.autoLogin && managed.loginAttempts < 2) {
      await trySend('login');
    }
  }

  private handleDisconnectOrError(managed: ManagedLocalBot, err: unknown): void {
    const msg = redactSecrets(err instanceof Error ? err.message : String(err));
    managed.lastError = msg;
    this.cleanupRuntime(managed);

    if (managed.manualStop) {
      void this.persistStatus(managed, 'STOPPED', 'Đã dừng theo yêu cầu');
      return;
    }

    const { reconnect } = managed.snapshot;
    if (reconnect.enabled && managed.reconnectAttempts < reconnect.maxAttempts) {
      managed.reconnectAttempts += 1;
      const delay = Math.min(
        reconnect.maxDelayMs,
        reconnect.initialDelayMs * Math.pow(2, managed.reconnectAttempts - 1)
      );
      this.pushLiveLog(
        managed.botId,
        'WARN',
        'RECONNECT',
        `Mất kết nối (${msg}). Thử lại lần ${managed.reconnectAttempts}/${reconnect.maxAttempts} sau ${Math.round(delay / 1000)}s.`
      );
      void this.persistStatus(
        managed,
        'RECONNECTING',
        `Mất kết nối (${msg}). Thử lại ${managed.reconnectAttempts}/${reconnect.maxAttempts}`
      );
      managed.reconnectTimer = setTimeout(() => {
        if (!managed.manualStop) this.connectInternal(managed, true);
      }, delay);
    } else {
      this.pushLiveLog(managed.botId, 'ERROR', 'BOT_ERROR', msg);
      void this.persistStatus(managed, 'ERROR', msg);
      void this.appendLog(managed, 'BOT_ERROR', `Bot lỗi: ${msg}`);
    }
  }

  private cleanupRuntime(managed: ManagedLocalBot): void {
    managed.spawned = false;
    managed.connectedAt = null;
    if (managed.connectTimer) {
      clearTimeout(managed.connectTimer);
      managed.connectTimer = null;
    }
    if (managed.reconnectTimer) {
      clearTimeout(managed.reconnectTimer);
      managed.reconnectTimer = null;
    }
    const bot = managed.bot;
    managed.bot = null;
    if (!bot) return;

    try {
      if (bot._client) {
        bot._client.end?.('Stopped by Panel Core');
        bot._client.socket?.destroy?.();
        bot._client.removeAllListeners?.();
        bot._client.on?.('error', () => {});
        bot._client.socket?.removeAllListeners?.();
        bot._client.socket?.on?.('error', () => {});
      } else {
        bot.quit?.();
      }
      bot.removeAllListeners?.();
      bot.on?.('error', () => {});
    } catch {
      // ignore teardown errors
    }
  }

  private pushLiveLog(
    botId: string,
    level: LocalLiveLogEntry['level'],
    source: string,
    message: string
  ): void {
    const arr = this.liveLogs.get(botId) ?? [];
    arr.push({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
    });
    if (arr.length > 300) {
      arr.splice(0, arr.length - 300);
    }
    this.liveLogs.set(botId, arr);
  }

  private async persistStatus(managed: ManagedLocalBot, status: BotStatus, stage: string): Promise<void> {
    managed.status = status;
    const latest = (await this.db.getBotById(managed.botId)) ?? managed.snapshot;
    const now = new Date().toISOString();
    const updated: BotRecord = {
      ...latest,
      workerId: LOCAL_PANEL_WORKER_ID,
      status,
      stage,
      inGameAuthState: managed.authState,
      lastError: status === 'ONLINE' ? null : managed.lastError,
      lastConnectedAt: status === 'ONLINE' ? now : latest.lastConnectedAt,
      uptimeMs: managed.connectedAt ? Date.now() - managed.connectedAt : 0,
      updatedAt: now,
    };
    managed.snapshot = updated;
    await this.db.saveBot(updated);
  }

  private async appendLog(managed: ManagedLocalBot, action: 'BOT_LOG' | 'BOT_ERROR', detail: string): Promise<void> {
    await this.db.appendAuditLog({
      id: crypto.randomUUID(),
      actorId: managed.ownerId,
      action,
      targetType: 'bot',
      targetId: managed.botId,
      detail,
      createdAt: new Date().toISOString(),
    });
  }
}
