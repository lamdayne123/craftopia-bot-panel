export type UserRole = 'user' | 'admin';

export type BotStatusValue =
  | 'QUEUED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'ONLINE'
  | 'RECONNECTING'
  | 'STOPPED'
  | 'ERROR';

export type WorkerStatusValue = 'HEALTHY' | 'UNHEALTHY' | 'OFFLINE' | 'DRAINING';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: UserRole;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  discordId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface PlanRecord {
  id: string;
  name: string;
  priceVnd: number;
  maxBots: number;
  durationDays: number;
  features: string[];
  active: boolean;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'expired' | 'cancelled';
  maxBots: number;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  planId: string;
  amountVnd: number;
  provider: string;
  idempotencyKey: string;
  status: 'pending' | 'paid' | 'failed';
  verifiedAt: string | null;
  createdAt: string;
}

export interface WorkerRecord {
  id: string;
  name: string;
  tokenHash: string;
  version: string;
  status: WorkerStatusValue;
  maxBots: number;
  activeBots: number;
  rssMb: number;
  heapMb: number;
  eventLoopLagMs: number;
  lastError: string | null;
  lastHeartbeatAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AutoAuthConfig {
  autoRegister: boolean;
  autoLogin: boolean;
  registerTemplate: string;
  loginTemplate: string;
  handleOnReconnect: boolean;
}

export interface ReconnectPolicy {
  enabled: boolean;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  connectTimeoutMs: number;
}

export interface BotRecord {
  id: string;
  ownerId: string;
  name: string;
  mcUsername: string;
  host: string;
  port: number;
  version: string;
  authMode: 'offline' | 'microsoft';
  workerId: string | null;
  status: BotStatusValue;
  stage: string;
  uptimeMs: number;
  lastConnectedAt: string | null;
  inGameAuthState: string;
  lastError: string | null;
  autoAuth: AutoAuthConfig;
  reconnect: ReconnectPolicy;
  credentialConfigured: boolean;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BotAssignment {
  botId: string;
  workerId: string;
  leaseVersion: number;
  assignedAt: string;
}

export interface CommandRecord {
  id: string;
  requestId: string;
  botId: string | null;
  workerId: string | null;
  type: string;
  status: 'pending' | 'acked' | 'failed';
  latencyMs: number | null;
  result: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: string;
  createdAt: string;
}
