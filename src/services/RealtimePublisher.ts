import crypto from 'node:crypto';

export interface RealtimeEnvelope {
  v: 1;
  type:
    | 'START_BOT'
    | 'STOP_BOT'
    | 'RECONNECT_BOT'
    | 'WORKER_DRAIN'
    | 'MIGRATION_REQUEST'
    | 'BOT_CONTROL'
    | 'BOT_CHAT';
  requestId: string;
  workerId: string;
  botId?: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export type RealtimeDispatchHook = (envelope: RealtimeEnvelope) => Promise<void> | void;

/**
 * Stateless publisher + low-latency per-worker command queue for direct Panel-linked Workers.
 * Publishes commands to Supabase Realtime Broadcast REST API when configured,
 * and buffers/wakes long-polling workers via /api/worker/commands.
 */
export class RealtimePublisher {
  private readonly supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  private readonly channel = process.env.REALTIME_CHANNEL || 'craftopia-orchestrator';
  public readonly published: RealtimeEnvelope[] = [];
  private readonly workerQueues = new Map<string, RealtimeEnvelope[]>();
  private readonly waiters = new Map<string, Array<(items: RealtimeEnvelope[]) => void>>();

  constructor(private readonly localHook?: RealtimeDispatchHook) {}

  public isManagedConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.serviceKey);
  }

  private enqueueForWorker(envelope: RealtimeEnvelope): void {
    const wid = envelope.workerId;
    if (!wid) return;
    const queue = this.workerQueues.get(wid) ?? [];
    queue.push(envelope);
    if (queue.length > 250) queue.shift();
    this.workerQueues.set(wid, queue);

    const activeWaiters = this.waiters.get(wid);
    if (activeWaiters && activeWaiters.length > 0) {
      const drained = this.workerQueues.get(wid) ?? [];
      this.workerQueues.set(wid, []);
      this.waiters.delete(wid);
      for (const resolve of activeWaiters) {
        resolve(drained);
      }
    }
  }

  public async drainCommands(workerId: string, waitMs = 15_000): Promise<RealtimeEnvelope[]> {
    const existing = this.workerQueues.get(workerId);
    if (existing && existing.length > 0) {
      this.workerQueues.set(workerId, []);
      return existing;
    }
    const clampedWait = Math.max(0, Math.min(25_000, waitMs));
    if (clampedWait === 0) return [];

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const list = this.waiters.get(workerId);
        if (list) {
          const next = list.filter((fn) => fn !== onFlush);
          if (next.length > 0) this.waiters.set(workerId, next);
          else this.waiters.delete(workerId);
        }
        resolve([]);
      }, clampedWait);

      const onFlush = (items: RealtimeEnvelope[]) => {
        clearTimeout(timer);
        resolve(items);
      };

      const list = this.waiters.get(workerId) ?? [];
      list.push(onFlush);
      this.waiters.set(workerId, list);
    });
  }

  public async publish(
    msg: Omit<RealtimeEnvelope, 'v' | 'requestId' | 'timestamp'> & { requestId?: string }
  ): Promise<{ requestId: string; delivered: boolean }> {
    const envelope: RealtimeEnvelope = {
      v: 1,
      requestId: msg.requestId || crypto.randomUUID(),
      timestamp: Date.now(),
      type: msg.type,
      workerId: msg.workerId,
      botId: msg.botId,
      payload: msg.payload,
    };
    this.published.push(envelope);
    if (this.published.length > 200) this.published.shift();
    this.enqueueForWorker(envelope);

    if (this.localHook) {
      await this.localHook(envelope);
      return { requestId: envelope.requestId, delivered: true };
    }

    if (!this.supabaseUrl || !this.serviceKey) {
      return { requestId: envelope.requestId, delivered: true };
    }

    const res = await fetch(`${this.supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `realtime:${this.channel}`,
            event: envelope.type,
            payload: envelope,
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Supabase Realtime broadcast failed (${res.status})`);
    }
    return { requestId: envelope.requestId, delivered: true };
  }
}
