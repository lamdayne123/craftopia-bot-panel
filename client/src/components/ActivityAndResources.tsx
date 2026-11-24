import React, { useMemo, useState } from 'react';
import {
  Activity,
  Cpu,
  KeyRound,
  Search,
  Server,
  Shield,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import type {
  AuditLogItem,
  OverviewData,
  QuotaInfo,
  UserProfile,
  WorkerItem,
} from '../types';
import { api, formatDateTime } from '../utils/format';

export function ActivityLogsView({ logs }: { logs: AuditLogItem[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'ALL' | 'BOT' | 'BILLING' | 'OTHER'>('ALL');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (category === 'BOT' && !l.action.includes('BOT')) return false;
      if (category === 'BILLING' && !l.action.includes('CHECKOUT') && !l.action.includes('SUBSCRIPTION'))
        return false;
      if (
        category === 'OTHER' &&
        (l.action.includes('BOT') || l.action.includes('CHECKOUT') || l.action.includes('SUBSCRIPTION'))
      )
        return false;
      if (!q) return true;
      return l.detail.toLowerCase().includes(q) || l.action.toLowerCase().includes(q);
    });
  }, [logs, query, category]);

  return (
    <div className="rounded-3xl cafe-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#B58B68]" />
          <h2 className="text-base font-extrabold text-[#594638]">Lịch sử hoạt động</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#9C826D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm sự kiện..."
              className="pl-8 pr-3 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-xs text-[#594638] placeholder:text-[#A9927E] cafe-input"
            />
          </div>
          {(
            [
              { id: 'ALL', label: 'Tất cả' },
              { id: 'BOT', label: 'Bot' },
              { id: 'BILLING', label: 'Thanh toán' },
              { id: 'OTHER', label: 'Khác' },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`relative px-2.5 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-colors ${
                category === c.id
                  ? 'text-white'
                  : 'bg-[#FFFDF7] border border-[#E5D4BE] text-[#7A6252] hover:bg-[#F3E8D8]'
              }`}
            >
              {category === c.id && (
                <motion.span
                  layoutId="activity-category-pill"
                  transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                  className="absolute inset-0 rounded-xl bg-[#B58B68] shadow-xs"
                  aria-hidden="true"
                />
              )}
              <span className="relative z-10">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-[#FFFDF7] border border-dashed border-[#DFCBB2] py-10 text-center text-xs text-[#846B58]">
          Không có bản ghi hoạt động nào.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((l) => (
            <div
              key={l.id}
              className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs"
            >
              <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                <span className="px-2 py-0.5 rounded-lg bg-[#F3E8D8] border border-[#DFCBB2] font-mono text-[10px] font-bold text-[#7A593E] shrink-0">
                  {l.action}
                </span>
                <span className="text-[#594638] font-medium break-words">{l.detail}</span>
              </div>
              <span className="font-mono text-[11px] text-[#846B58] shrink-0">
                {formatDateTime(l.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ResourcesView({
  quota,
  overview,
  workers,
  isAdmin,
}: {
  quota: QuotaInfo | null;
  overview: OverviewData | null;
  workers: WorkerItem[];
  isAdmin: boolean;
}) {
  const used = quota?.usedBots ?? 0;
  const max = quota?.maxBots ?? 0;
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl cafe-card p-5 space-y-2.5">
          <div className="text-xs font-bold uppercase text-[#846B58]">Hạn mức Slot Bot</div>
          <div className="text-2xl font-extrabold text-[#594638]">
            {used} / {max} <span className="text-xs font-semibold text-[#846B58]">bot</span>
          </div>
          <div className="h-2.5 rounded-full bg-[#F3E8D8] overflow-hidden">
            <div style={{ width: `${pct}%` }} className="h-full bg-[#B58B68] rounded-full" />
          </div>
          <div className="text-xs text-[#7A6252]">Còn trống {quota?.remainingSlots ?? 0} slot khả dụng</div>
        </div>

        <div className="rounded-3xl cafe-card p-5 space-y-2">
          <div className="text-xs font-bold uppercase text-[#846B58]">Worker khả dụng</div>
          <div className="text-2xl font-extrabold text-[#2F6B43]">{overview?.healthyWorkers ?? 0} node</div>
          <div className="text-xs text-[#7A6252]">
            Tự động cân bằng tải sang node khỏe nhất khi khởi chạy bot.
          </div>
        </div>

        <div className="rounded-3xl cafe-card p-5 space-y-2">
          <div className="text-xs font-bold uppercase text-[#846B58]">Kênh điều phối</div>
          <div className="text-lg font-extrabold text-[#594638]">
            {overview?.realtimeConnected ? 'Realtime Connected' : 'Standalone / Local'}
          </div>
          <div className="text-xs text-[#7A6252]">
            Đồng bộ lệnh điều khiển và trạng thái kết nối từ máy chủ.
          </div>
        </div>
      </div>

      {isAdmin && workers.length > 0 && (
        <div className="rounded-3xl cafe-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#594638]">
            <Server className="w-4 h-4 text-[#B58B68]" />
            <span>Chi tiết tài nguyên các Node Worker</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {workers.map((w) => (
              <div key={w.id} className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-[#594638]">{w.name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#F3E8D8] text-[10px] font-bold text-[#7A593E]">
                    {w.status}
                  </span>
                </div>
                <div className="font-mono text-[#7A6252] flex flex-wrap gap-x-4 gap-y-1">
                  <span>Bots: {w.activeBots}/{w.maxBots}</span>
                  <span>RSS: {w.rssMb}MB</span>
                  <span>Heap: {w.heapMb}MB</span>
                  <span>Lag: {w.eventLoopLagMs}ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function BedrockComingSoonView() {
  return (
    <div className="max-w-xl mx-auto rounded-3xl cafe-card p-8 text-center space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-[#F3E8D8] border border-[#DFCBB2] flex items-center justify-center text-[#B58B68] mx-auto">
        <Cpu className="w-6 h-6" />
      </div>
      <span className="inline-block px-3 py-1 rounded-full bg-[#FDF4E3] border border-[#EAD0A0] text-[#9A6520] text-xs font-extrabold">
        Sắp ra mắt
      </span>
      <h2 className="text-xl font-extrabold text-[#594638]">Minecraft Bedrock Edition</h2>
      <p className="text-xs text-[#7A6252] leading-relaxed">
        Hiện tại hệ thống chỉ hỗ trợ Minecraft Java trên hạ tầng multi-worker. Bản Bedrock (RakNet/NetherNet) đang trong giai đoạn chuẩn bị.
      </p>
    </div>
  );
}

interface AdminWorkersProps {
  workers: WorkerItem[];
  onRefresh: () => Promise<void>;
  notify: (type: 'ok' | 'err', text: string) => void;
}

export function AdminWorkersView({ workers, onRefresh, notify }: AdminWorkersProps) {
  const [newWorkerName, setNewWorkerName] = useState('Worker-SG-01');
  const [newWorkerMaxBots, setNewWorkerMaxBots] = useState(4);
  const [revealedToken, setRevealedToken] = useState<{ workerId: string; token: string } | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl cafe-card p-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-bold text-[#846B58] mb-1">Tên Worker</label>
          <input
            value={newWorkerName}
            onChange={(e) => setNewWorkerName(e.target.value)}
            className="min-h-[40px] px-3 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-xs text-[#594638] cafe-input"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-[#846B58] mb-1">MAX_BOTS</label>
          <input
            type="number"
            value={newWorkerMaxBots}
            onChange={(e) => setNewWorkerMaxBots(Number(e.target.value))}
            className="w-24 min-h-[40px] px-3 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-xs font-mono text-[#594638] cafe-input"
          />
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              const res = await api<{ worker: WorkerItem; workerToken: string }>('/api/admin/workers', {
                method: 'POST',
                body: JSON.stringify({ name: newWorkerName, maxBots: newWorkerMaxBots }),
              });
              setRevealedToken({ workerId: res.worker.id, token: res.workerToken });
              await onRefresh();
            } catch (err) {
              notify('err', err instanceof Error ? err.message : 'Lỗi tạo worker');
            }
          }}
          className="min-h-[40px] px-4 rounded-xl cafe-btn-primary text-xs font-extrabold cursor-pointer"
        >
          + Tạo Worker
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              const res = await api<{ migratedBots: unknown[] }>('/api/admin/migrate', { method: 'POST' });
              notify('ok', `Đã kiểm tra sức khỏe & migrate ${res.migratedBots.length} bot.`);
              await onRefresh();
            } catch (err) {
              notify('err', err instanceof Error ? err.message : 'Lỗi auto-migration');
            }
          }}
          className="min-h-[40px] px-4 rounded-xl bg-[#C98A32] hover:bg-[#B07624] text-white text-xs font-extrabold cursor-pointer"
        >
          Chạy Auto-Migration
        </button>
      </div>

      {revealedToken && (
        <div className="rounded-2xl bg-[#ECF6EE] border border-[#BFE0C8] p-4 text-xs font-mono text-[#2F6B43] break-all">
          WORKER_ID={revealedToken.workerId} | WORKER_TOKEN={revealedToken.token} (chỉ hiển thị 1 lần)
        </div>
      )}

      <div className="space-y-2.5">
        {workers.map((w) => (
          <div key={w.id} className="rounded-2xl cafe-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs space-y-1">
              <div className="font-extrabold text-[#594638]">
                {w.name} ({w.id}) — {w.status}
              </div>
              <div className="font-mono text-[#846B58]">
                Bots: {w.activeBots}/{w.maxBots} • RSS: {w.rssMb}MB • Lag: {w.eventLoopLagMs}ms
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await api<{ workerToken: string }>(`/api/admin/workers/${w.id}/rotate-token`, {
                    method: 'POST',
                  });
                  setRevealedToken({ workerId: w.id, token: res.workerToken });
                }}
                className="px-3 py-1.5 rounded-xl cafe-btn-secondary text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#B58B68]" /> Rotate
              </button>
              <button
                type="button"
                onClick={async () => {
                  await api(`/api/admin/workers/${w.id}/revoke`, { method: 'POST' });
                  await onRefresh();
                }}
                className="px-3 py-1.5 rounded-xl bg-[#FCECE9] border border-[#EBBDB5] text-xs font-bold text-[#A63A2E] cursor-pointer"
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminUsersView({ usersList }: { usersList: UserProfile[] }) {
  return (
    <div className="rounded-3xl cafe-card p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-extrabold text-[#594638]">
        <Users className="w-4 h-4 text-[#B58B68]" />
        <span>Danh sách tài khoản ({usersList.length})</span>
      </div>
      <div className="space-y-2">
        {usersList.map((u) => (
          <div
            key={u.id}
            className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] px-4 py-2.5 text-xs flex flex-wrap justify-between gap-2"
          >
            <span className="font-bold text-[#594638]">
              {u.username} <span className="font-normal text-[#846B58]">({u.email})</span>
            </span>
            <span className="uppercase text-[#B58B68] font-mono font-bold">{u.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminHealthView({
  overview,
  workersCount,
}: {
  overview: OverviewData | null;
  workersCount: number;
}) {
  return (
    <div className="rounded-3xl cafe-card p-5 text-xs space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-extrabold text-[#594638]">
        <Shield className="w-4 h-4 text-[#B58B68]" />
        <span>System Health</span>
      </div>
      <div>
        Healthy Workers: <strong>{overview?.healthyWorkers ?? 0}</strong> / {workersCount}
      </div>
      <div>
        Managed Realtime:{' '}
        <strong>{overview?.realtimeConnected ? 'Connected' : 'Standalone / Local Mode'}</strong>
      </div>
    </div>
  );
}
