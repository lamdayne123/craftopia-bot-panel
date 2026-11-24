import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

interface PgClientLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[] }>;
  release: () => void;
}

interface PgPoolLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[] }>;
  connect: () => Promise<PgClientLike>;
  end: () => Promise<void>;
}
import {
  AuditLogRecord,
  BotAssignment,
  BotRecord,
  CommandRecord,
  PaymentRecord,
  PlanRecord,
  SessionRecord,
  SubscriptionRecord,
  UserRecord,
  WorkerRecord,
} from '../types';

export interface LocalDbShape {
  users: UserRecord[];
  sessions: SessionRecord[];
  plans: PlanRecord[];
  subscriptions: SubscriptionRecord[];
  payments: PaymentRecord[];
  workers: WorkerRecord[];
  bots: BotRecord[];
  credentials: Record<string, { botId: string; ownerId: string; envelope: string; updatedAt: string }>;
  assignments: Record<string, BotAssignment>;
  commands: CommandRecord[];
  auditLogs: AuditLogRecord[];
}

const DEFAULT_PLANS: PlanRecord[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceVnd: 5000,
    maxBots: 2,
    durationDays: 30,
    features: ['2 bot Java đồng thời', 'Console & Live Chat', 'Auto-Register/Login'],
    active: true,
  },
  {
    id: 'basic',
    name: 'Basic',
    priceVnd: 10000,
    maxBots: 5,
    durationDays: 30,
    features: ['5 bot Java đồng thời', 'Auto-Migration khi worker lỗi', 'Live 3D Control'],
    active: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    priceVnd: 15000,
    maxBots: 7,
    durationDays: 30,
    features: ['7 bot Java đồng thời', 'Auto-Migration khi worker lỗi', 'Live 3D Control & Túi đồ'],
    active: true,
  },
  {
    id: 'ultra',
    name: 'Ultra',
    priceVnd: 20000,
    maxBots: 10,
    durationDays: 30,
    features: ['10 bot Java đồng thời', 'Toàn bộ tính năng Panel', 'Auto-Migration đa worker'],
    active: true,
  },
];

