export type NavTab =
  | 'overview'
  | 'bots'
  | 'console'
  | 'create'
  | 'logs'
  | 'resources'
  | 'account'
  | 'store'
  | 'bedrock'
  | 'admin_workers'
  | 'admin_users'
  | 'admin_health';

export type PublicPage = 'home' | 'pricing' | 'auth';

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  discordId?: string;
}

export interface SubscriptionInfo {
  id?: string;
  planId: string;
  startsAt?: string;
  expiresAt: string;
  status: string;
  maxBots?: number;
}

export interface QuotaInfo {
  maxBots: number;
  usedBots: number;
  remainingSlots: number;
  subscription: SubscriptionInfo | null;
}

export interface PlanItem {
  id: string;
  name: string;
  priceVnd: number;
  maxBots: number;
  durationDays: number;
  features: string[];
}

export interface PaymentItem {
  id: string;
  userId?: string;
  planId: string;
  amountVnd: number;
  provider: string;
  idempotencyKey?: string;
  status: 'pending' | 'paid' | 'failed';
  verifiedAt?: string | null;
  createdAt: string;
}

export interface CheckoutResponse {
  payment: PaymentItem;
  plan: PlanItem;
  webhookConfigured: boolean;
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

export interface BotItem {
  id: string;
  name: string;
  mcUsername: string;
  host: string;
  port: number;
  version: string;
  authMode: 'offline' | 'microsoft';
  workerId: string | null;
  status: 'QUEUED' | 'CONNECTING' | 'AUTHENTICATING' | 'ONLINE' | 'RECONNECTING' | 'STOPPED' | 'ERROR';
  stage: string;
  uptimeMs: number;
  lastConnectedAt: string | null;
  inGameAuthState: string;
  lastError: string | null;
  autoAuth?: AutoAuthConfig;
  reconnect?: ReconnectPolicy;
  credentialConfigured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkerItem {
  id: string;
  name: string;
  status: 'HEALTHY' | 'UNHEALTHY' | 'OFFLINE' | 'DRAINING';
  maxBots: number;
  activeBots: number;
  rssMb: number;
  heapMb: number;
  eventLoopLagMs: number;
  lastHeartbeatAt: string | null;
  revokedAt: string | null;
}

export interface AuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: string;
  createdAt: string;
}

export interface OverviewData {
  totalBots: number;
  onlineBots: number;
  connectingBots: number;
  offlineBots: number;
  errorBots: number;
  realtimeConnected: boolean;
  healthyWorkers: number;
  recentActivity: AuditLogItem[];
  errors: Array<{ botId: string; name: string; error: string }>;
}

export interface PublicHealthData {
  ok: boolean;
  postgres: boolean;
  managedRealtime: boolean;
  bedrockStatus: string;
}

export type ConsoleLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CMD' | 'SYSTEM';

export interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  level: ConsoleLogLevel;
  source: string;
  message: string;
}
