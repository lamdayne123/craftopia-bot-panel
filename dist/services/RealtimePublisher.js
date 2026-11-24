"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimePublisher = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
/**
 * Stateless publisher + low-latency per-worker command queue for direct Panel-linked Workers.
 * Publishes commands to Supabase Realtime Broadcast REST API when configured,
 * and buffers/wakes long-polling workers via /api/worker/commands.
 */
class RealtimePublisher {
    localHook;
    supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    channel = process.env.REALTIME_CHANNEL || 'craftopia-orchestrator';
    published = [];
    workerQueues = new Map();
    waiters = new Map();
    constructor(localHook) {
        this.localHook = localHook;
    }
    isManagedConfigured() {
        return Boolean(this.supabaseUrl && this.serviceKey);
    }
    enqueueForWorker(envelope) {
        const wid = envelope.workerId;
        if (!wid)
            return;
        const queue = this.workerQueues.get(wid) ?? [];
        queue.push(envelope);
        if (queue.length > 250)
            queue.shift();
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
    async drainCommands(workerId, waitMs = 15_000) {
        const existing = this.workerQueues.get(workerId);
        if (existing && existing.length > 0) {
            this.workerQueues.set(workerId, []);
            return existing;
        }
        const clampedWait = Math.max(0, Math.min(25_000, waitMs));
        if (clampedWait === 0)
            return [];
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                const list = this.waiters.get(workerId);
                if (list) {
                    const next = list.filter((fn) => fn !== onFlush);
                    if (next.length > 0)
                        this.waiters.set(workerId, next);
                    else
                        this.waiters.delete(workerId);
                }
                resolve([]);
            }, clampedWait);
            const onFlush = (items) => {
                clearTimeout(timer);
                resolve(items);
            };
            const list = this.waiters.get(workerId) ?? [];
            list.push(onFlush);
            this.waiters.set(workerId, list);
        });
    }
    async publish(msg) {
        const envelope = {
            v: 1,
            requestId: msg.requestId || node_crypto_1.default.randomUUID(),
            timestamp: Date.now(),
            type: msg.type,
            workerId: msg.workerId,
            botId: msg.botId,
            payload: msg.payload,
        };
        this.published.push(envelope);
        if (this.published.length > 200)
            this.published.shift();
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
exports.RealtimePublisher = RealtimePublisher;