export class PanelDatabase {
  private pool: PgPoolLike | null = null;
  private localFile: string;
  private localData: LocalDbShape | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dataDir = process.env.VERCEL
      ? path.join(os.tmpdir(), 'craftopia-data')
      : path.resolve(process.cwd(), 'data')
  ) {
    this.localFile = path.join(dataDir, 'panel-db.json');
  }

  public isPostgres(): boolean {
    return this.pool !== null;
  }

  public async init(): Promise<void> {
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (dbUrl) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require('pg') as { Pool: new (opts: { connectionString: string; max: number }) => PgPoolLike };
      this.pool = new Pool({ connectionString: dbUrl, max: 5 });
      await this.pool.query('SELECT 1');
      await this.ensurePostgresSchema();
      return;
    }

    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.localFile, 'utf8');
      this.localData = JSON.parse(raw) as LocalDbShape;
    } catch {
      this.localData = {
        users: [],
        sessions: [],
        plans: DEFAULT_PLANS,
        subscriptions: [],
        payments: [],
        workers: [],
        bots: [],
        credentials: {},
        assignments: {},
        commands: [],
        auditLogs: [],
      };
      await this.flushLocal();
    }
  }

  private async ensurePostgresSchema(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        display_name TEXT,
        bio TEXT,
        avatar_url TEXT,
        discord_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id TEXT;

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price_vnd INTEGER NOT NULL,
        max_bots INTEGER NOT NULL,
        duration_days INTEGER NOT NULL DEFAULT 30,
        features_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        active BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL REFERENCES plans(id),
        status TEXT NOT NULL,
        max_bots INTEGER NOT NULL,
        starts_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL REFERENCES plans(id),
        amount_vnd INTEGER NOT NULL,
        provider TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        status TEXT NOT NULL DEFAULT 'OFFLINE',
        max_bots INTEGER NOT NULL DEFAULT 4,
        active_bots INTEGER NOT NULL DEFAULT 0,
        rss_mb REAL NOT NULL DEFAULT 0,
        heap_mb REAL NOT NULL DEFAULT 0,
        event_loop_lag_ms REAL NOT NULL DEFAULT 0,
        last_error TEXT,
        last_heartbeat_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bots (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mc_username TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 25565,
        version TEXT NOT NULL DEFAULT '1.21.4',
        auth_mode TEXT NOT NULL DEFAULT 'offline',
        worker_id TEXT REFERENCES workers(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'STOPPED',
        uptime_ms BIGINT NOT NULL DEFAULT 0,
        last_connected_at TIMESTAMPTZ,
        in_game_auth_state TEXT NOT NULL DEFAULT 'idle',
        last_error TEXT,
        auto_auth_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        reconnect_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        idempotency_key TEXT UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bot_credentials (
        bot_id TEXT PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        encrypted_envelope TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bot_assignments (
        bot_id TEXT PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE,
        worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        lease_version INTEGER NOT NULL DEFAULT 1,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        request_id TEXT UNIQUE NOT NULL,
        bot_id TEXT REFERENCES bots(id) ON DELETE CASCADE,
        worker_id TEXT REFERENCES workers(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        latency_ms REAL,
        result TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS worker_outbound_queue (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        envelope_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        detail TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      INSERT INTO plans (id, name, price_vnd, max_bots, duration_days, features_json, active)
      VALUES
        ('starter', 'Starter', 5000, 2, 30, '["2 bot Java đồng thời","Console & Live Chat","Auto-Register/Login"]', TRUE),
        ('basic', 'Basic', 10000, 5, 30, '["5 bot Java đồng thời","Auto-Migration khi worker lỗi","Live 3D Control"]', TRUE),
        ('pro', 'Pro', 15000, 7, 30, '["7 bot Java đồng thời","Auto-Migration khi worker lỗi","Live 3D Control & Túi đồ"]', TRUE),
        ('ultra', 'Ultra', 20000, 10, 30, '["10 bot Java đồng thời","Toàn bộ tính năng Panel","Auto-Migration đa worker"]', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `);
  }

  public async enqueueWorkerCommand(id: string, workerId: string, envelope: unknown): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      'INSERT INTO worker_outbound_queue (id, worker_id, envelope_json, created_at) VALUES ($1,$2,$3::jsonb,NOW())',
      [id, workerId, JSON.stringify(envelope)]
    );
  }

  public async popWorkerCommands<T = unknown>(workerId: string): Promise<T[]> {
    if (!this.pool) return [];
    const res = await this.pool.query(
      `DELETE FROM worker_outbound_queue
       WHERE id IN (
         SELECT id FROM worker_outbound_queue
         WHERE worker_id = $1
         ORDER BY created_at ASC
         LIMIT 25
         FOR UPDATE SKIP LOCKED
       )
       RETURNING envelope_json`,
      [workerId]
    );
    return res.rows.map((r: Record<string, any>) => r.envelope_json as T);
  }

  private async flushLocal(): Promise<void> {
    if (!this.localData) return;
    const payload = JSON.stringify(this.localData, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      const tmp = `${this.localFile}.tmp`;
      await fs.writeFile(tmp, payload, 'utf8');
      await fs.rename(tmp, this.localFile);
    });
    await this.writeQueue;
  }

  private getLocal(): LocalDbShape {
    if (!this.localData) throw new Error('Database chưa được init()');
    return this.localData;
  }

  // Users & Sessions
  public async createUser(user: UserRecord): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO users (id, username, email, password_hash, salt, role, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [user.id, user.username, user.email, user.passwordHash, user.salt, user.role, user.createdAt, user.updatedAt]
      );
      return;
    }
    const db = this.getLocal();
    if (db.users.some((u) => u.username.toLowerCase() === user.username.toLowerCase() || u.email.toLowerCase() === user.email.toLowerCase())) {
      throw new Error('Tên đăng nhập hoặc email đã tồn tại.');
    }
    db.users.push(user);
    await this.flushLocal();
  }

  private mapPgUser(r: Record<string, any>): UserRecord {
    return {
      id: r.id,
      username: r.username,
      email: r.email,
      passwordHash: r.password_hash,
      salt: r.salt,
      role: r.role,
      displayName: r.display_name ?? undefined,
      bio: r.bio ?? undefined,
      avatarUrl: r.avatar_url ?? undefined,
      discordId: r.discord_id ?? undefined,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  public async findUserByUsername(username: string): Promise<UserRecord | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1', [username]);
      if (!res.rows[0]) return null;
      return this.mapPgUser(res.rows[0]);
    }
    return this.getLocal().users.find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null;
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
      if (!res.rows[0]) return null;
      return this.mapPgUser(res.rows[0]);
    }
    return this.getLocal().users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  public async findUserByDiscordId(discordId: string): Promise<UserRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM users WHERE discord_id=$1 LIMIT 1', [discordId]);
        if (!res.rows[0]) return null;
        return this.mapPgUser(res.rows[0]);
      } catch {
        return null;
      }
    }
    return this.getLocal().users.find((u) => u.discordId === discordId) ?? null;
  }

  public async findUserById(id: string): Promise<UserRecord | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE id=$1 LIMIT 1', [id]);
      if (!res.rows[0]) return null;
      return this.mapPgUser(res.rows[0]);
    }
    return this.getLocal().users.find((u) => u.id === id) ?? null;
  }

  public async updateUserProfile(
    userId: string,
    patch: { displayName?: string; bio?: string; avatarUrl?: string; discordId?: string }
  ): Promise<UserRecord | null> {
    const now = new Date().toISOString();
    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE users
           SET display_name = COALESCE($1, display_name),
               bio = COALESCE($2, bio),
               avatar_url = COALESCE($3, avatar_url),
               discord_id = COALESCE($4, discord_id),
               updated_at = $5
           WHERE id = $6`,
          [
            patch.displayName !== undefined ? patch.displayName : null,
            patch.bio !== undefined ? patch.bio : null,
            patch.avatarUrl !== undefined ? patch.avatarUrl : null,
            patch.discordId !== undefined ? patch.discordId : null,
            now,
            userId,
          ]
        );
      } catch {
        await this.pool.query('UPDATE users SET updated_at=$1 WHERE id=$2', [now, userId]);
      }
      return this.findUserById(userId);
    }
    const db = this.getLocal();
    const u = db.users.find((x) => x.id === userId);
    if (!u) return null;
    if (patch.displayName !== undefined) u.displayName = patch.displayName || undefined;
    if (patch.bio !== undefined) u.bio = patch.bio || undefined;
    if (patch.avatarUrl !== undefined) u.avatarUrl = patch.avatarUrl || undefined;
    if (patch.discordId !== undefined) u.discordId = patch.discordId || undefined;
    u.updatedAt = now;
    await this.flushLocal();
    return u;
  }

  public async listUsers(): Promise<Omit<UserRecord, 'passwordHash' | 'salt'>[]> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM users ORDER BY created_at DESC');
      return res.rows.map((r: Record<string, any>) => {
        const { passwordHash: _p, salt: _s, ...rest } = this.mapPgUser(r);
        return rest;
      });
    }
    return this.getLocal().users.map(({ passwordHash: _p, salt: _s, ...u }) => u);
  }

  public async deleteUser(userId: string): Promise<void> {
    if (this.pool) {
      await this.pool.query('DELETE FROM users WHERE id=$1', [userId]);
      return;
    }
    const db = this.getLocal();
    db.users = db.users.filter((u) => u.id !== userId);
    db.sessions = db.sessions.filter((s) => s.userId !== userId);
    const botIds = new Set(db.bots.filter((b) => b.ownerId === userId).map((b) => b.id));
    db.bots = db.bots.filter((b) => b.ownerId !== userId);
    for (const id of botIds) {
      delete db.credentials[id];
      delete db.assignments[id];
    }
    await this.flushLocal();
  }

  public async createSession(session: SessionRecord): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO sessions (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [session.id, session.userId, session.tokenHash, session.expiresAt, session.revokedAt, session.createdAt]
      );
      return;
    }
    this.getLocal().sessions.push(session);
    await this.flushLocal();
  }

  public async findValidSession(tokenHash: string): Promise<SessionRecord | null> {
    const now = Date.now();
    if (this.pool) {
      const res = await this.pool.query(
        'SELECT * FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1',
        [tokenHash]
      );
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        tokenHash: r.token_hash,
        expiresAt: new Date(r.expires_at).toISOString(),
        revokedAt: null,
        createdAt: new Date(r.created_at).toISOString(),
      };
    }
    return (
      this.getLocal().sessions.find(
        (s) => s.tokenHash === tokenHash && !s.revokedAt && Date.parse(s.expiresAt) > now
      ) ?? null
    );
  }

  public async revokeSession(tokenHash: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.pool) {
      await this.pool.query('UPDATE sessions SET revoked_at=$1 WHERE token_hash=$2', [now, tokenHash]);
      return;
    }
    const db = this.getLocal();
    const s = db.sessions.find((x) => x.tokenHash === tokenHash);
    if (s) s.revokedAt = now;
    await this.flushLocal();
  }

  // Plans, Subscriptions & Payments
  public async listPlans(): Promise<PlanRecord[]> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM plans WHERE active = TRUE ORDER BY price_vnd ASC');
      return res.rows.map((r: Record<string, any>) => ({
        id: r.id,
        name: r.name,
        priceVnd: r.price_vnd,
        maxBots: r.max_bots,
        durationDays: r.duration_days,
        features: Array.isArray(r.features_json) ? r.features_json : [],
        active: r.active,
      }));
    }
    return this.getLocal().plans.filter((p) => p.active);
  }

  public async getPlan(planId: string): Promise<PlanRecord | null> {
    const plans = await this.listPlans();
    return plans.find((p) => p.id === planId) ?? null;
  }

  public async getActiveSubscription(userId: string): Promise<SubscriptionRecord | null> {
    if (this.pool) {
      const res = await this.pool.query(
        "SELECT * FROM subscriptions WHERE user_id=$1 AND status='active' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1",
        [userId]
      );
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        planId: r.plan_id,
        status: r.status,
        maxBots: r.max_bots,
        startsAt: new Date(r.starts_at).toISOString(),
        expiresAt: new Date(r.expires_at).toISOString(),
        createdAt: new Date(r.created_at).toISOString(),
      };
    }
    const now = Date.now();
    return (
      this.getLocal()
        .subscriptions.filter((s) => s.userId === userId && s.status === 'active' && Date.parse(s.expiresAt) > now)
        .sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt))[0] ?? null
    );
  }

  public async listAllSubscriptions(): Promise<SubscriptionRecord[]> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 200');
      return res.rows.map((r: Record<string, any>) => ({
        id: r.id,
        userId: r.user_id,
        planId: r.plan_id,
        status: r.status,
        maxBots: r.max_bots,
        startsAt: new Date(r.starts_at).toISOString(),
        expiresAt: new Date(r.expires_at).toISOString(),
        createdAt: new Date(r.created_at).toISOString(),
      }));
    }
    return [...this.getLocal().subscriptions].reverse();
  }

  public async createPayment(payment: PaymentRecord): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO payments (id, user_id, plan_id, amount_vnd, provider, idempotency_key, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [payment.id, payment.userId, payment.planId, payment.amountVnd, payment.provider, payment.idempotencyKey, payment.status, payment.createdAt]
      );
      return;
    }
    this.getLocal().payments.push(payment);
    await this.flushLocal();
  }

  public async getPaymentByIdempotencyKey(key: string): Promise<PaymentRecord | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM payments WHERE idempotency_key=$1 LIMIT 1', [key]);
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        planId: r.plan_id,
        amountVnd: r.amount_vnd,
        provider: r.provider,
        idempotencyKey: r.idempotency_key,
        status: r.status,
        verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
      };
    }
    return this.getLocal().payments.find((p) => p.idempotencyKey === key) ?? null;
  }

  public async getPaymentById(id: string): Promise<PaymentRecord | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM payments WHERE id=$1 LIMIT 1', [id]);
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        planId: r.plan_id,
        amountVnd: r.amount_vnd,
        provider: r.provider,
        idempotencyKey: r.idempotency_key,
        status: r.status,
        verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
      };
    }
    return this.getLocal().payments.find((p) => p.id === id) ?? null;
  }

  public async markPaymentPaidAndActivateSubscription(
    paymentId: string,
    subscription: SubscriptionRecord
  ): Promise<PaymentRecord> {
    const now = new Date().toISOString();
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("UPDATE payments SET status='paid', verified_at=$1 WHERE id=$2", [now, paymentId]);
        await client.query("UPDATE subscriptions SET status='cancelled' WHERE user_id=$1 AND status='active'", [subscription.userId]);
        await client.query(
          'INSERT INTO subscriptions (id, user_id, plan_id, status, max_bots, starts_at, expires_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [subscription.id, subscription.userId, subscription.planId, subscription.status, subscription.maxBots, subscription.startsAt, subscription.expiresAt, subscription.createdAt]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      const p = await this.getPaymentById(paymentId);
      if (!p) throw new Error('Payment missing');
      return p;
    }

    const db = this.getLocal();
    const p = db.payments.find((x) => x.id === paymentId);
    if (!p) throw new Error('Payment missing');
    p.status = 'paid';
    p.verifiedAt = now;
    for (const s of db.subscriptions) {
      if (s.userId === subscription.userId && s.status === 'active') s.status = 'cancelled';
    }
    db.subscriptions.push(subscription);
    await this.flushLocal();
    return p;
  }

  public async activateSubscription(subscription: SubscriptionRecord): Promise<void> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("UPDATE subscriptions SET status='cancelled' WHERE user_id=$1 AND status='active'", [subscription.userId]);
        await client.query(
          'INSERT INTO subscriptions (id, user_id, plan_id, status, max_bots, starts_at, expires_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [subscription.id, subscription.userId, subscription.planId, subscription.status, subscription.maxBots, subscription.startsAt, subscription.expiresAt, subscription.createdAt]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return;
    }

    const db = this.getLocal();
    for (const s of db.subscriptions) {
      if (s.userId === subscription.userId && s.status === 'active') s.status = 'cancelled';
    }
    db.subscriptions.push(subscription);
    await this.flushLocal();
  }

  // Workers
  public async upsertWorker(worker: WorkerRecord): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO workers (id, name, token_hash, version, status, max_bots, active_bots, rss_mb, heap_mb, event_loop_lag_ms, last_error, last_heartbeat_at, revoked_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, token_hash=EXCLUDED.token_hash, version=EXCLUDED.version, status=EXCLUDED.status, max_bots=EXCLUDED.max_bots, active_bots=EXCLUDED.active_bots, rss_mb=EXCLUDED.rss_mb, heap_mb=EXCLUDED.heap_mb, event_loop_lag_ms=EXCLUDED.event_loop_lag_ms, last_error=EXCLUDED.last_error, last_heartbeat_at=EXCLUDED.last_heartbeat_at, revoked_at=EXCLUDED.revoked_at`,
        [worker.id, worker.name, worker.tokenHash, worker.version, worker.status, worker.maxBots, worker.activeBots, worker.rssMb, worker.heapMb, worker.eventLoopLagMs, worker.lastError, worker.lastHeartbeatAt, worker.revokedAt, worker.createdAt]
      );
      return;
    }
    const db = this.getLocal();
    const idx = db.workers.findIndex((w) => w.id === worker.id);
    if (idx >= 0) db.workers[idx] = worker;
    else db.workers.push(worker);
    await this.flushLocal();
  }

  public async listWorkers(): Promise<WorkerRecord[]> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM workers ORDER BY created_at ASC');
      return res.rows.map((r: Record<string, any>) => ({
        id: r.id,
        name: r.name,
        tokenHash: r.token_hash,
        version: r.version,
        status: r.status,
        maxBots: r.max_bots,
        activeBots: r.active_bots,
        rssMb: r.rss_mb,
        heapMb: r.heap_mb,
        eventLoopLagMs: r.event_loop_lag_ms,
        lastError: r.last_error,
        lastHeartbeatAt: r.last_heartbeat_at ? new Date(r.last_heartbeat_at).toISOString() : null,
        revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    }
    return [...this.getLocal().workers];
  }

  public async getWorker(workerId: string): Promise<WorkerRecord | null> {
    const list = await this.listWorkers();
    return list.find((w) => w.id === workerId) ?? null;
  }

  // Bots & Assignments
  public async listBotsByOwner(ownerId: string): Promise<BotRecord[]> {
    const all = await this.listAllBots();
    return all.filter((b) => b.ownerId === ownerId);
  }

  public async listAllBots(): Promise<BotRecord[]> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM bots ORDER BY created_at DESC');
      return res.rows.map((r: Record<string, any>) => ({
        id: r.id,
        ownerId: r.owner_id,
        name: r.name,
        mcUsername: r.mc_username,
        host: r.host,
        port: r.port,
        version: r.version,
        authMode: r.auth_mode,
        workerId: r.worker_id,
        status: r.status,
        stage: '',
        uptimeMs: Number(r.uptime_ms || 0),
        lastConnectedAt: r.last_connected_at ? new Date(r.last_connected_at).toISOString() : null,
        inGameAuthState: r.in_game_auth_state,
        lastError: r.last_error,
        autoAuth: r.auto_auth_json,
        reconnect: r.reconnect_json,
        credentialConfigured: true,
        idempotencyKey: r.idempotency_key || undefined,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      }));
    }
    return [...this.getLocal().bots];
  }

  public async getBotById(botId: string): Promise<BotRecord | null> {
    const all = await this.listAllBots();
    return all.find((b) => b.id === botId) ?? null;
  }

  public async getBotByIdempotencyKey(key: string): Promise<BotRecord | null> {
    const all = await this.listAllBots();
    return all.find((b) => b.idempotencyKey === key) ?? null;
  }

  public async saveBot(bot: BotRecord): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO bots (id, owner_id, name, mc_username, host, port, version, auth_mode, worker_id, status, uptime_ms, last_connected_at, in_game_auth_state, last_error, auto_auth_json, reconnect_json, idempotency_key, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, mc_username=EXCLUDED.mc_username, host=EXCLUDED.host, port=EXCLUDED.port, version=EXCLUDED.version, auth_mode=EXCLUDED.auth_mode, worker_id=EXCLUDED.worker_id, status=EXCLUDED.status, uptime_ms=EXCLUDED.uptime_ms, last_connected_at=EXCLUDED.last_connected_at, in_game_auth_state=EXCLUDED.in_game_auth_state, last_error=EXCLUDED.last_error, auto_auth_json=EXCLUDED.auto_auth_json, reconnect_json=EXCLUDED.reconnect_json, updated_at=EXCLUDED.updated_at`,
        [bot.id, bot.ownerId, bot.name, bot.mcUsername, bot.host, bot.port, bot.version, bot.authMode, bot.workerId, bot.status, bot.uptimeMs, bot.lastConnectedAt, bot.inGameAuthState, bot.lastError, JSON.stringify(bot.autoAuth), JSON.stringify(bot.reconnect), bot.idempotencyKey || null, bot.createdAt, bot.updatedAt]
      );
      return;
    }
    const db = this.getLocal();
    const idx = db.bots.findIndex((b) => b.id === bot.id);
    if (idx >= 0) db.bots[idx] = bot;
    else db.bots.push(bot);
    await this.flushLocal();
  }

  public async deleteBot(botId: string): Promise<void> {
    if (this.pool) {
      await this.pool.query('DELETE FROM bots WHERE id=$1', [botId]);
      return;
    }
    const db = this.getLocal();
    db.bots = db.bots.filter((b) => b.id !== botId);
    delete db.credentials[botId];
    delete db.assignments[botId];
    await this.flushLocal();
  }

  public async saveBotCredential(botId: string, ownerId: string, envelope: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO bot_credentials (bot_id, owner_id, encrypted_envelope, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (bot_id) DO UPDATE SET encrypted_envelope=EXCLUDED.encrypted_envelope, updated_at=EXCLUDED.updated_at',
        [botId, ownerId, envelope, now]
      );
      return;
    }
    this.getLocal().credentials[botId] = { botId, ownerId, envelope, updatedAt: now };
    await this.flushLocal();
  }

  public async getBotCredentialEnvelope(botId: string): Promise<string | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT encrypted_envelope FROM bot_credentials WHERE bot_id=$1 LIMIT 1', [botId]);
      return res.rows[0]?.encrypted_envelope ?? null;
    }
    return this.getLocal().credentials[botId]?.envelope ?? null;
  }

  public async assignBotToWorker(botId: string, workerId: string): Promise<BotAssignment> {
    const now = new Date().toISOString();
    if (this.pool) {
      const res = await this.pool.query(
        `INSERT INTO bot_assignments (bot_id, worker_id, lease_version, assigned_at)
         VALUES ($1,$2,1,$3)
         ON CONFLICT (bot_id) DO UPDATE SET worker_id=EXCLUDED.worker_id, lease_version=bot_assignments.lease_version+1, assigned_at=EXCLUDED.assigned_at
         RETURNING *`,
        [botId, workerId, now]
      );
      const r = res.rows[0];
      return {
        botId: r.bot_id,
        workerId: r.worker_id,
        leaseVersion: r.lease_version,
        assignedAt: new Date(r.assigned_at).toISOString(),
      };
    }
    const db = this.getLocal();
    const prev = db.assignments[botId];
    const next: BotAssignment = {
      botId,
      workerId,
      leaseVersion: (prev?.leaseVersion ?? 0) + 1,
      assignedAt: now,
    };
    db.assignments[botId] = next;
    await this.flushLocal();
    return next;
  }

  public async getBotAssignment(botId: string): Promise<BotAssignment | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM bot_assignments WHERE bot_id=$1 LIMIT 1', [botId]);
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        botId: r.bot_id,
        workerId: r.worker_id,
        leaseVersion: r.lease_version,
        assignedAt: new Date(r.assigned_at).toISOString(),
      };
    }
    return this.getLocal().assignments[botId] ?? null;
  }

  // Commands & Audit Logs
  public async recordCommand(cmd: CommandRecord): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO commands (id, request_id, bot_id, worker_id, type, status, latency_ms, result, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (request_id) DO NOTHING',
        [cmd.id, cmd.requestId, cmd.botId, cmd.workerId, cmd.type, cmd.status, cmd.latencyMs, cmd.result, cmd.createdAt]
      );
      return;
    }
    const db = this.getLocal();
    if (!db.commands.some((c) => c.requestId === cmd.requestId)) {
      db.commands.push(cmd);
      if (db.commands.length > 300) db.commands.shift();
      await this.flushLocal();
    }
  }

  public async appendAuditLog(entry: AuditLogRecord): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, detail, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [entry.id, entry.actorId, entry.action, entry.targetType, entry.targetId, entry.detail, entry.createdAt]
      );
      return;
    }
    const db = this.getLocal();
    db.auditLogs.unshift(entry);
    if (db.auditLogs.length > 500) db.auditLogs.length = 500;
    await this.flushLocal();
  }

  public async listAuditLogs(actorId?: string, limit = 100): Promise<AuditLogRecord[]> {
    if (this.pool) {
      const res = actorId
        ? await this.pool.query('SELECT * FROM audit_logs WHERE actor_id=$1 ORDER BY created_at DESC LIMIT $2', [actorId, limit])
        : await this.pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [limit]);
      return res.rows.map((r: Record<string, any>) => ({
        id: r.id,
        actorId: r.actor_id,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        detail: r.detail,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    }
    const list = actorId
      ? this.getLocal().auditLogs.filter((l) => l.actorId === actorId)
      : this.getLocal().auditLogs;
    return list.slice(0, limit);
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
