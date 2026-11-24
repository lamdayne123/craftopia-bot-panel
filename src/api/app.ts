import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { BillingService } from '../services/BillingService';
import { LOCAL_PANEL_WORKER_ID, LocalBotRunner } from '../services/LocalBotRunner';
import { OrchestratorService } from '../services/OrchestratorService';
import { RealtimePublisher } from '../services/RealtimePublisher';
import { PanelDatabase } from '../storage/PanelDatabase';
import { BotRecord, UserRecord } from '../types';
import { encryptSecret, hashPassword, redactSecrets, sha256, verifyPassword } from '../utils/crypto';

export const SESSION_COOKIE = 'craftopia_panel_session';

interface AuthedRequest extends Request {
  user?: Omit<UserRecord, 'passwordHash' | 'salt'>;
  sessionTokenHash?: string;
}

const registerSchema = z.object({
  username: z.string().trim().min(2).max(32),
  email: z.string().trim().email().max(100),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const createBotSchema = z.object({
  idempotencyKey: z.string().trim().min(4).max(80).optional(),
  engine: z.enum(['java', 'bedrock']).default('java'),
  name: z.string().trim().min(1).max(40),
  mcUsername: z.string().trim().min(1).max(32),
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535).default(25565),
  version: z.string().trim().min(2).max(20).default('1.21.4'),
  authMode: z.enum(['offline', 'microsoft']).default('offline'),
  serverPassword: z.string().max(128).optional(),
  autoStart: z.boolean().default(true),
  autoAuth: z
    .object({
      autoRegister: z.boolean().default(false),
      autoLogin: z.boolean().default(false),
      registerTemplate: z.string().trim().min(2).max(160).default('/register {password} {password}'),
      loginTemplate: z.string().trim().min(2).max(160).default('/login {password}'),
      handleOnReconnect: z.boolean().default(true),
    })
    .default({
      autoRegister: false,
      autoLogin: false,
      registerTemplate: '/register {password} {password}',
      loginTemplate: '/login {password}',
      handleOnReconnect: true,
    }),
  reconnect: z
    .object({
      enabled: z.boolean().default(true),
      maxAttempts: z.number().int().min(0).max(20).default(5),
      initialDelayMs: z.number().int().min(1000).max(60000).default(3000),
      maxDelayMs: z.number().int().min(2000).max(300000).default(60000),
      connectTimeoutMs: z.number().int().min(3000).max(60000).default(25000),
    })
    .default({
      enabled: true,
      maxAttempts: 5,
      initialDelayMs: 3000,
      maxDelayMs: 60000,
      connectTimeoutMs: 25000,
    }),
});

export interface PanelAppContext {
  app: Express;
  db: PanelDatabase;
  realtime: RealtimePublisher;
  orchestrator: OrchestratorService;
  billing: BillingService;
  localRunner: LocalBotRunner;
}

export function createPanelApp(options?: {
  db?: PanelDatabase;
  realtime?: RealtimePublisher;
  orchestrator?: OrchestratorService;
}): PanelAppContext {
  const db = options?.db ?? new PanelDatabase();
  const realtime = options?.realtime ?? new RealtimePublisher();
  const orchestrator = options?.orchestrator ?? new OrchestratorService(db, realtime);
  const billing = new BillingService(db);
  const localRunner = new LocalBotRunner(db);
  const workerBotLogs = new Map<
    string,
    Array<{ id: string; timestamp: string; level: 'INFO' | 'WARN' | 'ERROR' | 'CMD' | 'SYSTEM'; source: string; message: string }>
  >();

  const pushWorkerBotLog = (
    botId: string,
    level: 'INFO' | 'WARN' | 'ERROR' | 'CMD' | 'SYSTEM',
    source: string,
    message: string
  ) => {
    const arr = workerBotLogs.get(botId) ?? [];
    arr.push({
      id: `wlog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      source,
      message: redactSecrets(message),
    });
    if (arr.length > 300) arr.splice(0, arr.length - 300);
    workerBotLogs.set(botId, arr);
  };

  const app = express();
  app.use(
    express.json({
      limit: '512kb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(cookieParser());

  const sanitizeUser = (u: Omit<UserRecord, 'passwordHash' | 'salt'> | UserRecord) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    displayName: u.displayName,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    discordId: u.discordId,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  });

  // Simple per-IP rate limiter for auth & sensitive actions
  const rateHits = new Map<string, { count: number; resetAt: number }>();
  const rateLimit = (maxHits: number, windowMs: number) => (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.path}:${req.ip || 'unknown'}`;
    const now = Date.now();
    const rec = rateHits.get(key);
    if (!rec || rec.resetAt <= now) {
      rateHits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    rec.count += 1;
    if (rec.count > maxHits) {
      res.status(429).json({ error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' });
      return;
    }
    next();
  };

  const SESSION_SECRET =
    process.env.SESSION_SECRET?.trim() ||
    process.env.CREDENTIAL_ENCRYPTION_KEY?.trim() ||
    'craftopia-cafe-default-session-secret';

  const issueSessionToken = (user: Pick<UserRecord, 'id' | 'username' | 'email' | 'role'>): string => {
    const payload = Buffer.from(
      JSON.stringify({
        uid: user.id,
        un: user.username,
        em: user.email,
        rl: user.role,
        exp: Date.now() + 7 * 24 * 3600 * 1000,
      }),
      'utf8'
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  };

  const verifySessionToken = (
    token: string
  ): { uid: string; un: string; em: string; rl: 'user' | 'admin'; exp: number } | null => {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        uid: string;
        un: string;
        em: string;
        rl: 'user' | 'admin';
        exp: number;
      };
      if (!parsed.uid || !parsed.exp || parsed.exp <= Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const requireAuth = async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const rawToken = req.cookies?.[SESSION_COOKIE];
    if (!rawToken || typeof rawToken !== 'string') {
      res.status(401).json({ error: 'Chưa đăng nhập.' });
      return;
    }
    const tokenHash = sha256(rawToken);
    const session = await db.findValidSession(tokenHash);
    if (session) {
      const user = await db.findUserById(session.userId);
      if (!user) {
        res.status(401).json({ error: 'Tài khoản không tồn tại.' });
        return;
      }
      const { passwordHash: _p, salt: _s, ...publicUser } = user;
      req.user = publicUser;
      req.sessionTokenHash = tokenHash;
      next();
      return;
    }

    // Stateless HMAC fallback for serverless/multi-instance deployments without shared session DB
    const verified = verifySessionToken(rawToken);
    if (!verified) {
      res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
      return;
    }
    const existing =
      (await db.findUserById(verified.uid)) ?? (await db.findUserByUsername(verified.un));
    if (existing) {
      const { passwordHash: _p, salt: _s, ...publicUser } = existing;
      req.user = publicUser;
    } else {
      const now = new Date().toISOString();
      req.user = {
        id: verified.uid,
        username: verified.un,
        email: verified.em,
        role: verified.rl,
        createdAt: now,
        updatedAt: now,
      };
    }
    req.sessionTokenHash = tokenHash;
    next();
  };

  const requireAdmin = (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Chỉ quản trị viên mới có quyền truy cập.' });
      return;
    }
    next();
  };

  const setSessionCookie = (res: Response, rawToken: string) => {
    res.cookie(SESSION_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
      path: '/',
    });
  };

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      postgres: db.isPostgres(),
      managedRealtime: realtime.isManagedConfigured(),
      bedrockStatus: 'COMING_SOON',
    });
  });

  // Auth routes
  app.post('/api/auth/register', rateLimit(15, 60_000), async (req, res) => {
    try {
      const parsed = registerSchema.parse(req.body);
      const existingUsers = await db.listUsers();
      const role = existingUsers.length === 0 ? 'admin' : 'user';
      const { hash, salt } = hashPassword(parsed.password);
      const now = new Date().toISOString();
      const user: UserRecord = {
        id: crypto.randomUUID(),
        username: parsed.username,
        email: parsed.email,
        passwordHash: hash,
        salt,
        role,
        createdAt: now,
        updatedAt: now,
      };
      await db.createUser(user);

      const rawToken = issueSessionToken(user);
      await db.createSession({
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        revokedAt: null,
        createdAt: now,
      });
      setSessionCookie(res, rawToken);
      res.status(201).json({
        user: sanitizeUser(user),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Đăng ký thất bại.' });
    }
  });

  app.post('/api/auth/login', rateLimit(15, 60_000), async (req, res) => {
    try {
      const parsed = loginSchema.parse(req.body);
      const user = await db.findUserByUsername(parsed.username);
      if (!user || !verifyPassword(parsed.password, user.passwordHash, user.salt)) {
        res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
        return;
      }
      const rawToken = issueSessionToken(user);
      await db.createSession({
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        revokedAt: null,
        createdAt: new Date().toISOString(),
      });
      setSessionCookie(res, rawToken);
      res.json({
        user: sanitizeUser(user),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Đăng nhập thất bại.' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req: AuthedRequest, res) => {
    if (req.sessionTokenHash) {
      await db.revokeSession(req.sessionTokenHash);
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthedRequest, res) => {
    const quota = await billing.getSlotQuota(req.user!.id);
    res.json({ user: sanitizeUser(req.user!), quota });
  });

  const profileSchema = z.object({
    displayName: z.string().trim().max(40).optional(),
    bio: z.string().trim().max(240).optional(),
    avatarUrl: z
      .string()
      .max(260_000)
      .refine(
        (v) =>
          v === '' ||
          /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) ||
          /^https:\/\/cdn\.discordapp\.com\//.test(v),
        'Ảnh đại diện không hợp lệ hoặc quá dung lượng.'
      )
      .optional(),
  });

  app.put('/api/account/profile', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const parsed = profileSchema.parse(req.body);
      const updated = await db.updateUserProfile(req.user!.id, {
        displayName: parsed.displayName,
        bio: parsed.bio,
        avatarUrl: parsed.avatarUrl,
      });
      if (!updated) {
        res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
        return;
      }
      res.json({ user: sanitizeUser(updated) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Cập nhật hồ sơ thất bại.' });
    }
  });

  // Discord OAuth2 Login
  const DISCORD_STATE_COOKIE = 'craftopia_oauth_state';
  const getDiscordRedirectUri = (req: Request) => {
    if (process.env.DISCORD_REDIRECT_URI?.trim()) return process.env.DISCORD_REDIRECT_URI.trim();
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3001').split(',')[0].trim();
    return `${proto}://${host}/api/auth/discord/callback`;
  };

  app.get('/api/auth/discord', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID?.trim();
    const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      res.redirect('/?auth_error=discord_not_configured');
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie(DISCORD_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: getDiscordRedirectUri(req),
      scope: 'identify email',
      state,
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  });

  app.get('/api/auth/discord/callback', async (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID?.trim();
    const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      res.redirect('/?auth_error=discord_not_configured');
      return;
    }
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const savedState = String(req.cookies?.[DISCORD_STATE_COOKIE] || '');
    res.clearCookie(DISCORD_STATE_COOKIE, { path: '/' });

    if (!code || !state || !savedState || state !== savedState) {
      res.redirect('/?auth_error=discord_state_invalid');
      return;
    }

    try {
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: getDiscordRedirectUri(req),
        }).toString(),
      });
      if (!tokenRes.ok) {
        res.redirect('/?auth_error=discord_token_failed');
        return;
      }
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        res.redirect('/?auth_error=discord_token_failed');
        return;
      }

      const meRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!meRes.ok) {
        res.redirect('/?auth_error=discord_user_failed');
        return;
      }
      const dUser = (await meRes.json()) as {
        id: string;
        username: string;
        global_name?: string | null;
        email?: string | null;
        avatar?: string | null;
      };

      const discordAvatar = dUser.avatar
        ? `https://cdn.discordapp.com/avatars/${dUser.id}/${dUser.avatar}.png?size=128`
        : undefined;
      const email = dUser.email || `${dUser.id}@discord.local`;

      let user = await db.findUserByDiscordId(dUser.id);
      if (!user && dUser.email) {
        user = await db.findUserByEmail(dUser.email);
      }

      const now = new Date().toISOString();
      if (!user) {
        const baseName = (dUser.username || `dc_${dUser.id.slice(0, 6)}`).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'discord_user';
        let uniqueUsername = baseName;
        if (await db.findUserByUsername(uniqueUsername)) {
          uniqueUsername = `${baseName.slice(0, 14)}_${dUser.id.slice(-4)}`;
        }
        const existingUsers = await db.listUsers();
        const { hash, salt } = hashPassword(crypto.randomBytes(24).toString('hex'));
        user = {
          id: crypto.randomUUID(),
          username: uniqueUsername,
          email,
          passwordHash: hash,
          salt,
          role: existingUsers.length === 0 ? 'admin' : 'user',
          displayName: dUser.global_name || dUser.username,
          avatarUrl: discordAvatar,
          discordId: dUser.id,
          createdAt: now,
          updatedAt: now,
        };
        await db.createUser(user);
      } else {
        await db.updateUserProfile(user.id, {
          discordId: dUser.id,
          ...(user.avatarUrl ? {} : discordAvatar ? { avatarUrl: discordAvatar } : {}),
          ...(user.displayName ? {} : dUser.global_name ? { displayName: dUser.global_name } : {}),
        });
      }

      const rawToken = issueSessionToken(user);
      await db.createSession({
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        revokedAt: null,
        createdAt: now,
      });
      setSessionCookie(res, rawToken);
      res.redirect('/');
    } catch {
      res.redirect('/?auth_error=discord_oauth_error');
    }
  });

  app.delete('/api/account', requireAuth, async (req: AuthedRequest, res) => {
    await db.deleteUser(req.user!.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // Store / Plans & Verified Payment Webhook
  app.get('/api/plans', async (_req, res) => {
    const plans = await billing.listPlans();
    res.json({ plans });
  });

  app.post('/api/payments/checkout', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const { planId, provider = 'vietqr', idempotencyKey } = req.body as {
        planId?: string;
        provider?: string;
        idempotencyKey?: string;
      };
      if (!planId || !idempotencyKey) {
        res.status(400).json({ error: 'Thiếu planId hoặc idempotencyKey.' });
        return;
      }
      const result = await billing.createCheckout(req.user!.id, planId, provider, idempotencyKey);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo giao dịch.' });
    }
  });

  app.post('/api/payments/webhook', async (req: Request & { rawBody?: string }, res) => {
    try {
      const sig = String(req.headers['x-webhook-signature'] || '');
      const paymentId = String((req.body as { paymentId?: string })?.paymentId || '');
      if (!paymentId) {
        res.status(400).json({ error: 'Thiếu paymentId.' });
        return;
      }
      const result = await billing.verifyPaymentWebhook(req.rawBody || JSON.stringify(req.body), sig, paymentId);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Xác minh webhook thất bại.' });
    }
  });

  const withLiveUptime = (bot: BotRecord): BotRecord => {
    if (bot.workerId === LOCAL_PANEL_WORKER_ID) {
      return localRunner.getLiveSnapshot(bot);
    }
    if (bot.status === 'ONLINE' && bot.lastConnectedAt) {
      const started = Date.parse(bot.lastConnectedAt);
      if (Number.isFinite(started)) {
        return { ...bot, uptimeMs: Math.max(bot.uptimeMs || 0, Math.max(0, Date.now() - started)) };
      }
    }
    return bot;
  };

  // Overview & Activity
  app.get('/api/overview', requireAuth, async (req: AuthedRequest, res) => {
    const [rawBots, quota, logs, workers] = await Promise.all([
      db.listBotsByOwner(req.user!.id),
      billing.getSlotQuota(req.user!.id),
      db.listAuditLogs(req.user!.id, 25),
      db.listWorkers(),
    ]);
    const bots = rawBots.map(withLiveUptime);
    const healthyWorkers = workers.filter((w) => !w.revokedAt && w.status === 'HEALTHY').length;
    res.json({
      totalBots: bots.length,
      onlineBots: bots.filter((b) => b.status === 'ONLINE').length,
      connectingBots: bots.filter((b) => ['QUEUED', 'CONNECTING', 'AUTHENTICATING', 'RECONNECTING'].includes(b.status)).length,
      offlineBots: bots.filter((b) => b.status === 'STOPPED').length,
      errorBots: bots.filter((b) => b.status === 'ERROR').length,
      quota,
      realtimeConnected: realtime.isManagedConfigured() || healthyWorkers > 0,
      healthyWorkers,
      recentActivity: logs,
      errors: bots.filter((b) => b.status === 'ERROR' && b.lastError).map((b) => ({ botId: b.id, name: b.name, error: b.lastError })),
    });
  });

  // Bots CRUD & Orchestration (Strict ownership / Anti-IDOR)
  app.get('/api/bots', requireAuth, async (req: AuthedRequest, res) => {
    const rawBots = req.user!.role === 'admin' && req.query.all === '1'
      ? await db.listAllBots()
      : await db.listBotsByOwner(req.user!.id);
    res.json({ bots: rawBots.map(withLiveUptime) });
  });

  app.post('/api/bots', requireAuth, rateLimit(20, 60_000), async (req: AuthedRequest, res) => {
    try {
      const parsed = createBotSchema.parse(req.body);
      if (parsed.engine === 'bedrock') {
        res.status(400).json({ error: 'Minecraft Bedrock hiện đang ở trạng thái Coming Soon, chưa hỗ trợ tạo bot.' });
        return;
      }

      if (parsed.idempotencyKey) {
        const existing = await db.getBotByIdempotencyKey(parsed.idempotencyKey);
        if (existing && existing.ownerId === req.user!.id) {
          res.json({ bot: existing, deduplicated: true });
          return;
        }
      }

      const quota = await billing.getSlotQuota(req.user!.id);
      if (quota.remainingSlots <= 0) {
        res.status(403).json({ error: `Bạn đã dùng hết ${quota.maxBots} slot bot trong gói hiện tại. Vui lòng nâng cấp tại Store.` });
        return;
      }

      const candidateWorker = await orchestrator.selectHealthyWorker();
      const isAdmin = req.user!.role === 'admin';
      if (!candidateWorker && !isAdmin) {
        res.status(503).json({ error: 'Hiện chưa có Worker nào đang online và còn slot trống.' });
        return;
      }
      const assignedWorkerId = candidateWorker ? candidateWorker.id : LOCAL_PANEL_WORKER_ID;

      const now = new Date().toISOString();
      const bot: BotRecord = {
        id: crypto.randomUUID(),
        ownerId: req.user!.id,
        name: parsed.name,
        mcUsername: parsed.mcUsername,
        host: parsed.host,
        port: parsed.port,
        version: parsed.version,
        authMode: parsed.authMode,
        workerId: assignedWorkerId,
        status: 'STOPPED',
        stage: candidateWorker ? 'Đã khởi tạo' : 'Đã khởi tạo (Panel Core)',
        uptimeMs: 0,
        lastConnectedAt: null,
        inGameAuthState: 'idle',
        lastError: null,
        autoAuth: parsed.autoAuth,
        reconnect: parsed.reconnect,
        credentialConfigured: Boolean(parsed.serverPassword),
        idempotencyKey: parsed.idempotencyKey,
        createdAt: now,
        updatedAt: now,
      };

      await db.saveBot(bot);
      if (parsed.serverPassword) {
        await db.saveBotCredential(bot.id, req.user!.id, encryptSecret(parsed.serverPassword));
      }

      await db.appendAuditLog({
        id: crypto.randomUUID(),
        actorId: req.user!.id,
        action: 'BOT_CREATED',
        targetType: 'bot',
        targetId: bot.id,
        detail: `Tạo bot ${bot.name} (${bot.host}:${bot.port})`,
        createdAt: now,
      });

      if (parsed.autoStart) {
        if (assignedWorkerId === LOCAL_PANEL_WORKER_ID) {
          await localRunner.startBot(bot);
        } else {
          await orchestrator.dispatchStartBot(bot, false);
        }
      }

      const saved = await db.getBotById(bot.id);
      res.status(201).json({ bot: saved ?? bot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể tạo bot.' });
    }
  });

  const getOwnedBot = async (req: AuthedRequest, res: Response): Promise<BotRecord | null> => {
    const bot = await db.getBotById(String(req.params.id));
    if (!bot) {
      res.status(404).json({ error: 'Không tìm thấy bot.' });
      return null;
    }
    if (bot.ownerId !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Bạn không có quyền truy cập bot này.' });
      return null;
    }
    return bot;
  };

  app.get('/api/bots/:id/live', requireAuth, async (req: AuthedRequest, res) => {
    const bot = await getOwnedBot(req, res);
    if (!bot) return;
    if (bot.workerId === LOCAL_PANEL_WORKER_ID) {
      if (req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Bot nội bộ Panel Core chỉ dành cho tài khoản Admin.' });
        return;
      }
      res.json({
        bot: localRunner.getLiveSnapshot(bot),
        logs: localRunner.getLiveLogs(bot.id),
        telemetry: localRunner.getTelemetry(bot.id),
      });
      return;
    }
    res.json({ bot: withLiveUptime(bot), logs: workerBotLogs.get(bot.id) ?? [], telemetry: null });
  });

  app.post('/api/bots/:id/start', requireAuth, async (req: AuthedRequest, res) => {
    const bot = await getOwnedBot(req, res);
    if (!bot) return;
    try {
      if (bot.workerId === LOCAL_PANEL_WORKER_ID) {
        if (req.user!.role !== 'admin') {
          res.status(403).json({ error: 'Bot nội bộ Panel Core chỉ dành cho tài khoản Admin.' });
          return;
        }
        await localRunner.startBot(bot);
        res.json({ ok: true, workerId: LOCAL_PANEL_WORKER_ID, mode: 'local-panel-core' });
        return;
      }
      try {
        const dispatch = await orchestrator.dispatchStartBot(bot, false);
        res.json({ ok: true, ...dispatch });
      } catch (err) {
        if (req.user!.role === 'admin') {
          await localRunner.startBot(bot);
          res.json({ ok: true, workerId: LOCAL_PANEL_WORKER_ID, mode: 'local-panel-core' });
          return;
        }
        throw err;
      }
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : 'Không thể khởi động bot.' });
    }
  });

  app.post('/api/bots/:id/stop', requireAuth, async (req: AuthedRequest, res) => {
    const bot = await getOwnedBot(req, res);
    if (!bot) return;
    if (bot.workerId === LOCAL_PANEL_WORKER_ID || localRunner.isRunningLocally(bot.id)) {
      if (req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Bot nội bộ Panel Core chỉ dành cho tài khoản Admin.' });
        return;
      }
      await localRunner.stopBot(bot.id);
      res.json({ ok: true });
      return;
    }
    if (bot.workerId) {
      await realtime.publish({ type: 'STOP_BOT', workerId: bot.workerId, botId: bot.id, payload: {} });
    }
    await db.saveBot({ ...bot, status: 'STOPPED', stage: 'Đã gửi lệnh dừng', updatedAt: new Date().toISOString() });
    res.json({ ok: true });
  });

  app.post('/api/bots/:id/reconnect', requireAuth, async (req: AuthedRequest, res) => {
    const bot = await getOwnedBot(req, res);
    if (!bot) return;
    if (bot.workerId === LOCAL_PANEL_WORKER_ID || localRunner.isRunningLocally(bot.id)) {
      if (req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Bot nội bộ Panel Core chỉ dành cho tài khoản Admin.' });
        return;
      }
      await localRunner.reconnectBot(bot);
      res.json({ ok: true, workerId: LOCAL_PANEL_WORKER_ID, mode: 'local-panel-core' });
      return;
    }
    if (!bot.workerId) {
      if (req.user!.role === 'admin' && !(await orchestrator.selectHealthyWorker())) {
        await localRunner.reconnectBot(bot);
        res.json({ ok: true, workerId: LOCAL_PANEL_WORKER_ID, mode: 'local-panel-core' });
        return;
      }
      const dispatch = await orchestrator.dispatchStartBot(bot, false);
      res.json({ ok: true, ...dispatch });
      return;
    }
    await realtime.publish({ type: 'RECONNECT_BOT', workerId: bot.workerId, botId: bot.id, payload: {} });
    res.json({ ok: true });
  });

  app.post('/api/bots/:id/control', requireAuth, async (req: AuthedRequest, res) => {
    const bot = await getOwnedBot(req, res);
    if (!bot) return;
    if (bot.workerId === LOCAL_PANEL_WORKER_ID || localRunner.isRunningLocally(bot.id)) {
      if (req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Bot nội bộ Panel Core chỉ dành cho tài khoản Admin.' });
        return;
      }
      try {
        localRunner.applyControl(bot.id, req.body);
        res.json({ ok: true, mode: 'local-panel-core' });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể điều khiển bot.' });
      }
      return;
    }
    if (!bot.workerId || bot.status !== 'ONLINE') {
      res.status(400).json({ error: 'Bot chưa ONLINE trên worker.' });
      return;
    }
    const { requestId } = await realtime.publish({
      type: 'BOT_CONTROL',
      workerId: bot.workerId,
      botId: bot.id,
      payload: { control: req.body },
    });
    res.json({ ok: true, requestId });
  });

  app.post('/api/bots/:id/chat', requireAuth, async (req: AuthedRequest, res) => {
    const bot = await getOwnedBot(req, res);
    if (!bot) return;
    const message = String((req.body as { message?: string })?.message || '').trim();
    if (!message || message.length > 256) {
      res.status(400).json({ error: 'Tin nhắn không hợp lệ.' });
      return;
    }
    if (bot.workerId === LOCAL_PANEL_WORKER_ID || localRunner.isRunningLocally(bot.id)) {
      if (req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Bot nội bộ Panel Core chỉ dành cho tài khoản Admin.' });
        return;
      }
      try {
        localRunner.sendChat(bot.id, message);
        res.json({ ok: true, mode: 'local-panel-core' });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Bot chưa ONLINE để gửi chat.' });
      }
      return;
    }
    if (!bot.workerId || bot.status !== 'ONLINE') {
      res.status(400).json({ error: 'Bot chưa ONLINE để gửi chat.' });
      return;
    }
    await realtime.publish({ type: 'BOT_CHAT', workerId: bot.workerId, botId: bot.id, payload: { message } });
    res.json({ ok: true });
  });

  app.delete('/api/bots/:id', requireAuth, async (req: AuthedRequest, res) => {
    const bot = await getOwnedBot(req, res);
    if (!bot) return;
    if (bot.workerId === LOCAL_PANEL_WORKER_ID || localRunner.isRunningLocally(bot.id)) {
      await localRunner.stopBot(bot.id);
    } else if (bot.workerId) {
      await realtime.publish({ type: 'STOP_BOT', workerId: bot.workerId, botId: bot.id, payload: {} });
    }
    await db.deleteBot(bot.id);
    await db.appendAuditLog({
      id: crypto.randomUUID(),
      actorId: req.user!.id,
      action: 'BOT_DELETED',
      targetType: 'bot',
      targetId: bot.id,
      detail: `Xóa bot ${bot.name}`,
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  });

  // Worker Ingestion Endpoints (Bearer workerToken)
  const requireWorkerAuth = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = String(req.headers.authorization || '');
    const workerId = String(req.headers['x-worker-id'] || (req.body as { workerId?: string })?.workerId || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!workerId || !token) {
      res.status(401).json({ error: 'Thiếu workerId hoặc Bearer token.' });
      return;
    }
    const w = await orchestrator.authenticateWorker(workerId, token);
    if (!w) {
      res.status(401).json({ error: 'Worker token không hợp lệ hoặc đã bị thu hồi.' });
      return;
    }
    (req as Request & { workerId?: string }).workerId = w.id;
    next();
  };

  app.post('/api/worker/heartbeat', requireWorkerAuth, async (req: Request & { workerId?: string }, res) => {
    const body = req.body as {
      activeBots?: number;
      maxBots?: number;
      rssMb?: number;
      heapUsedMb?: number;
      eventLoopLagMs?: number;
      draining?: boolean;
    };
    const updated = await orchestrator.recordHeartbeat(req.workerId!, {
      activeBots: Number(body.activeBots || 0),
      maxBots: Number(body.maxBots || 4),
      rssMb: Number(body.rssMb || 0),
      heapUsedMb: Number(body.heapUsedMb || 0),
      eventLoopLagMs: Number(body.eventLoopLagMs || 0),
      draining: Boolean(body.draining),
    });
    res.json({ ok: true, worker: updated });
  });

  app.get('/api/worker/commands', requireWorkerAuth, async (req: Request & { workerId?: string }, res) => {
    const waitMs = Math.max(0, Math.min(25_000, Number(req.query.waitMs ?? 15_000)));
    const commands = await realtime.drainCommands(req.workerId!, waitMs);
    res.json({ commands });
  });

  app.post('/api/worker/events', requireWorkerAuth, async (req: Request & { workerId?: string }, res) => {
    type WorkerEventBody = { type?: string; botId?: string; payload?: Record<string, unknown> };
    const rawBody = req.body as WorkerEventBody & { events?: WorkerEventBody[] };
    const list: WorkerEventBody[] = Array.isArray(rawBody.events) ? rawBody.events : [rawBody];

    for (const ev of list) {
      const { type, botId, payload } = ev;
      if (!botId || !payload) continue;
      const bot = await db.getBotById(botId);
      const assignment = await db.getBotAssignment(botId);
      if (!bot || assignment?.workerId !== req.workerId) continue;

      if (type === 'BOT_STATUS') {
        const status = (payload.status as BotRecord['status']) || bot.status;
        await db.saveBot({
          ...bot,
          status,
          stage: typeof payload.stage === 'string' ? payload.stage : bot.stage,
          uptimeMs: typeof payload.uptimeMs === 'number' ? payload.uptimeMs : bot.uptimeMs,
          inGameAuthState: typeof payload.inGameAuthState === 'string' ? payload.inGameAuthState : bot.inGameAuthState,
          lastError: typeof payload.lastError === 'string' ? redactSecrets(payload.lastError) : status === 'ONLINE' ? null : bot.lastError,
          lastConnectedAt: status === 'ONLINE' ? new Date().toISOString() : bot.lastConnectedAt,
          updatedAt: new Date().toISOString(),
        });
      } else if (type === 'BOT_LOG') {
        const rawLevel = String(payload.level || 'info').toLowerCase();
        const level =
          rawLevel === 'error' ? 'ERROR' : rawLevel === 'warn' ? 'WARN' : 'INFO';
        const message = String(payload.message || '').trim();
        if (message) {
          pushWorkerBotLog(botId, level, 'WORKER', message);
        }
      }
    }
    res.json({ ok: true });
  });

  // Admin-only routes
  app.get('/api/admin/workers', requireAuth, requireAdmin, async (_req, res) => {
    const workers = await db.listWorkers();
    res.json({ workers: workers.map(({ tokenHash: _omit, ...w }) => w) });
  });

  app.post('/api/admin/workers', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { name = 'Worker Node', maxBots = 4 } = req.body as { name?: string; maxBots?: number };
    const { worker, rawToken } = await orchestrator.createWorker(name, Number(maxBots));
    await db.appendAuditLog({
      id: crypto.randomUUID(),
      actorId: req.user!.id,
      action: 'WORKER_CREATED',
      targetType: 'worker',
      targetId: worker.id,
      detail: `Tạo worker ${worker.name} (MAX_BOTS=${worker.maxBots})`,
      createdAt: new Date().toISOString(),
    });
    const { tokenHash: _omit, ...pub } = worker;
    res.status(201).json({ worker: pub, workerToken: rawToken });
  });

  app.post('/api/admin/workers/:id/rotate-token', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    try {
      const { worker, rawToken } = await orchestrator.rotateWorkerToken(String(req.params.id), req.user!.id);
      const { tokenHash: _omit, ...pub } = worker;
      res.json({ worker: pub, workerToken: rawToken });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Không tìm thấy worker.' });
    }
  });

  app.post('/api/admin/workers/:id/revoke', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    try {
      const worker = await orchestrator.revokeWorker(String(req.params.id), req.user!.id);
      const { tokenHash: _omit, ...pub } = worker;
      res.json({ worker: pub });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Không tìm thấy worker.' });
    }
  });

  app.post('/api/admin/migrate', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const report = await orchestrator.evaluateHealthAndMigrate(req.user!.id);
    res.json(report);
  });

  app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
    const users = await db.listUsers();
    res.json({ users });
  });

  app.get('/api/admin/subscriptions', requireAuth, requireAdmin, async (_req, res) => {
    const subscriptions = await db.listAllSubscriptions();
    res.json({ subscriptions });
  });

  app.get('/api/admin/health', requireAuth, requireAdmin, async (_req, res) => {
    const [workers, bots, logs] = await Promise.all([
      db.listWorkers(),
      db.listAllBots(),
      db.listAuditLogs(undefined, 50),
    ]);
    res.json({
      postgres: db.isPostgres(),
      managedRealtime: realtime.isManagedConfigured(),
      workersCount: workers.length,
      healthyWorkers: workers.filter((w) => !w.revokedAt && w.status === 'HEALTHY').length,
      totalBots: bots.length,
      onlineBots: bots.filter((b) => b.status === 'ONLINE').length,
      auditLogs: logs,
    });
  });

  // Serve built frontend in standalone mode (Vercel serves client/dist directly via CDN)
  const clientDistCandidates = [
    path.resolve(process.cwd(), 'client', 'dist'),
    path.resolve(__dirname, '..', '..', 'client', 'dist'),
  ];
  const clientDist = clientDistCandidates.find((p) => fs.existsSync(p));
  if (clientDist) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return { app, db, realtime, orchestrator, billing, localRunner };
}
