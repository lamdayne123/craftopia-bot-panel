-- Craftopia Minecraft Java Bot Hosting Platform Schema
-- Run against Supabase PostgreSQL before deploying to Vercel

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0),
  max_bots INTEGER NOT NULL CHECK (max_bots >= 1),
  duration_days INTEGER NOT NULL DEFAULT 30,
  features_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
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
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('HEALTHY', 'UNHEALTHY', 'OFFLINE', 'DRAINING')),
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
  auth_mode TEXT NOT NULL DEFAULT 'offline' CHECK (auth_mode IN ('offline', 'microsoft')),
  worker_id TEXT REFERENCES workers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'STOPPED' CHECK (status IN ('QUEUED', 'CONNECTING', 'AUTHENTICATING', 'ONLINE', 'RECONNECTING', 'STOPPED', 'ERROR')),
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
  status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'failed')),
  latency_ms REAL,
  result TEXT,
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
