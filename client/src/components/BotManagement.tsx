import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Coffee,
  CreditCard,
  Loader2,
  PauseCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { BotItem, OverviewData, QuotaInfo } from '../types';
import { CAFE_IMAGES, computeBotUptimeMs, formatDateTime, formatTimeOnly, formatUptime } from '../utils/format';
import { AnimatedProgressBar, BOT_STATUS_META, BotStatusBadge, CafeImage, ConfirmModal, LiveUptime, SlidingNumber, useNowTick } from './CafeUI';

interface OverviewViewProps {
  overview: OverviewData | null;
  bots: BotItem[];
  quota: QuotaInfo | null;
  onGoToTab: (tab: 'bots' | 'create' | 'store' | 'logs' | 'console' | 'resources') => void;
  onOpenConsole: (botId: string) => void;
}

export function OverviewView({
  overview,
  bots,
  quota,
  onGoToTab,
  onOpenConsole,
}: OverviewViewProps) {
  const slotMax = quota?.maxBots ?? 0;
  const slotUsed = quota?.usedBots ?? 0;
  const slotPct = slotMax > 0 ? Math.min(100, Math.round((slotUsed / slotMax) * 100)) : 0;
  const ringCircumference = 2 * Math.PI * 36;
  const ringOffset = ringCircumference - (slotPct / 100) * ringCircumference;

  const hasOnlineBot = bots.some((b) => b.status === 'ONLINE');
  const nowTick = useNowTick(hasOnlineBot, 1000);
  const totalUptimeMs = useMemo(
    () => bots.reduce((sum, b) => sum + computeBotUptimeMs(b, nowTick), 0),
    [bots, nowTick]
  );

  const totalBotsCount = Math.max(1, overview?.totalBots ?? 0);
  const onlinePct = Math.round(((overview?.onlineBots ?? 0) / totalBotsCount) * 100);
  const connPct = Math.round(((overview?.connectingBots ?? 0) / totalBotsCount) * 100);
  const errPct = Math.round(((overview?.errorBots ?? 0) / totalBotsCount) * 100);

  return (
    <div className="space-y-5">
      {/* Cozy Café Welcome Strip */}
      <div className="rounded-[26px] kraft-surface border border-[#DFCBB2] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-16 h-12 rounded-2xl overflow-hidden border-2 border-[#FFFDF7] shadow-xs shrink-0 hidden sm:block">
            <CafeImage
              primary={CAFE_IMAGES.rainyWindow.primary}
              fallback={CAFE_IMAGES.rainyWindow.fallback}
              alt={CAFE_IMAGES.rainyWindow.alt}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#8A6242]">
              <Coffee className="w-3.5 h-3.5 text-[#B58B68]" />
              <span>Không gian điều khiển Bot Minecraft Java</span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-[#594638]">
              Hiện có <span className="text-[#2F6B43]">{overview?.onlineBots ?? 0}</span> bot đang Online trên tổng số{' '}
              <span>{overview?.totalBots ?? 0}</span> bot đã tạo.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onGoToTab('bots')}
            className="px-3.5 py-2 rounded-xl cafe-btn-secondary text-xs font-bold cursor-pointer"
          >
            Quản lý Bot
          </button>
          <button
            type="button"
            onClick={() => onGoToTab(slotMax === 0 ? 'store' : 'create')}
            className="px-3.5 py-2 rounded-xl cafe-btn-primary text-xs font-extrabold cursor-pointer"
          >
            {slotMax === 0 ? 'Mua gói thuê' : '+ Tạo Bot mới'}
          </button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="rounded-2xl cafe-card-hover p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-[#846B58] uppercase">Tổng số Bot</p>
            <Bot className="w-4 h-4 text-[#B58B68]" />
          </div>
          <p className="text-2xl font-extrabold text-[#594638] mt-1.5">
            <SlidingNumber value={overview?.totalBots ?? 0} />
          </p>
          <p className="text-[11px] text-[#846B58] mt-1">Slot: {slotUsed}/{slotMax}</p>
        </div>

        <div className="rounded-2xl cafe-card-hover p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-[#846B58] uppercase">Đang Online</p>
            <CheckCircle2 className="w-4 h-4 text-[#3D8B57]" />
          </div>
          <p className="text-2xl font-extrabold text-[#2F6B43] mt-1.5">
            <SlidingNumber value={overview?.onlineBots ?? 0} />
          </p>
          <p className="text-[11px] text-[#5A8F69] mt-1">Hoạt động ổn định</p>
        </div>

        <div className="rounded-2xl cafe-card-hover p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-[#846B58] uppercase">Đang Offline</p>
            <PauseCircle className="w-4 h-4 text-[#9C8B7E]" />
          </div>
          <p className="text-2xl font-extrabold text-[#6E5C50] mt-1.5">
            <SlidingNumber value={overview?.offlineBots ?? 0} />
          </p>
          <p className="text-[11px] text-[#846B58] mt-1">Đã tạm dừng</p>
        </div>

        <div className="rounded-2xl cafe-card-hover p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-[#846B58] uppercase">Đang kết nối</p>
            <RefreshCw className="w-4 h-4 text-[#C98A32]" />
          </div>
          <p className="text-2xl font-extrabold text-[#9A6520] mt-1.5">
            <SlidingNumber value={overview?.connectingBots ?? 0} />
          </p>
          <p className="text-[11px] text-[#A63A2E] mt-1">{overview?.errorBots ?? 0} gặp lỗi</p>
        </div>

        <div className="rounded-2xl cafe-card-hover p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-[#846B58] uppercase">Tổng Uptime</p>
            <Clock className="w-4 h-4 text-[#B58B68]" />
          </div>
          <p className="text-xl font-extrabold font-mono tabular-nums text-[#594638] mt-2">
            {formatUptime(totalUptimeMs)}
          </p>
          <p className="text-[11px] text-[#846B58] mt-1">
            {hasOnlineBot ? 'Đang chạy trực tiếp' : 'Cộng dồn các bot'}
          </p>
        </div>

        <div className="rounded-2xl cafe-card-hover p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-[#846B58] uppercase">Node Worker</p>
            <Server className="w-4 h-4 text-[#B58B68]" />
          </div>
          <p className="text-2xl font-extrabold text-[#B58B68] mt-1.5">{overview?.healthyWorkers ?? 0}</p>
          <p className="text-[11px] text-[#846B58] mt-1 truncate">
            {overview?.realtimeConnected ? 'Realtime sẵn sàng' : 'Standalone / Local'}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Slot Utilization Donut */}
        <div className="rounded-[26px] cafe-card p-5 flex items-center gap-5">
          <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88" aria-hidden="true">
              <circle cx="44" cy="44" r="36" stroke="#F3E8D8" strokeWidth="10" fill="none" />
              <circle
                cx="44"
                cy="44"
                r="36"
                stroke="#B58B68"
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                className="transition-all duration-500"
              />
            </svg>
            <span className="absolute text-sm font-extrabold text-[#594638]">{slotPct}%</span>
          </div>
          <div className="space-y-1.5 min-w-0">
            <h3 className="text-sm font-extrabold text-[#594638]">Hạn mức Slot gói thuê</h3>
            <p className="text-xs text-[#7A6252] leading-relaxed">
              {slotMax === 0
                ? 'Bạn chưa có gói thuê hoạt động. Hãy chọn gói phù hợp tại Cửa hàng.'
                : `Đang sử dụng ${slotUsed} / ${slotMax} slot bot Minecraft Java.`}
            </p>
            <button
              type="button"
              onClick={() => onGoToTab(slotMax === 0 ? 'store' : 'create')}
              className="px-3.5 py-1.5 rounded-xl cafe-btn-primary text-xs font-extrabold cursor-pointer"
            >
              {slotMax === 0 ? 'Chọn gói ngay' : '+ Tạo Bot mới'}
            </button>
          </div>
        </div>

        {/* Fleet Breakdown Bar */}
        <div className="rounded-[26px] cafe-card p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-[#594638]">Phân bổ trạng thái đội Bot</h3>
            <span className="text-xs font-mono font-bold text-[#B58B68]">
              {overview?.totalBots ?? 0} tổng
            </span>
          </div>

          <div className="h-3.5 rounded-full bg-[#F3E8D8] overflow-hidden flex">
            {onlinePct > 0 && <div style={{ width: `${onlinePct}%` }} className="bg-[#4A8B5C] h-full" />}
            {connPct > 0 && <div style={{ width: `${connPct}%` }} className="bg-[#C98A32] h-full" />}
            {errPct > 0 && <div style={{ width: `${errPct}%` }} className="bg-[#C84B3C] h-full" />}
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl bg-[#ECF6EE] border border-[#BFE0C8] px-2.5 py-1.5 font-bold text-[#2F6B43]">
              Online: {overview?.onlineBots ?? 0}
            </div>
            <div className="rounded-xl bg-[#FDF4E3] border border-[#EAD0A0] px-2.5 py-1.5 font-bold text-[#9A6520]">
              Đang nối: {overview?.connectingBots ?? 0}
            </div>
            <div className="rounded-xl bg-[#FCECE9] border border-[#EBBDB5] px-2.5 py-1.5 font-bold text-[#A63A2E]">
              Lỗi: {overview?.errorBots ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Error Alerts */}
      {overview && overview.errors.length > 0 && (
        <div className="rounded-[26px] bg-[#FCECE9] border border-[#EBBDB5] p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#A63A2E]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Cảnh báo cần chú ý ({overview.errors.length})</span>
          </div>
          <div className="space-y-1.5">
            {overview.errors.map((e) => (
              <div
                key={e.botId}
                className="rounded-xl bg-[#FFFDF7] border border-[#EBBDB5] px-3.5 py-2 text-xs text-[#8C3227] flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  <strong>{e.name}:</strong> {e.error}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenConsole(e.botId)}
                  className="text-[11px] font-bold text-[#A63A2E] hover:underline shrink-0 cursor-pointer"
                >
                  Mở Console
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Bots + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Recent Bots */}
        <div className="lg:col-span-7 rounded-[26px] cafe-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-[#594638]">Bot gần đây</h3>
            <button
              type="button"
              onClick={() => onGoToTab('bots')}
              className="text-xs font-bold text-[#B58B68] hover:text-[#594638] inline-flex items-center gap-1 cursor-pointer"
            >
              Tất cả bot <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {bots.length === 0 ? (
            <div className="rounded-2xl bg-[#FFFDF7] border border-dashed border-[#DFCBB2] py-8 text-center text-xs text-[#846B58]">
              Chưa có bot nào được tạo.
            </div>
          ) : (
            <div className="space-y-2">
              {bots.slice(0, 5).map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 hover:border-[#C9A77C] transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-[#594638] truncate">{b.name}</span>
                      <BotStatusBadge status={b.status} />
                    </div>
                    <div className="text-[11px] font-mono text-[#846B58] mt-0.5 truncate flex items-center gap-1.5">
                      <span>{b.host}:{b.port} • MC {b.version} •</span>
                      <LiveUptime bot={b} showDot />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenConsole(b.id)}
                    className="px-3 py-1.5 rounded-xl cafe-btn-secondary text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5 text-[#B58B68]" />
                    Console
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-5 rounded-[26px] cafe-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-[#594638]">Hoạt động gần nhất</h3>
            <button
              type="button"
              onClick={() => onGoToTab('logs')}
              className="text-xs font-bold text-[#B58B68] hover:text-[#594638] inline-flex items-center gap-1 cursor-pointer"
            >
              Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {!overview || overview.recentActivity.length === 0 ? (
            <div className="rounded-2xl bg-[#FFFDF7] border border-dashed border-[#DFCBB2] py-8 text-center text-xs text-[#846B58]">
              Chưa có hoạt động nào.
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              {overview.recentActivity.slice(0, 6).map((l) => (
                <div
                  key={l.id}
                  className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] px-3 py-2 flex items-center justify-between gap-2"
                >
                  <span className="text-[#594638] font-medium truncate">{l.detail}</span>
                  <span className="text-[10px] font-mono text-[#846B58] shrink-0">
                    {formatTimeOnly(l.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface BotListViewProps {
  bots: BotItem[];
  slotMax: number;
  busyIds: Record<string, boolean>;
  onBotCmd: (botId: string, action: 'start' | 'stop' | 'reconnect' | 'delete') => Promise<void>;
  onOpenConsole: (botId: string) => void;
  onGoToCreateOrStore: () => void;
}

export function BotListView({
  bots,
  slotMax,
  busyIds,
  onBotCmd,
  onOpenConsole,
  onGoToCreateOrStore,
}: BotListViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'CONNECTING' | 'STOPPED' | 'ERROR'>('ALL');
  const [inspectBot, setInspectBot] = useState<BotItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BotItem | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bots.filter((b) => {
      if (statusFilter === 'ONLINE' && b.status !== 'ONLINE') return false;
      if (
        statusFilter === 'CONNECTING' &&
        !['QUEUED', 'CONNECTING', 'AUTHENTICATING', 'RECONNECTING'].includes(b.status)
      )
        return false;
      if (statusFilter === 'STOPPED' && b.status !== 'STOPPED') return false;
      if (statusFilter === 'ERROR' && b.status !== 'ERROR') return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.mcUsername.toLowerCase().includes(q) ||
        b.host.toLowerCase().includes(q)
      );
    });
  }, [bots, search, statusFilter]);

  if (bots.length === 0) {
    return (
      <div className="rounded-[28px] cafe-card p-10 text-center space-y-4">
        <div className="w-24 h-24 rounded-3xl overflow-hidden mx-auto border-2 border-[#DFCBB2] shadow-sm">
          <CafeImage
            primary={CAFE_IMAGES.bakeryCat.primary}
            fallback={CAFE_IMAGES.bakeryCat.fallback}
            alt={CAFE_IMAGES.bakeryCat.alt}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-extrabold text-[#594638]">Bạn chưa có bot Minecraft Java nào</h2>
          <p className="text-xs text-[#846B58]">
            {slotMax === 0
              ? 'Hãy chọn một gói thuê tại Cửa hàng để mở khóa slot tạo bot.'
              : 'Khởi tạo bot đầu tiên chỉ với vài bước cấu hình đơn giản.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToCreateOrStore}
          className="px-5 py-2.5 rounded-xl cafe-btn-primary text-xs font-extrabold cursor-pointer"
        >
          {slotMax === 0 ? 'Mua gói thuê để tạo Bot' : '+ Tạo Bot ngay'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="rounded-2xl cafe-card p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#9C826D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên bot, username hoặc địa chỉ server..."
            className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-xs text-[#594638] placeholder:text-[#A9927E] cafe-input"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: `Tất cả (${bots.length})` },
              { id: 'ONLINE', label: 'Online' },
              { id: 'CONNECTING', label: 'Đang nối' },
              { id: 'STOPPED', label: 'Offline' },
              { id: 'ERROR', label: 'Lỗi' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`relative px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-colors ${
                statusFilter === f.id
                  ? 'text-white'
                  : 'bg-[#FFFDF7] border border-[#E5D4BE] text-[#7A6252] hover:bg-[#F3E8D8]'
              }`}
            >
              {statusFilter === f.id && (
                <motion.span
                  layoutId="bot-status-filter-pill"
                  transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                  className="absolute inset-0 rounded-xl bg-[#B58B68] shadow-xs"
                  aria-hidden="true"
                />
              )}
              <span className="relative z-10">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bot Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl cafe-card p-8 text-center text-xs text-[#846B58]">
          Không tìm thấy bot nào phù hợp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {filtered.map((b, idx) => {
              const busy = !!busyIds[b.id];
              const statusMeta = BOT_STATUS_META[b.status] ?? BOT_STATUS_META.STOPPED;
              return (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.18, delay: Math.min(idx * 0.03, 0.18), ease: [0.22, 1, 0.36, 1] }}
                  className={`rounded-[24px] cafe-card cafe-card-hover border-l-4 ${statusMeta.accentBorderClass} p-4 sm:p-5 space-y-3 hover:border-[#C9A77C]`}
                >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-base text-[#594638]">{b.name}</span>
                      <BotStatusBadge status={b.status} />
                      <span className="text-xs font-bold text-[#B58B68]">@{b.mcUsername}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#7A6252]">
                      <span className="px-2.5 py-0.5 rounded-lg bg-[#FFFDF7] border border-[#E7D8C3] inline-flex items-center gap-1">
                        <Server className="w-3 h-3 text-[#B58B68]" />
                        {b.host}:{b.port}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-[#FFFDF7] border border-[#E7D8C3]">
                        MC {b.version}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg border inline-flex items-center gap-1 ${
                          b.status === 'ONLINE'
                            ? 'bg-[#ECF6EE] border-[#BFE0C8] text-[#2F6B43]'
                            : 'bg-[#FFFDF7] border-[#E7D8C3]'
                        }`}
                      >
                        <Clock className="w-3 h-3 shrink-0" />
                        <LiveUptime bot={b} showDot />
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-[#FFFDF7] border border-[#E7D8C3]">
                        Node: {b.workerId || 'Chưa gán'}
                      </span>
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {b.status === 'STOPPED' || b.status === 'ERROR' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onBotCmd(b.id, 'start')}
                        className="px-3.5 py-2 rounded-xl bg-[#4A8B5C] hover:bg-[#3C744C] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Start
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onBotCmd(b.id, 'stop')}
                        className="px-3.5 py-2 rounded-xl bg-[#C84B3C] hover:bg-[#AD3B2E] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                        Stop
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onBotCmd(b.id, 'reconnect')}
                      className="px-3 py-2 rounded-xl cafe-btn-secondary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                      Restart
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenConsole(b.id)}
                      className="px-3.5 py-2 rounded-xl bg-[#F3E8D8] hover:bg-[#E8D5BC] border border-[#DFCBB2] text-[#594638] text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Terminal className="w-3.5 h-3.5 text-[#B58B68]" />
                      Console
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectBot(b)}
                      className="px-3 py-2 rounded-xl cafe-btn-secondary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-[#846B58]" />
                      Cấu hình
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setDeleteTarget(b)}
                      aria-label={`Xóa bot ${b.name}`}
                      className="p-2 rounded-xl bg-[#FFFDF7] border border-[#EBBDB5] text-[#A63A2E] hover:bg-[#FCECE9] cursor-pointer disabled:opacity-50 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {b.lastError && (
                  <div className="rounded-2xl bg-[#FCECE9] border border-[#EBBDB5] px-3.5 py-2 text-xs text-[#A63A2E] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="break-words">{b.lastError}</span>
                  </div>
                )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Bot Config Inspector Modal (read-only real backend fields, zero secrets exposed) */}
      <AnimatePresence>
        {inspectBot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => setInspectBot(null)}
            className="fixed inset-0 z-50 bg-[#594638]/35 backdrop-blur-[2px] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-3xl bg-[#FFFDF7] border border-[#E5D4BE] shadow-xl p-6 space-y-4"
            >
            <div className="flex items-center justify-between pb-2 border-b border-[#EFE3D2]">
              <div className="flex items-center gap-2.5">
                <Bot className="w-5 h-5 text-[#B58B68]" />
                <div>
                  <h3 className="text-base font-extrabold text-[#594638]">Cấu hình Bot: {inspectBot.name}</h3>
                  <p className="text-[11px] text-[#846B58]">Thông số đang áp dụng trên Worker</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectBot(null)}
                aria-label="Đóng"
                className="p-1.5 rounded-xl text-[#846B58] hover:bg-[#F3E8D8] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-2xl bg-[#FFFFFF] border border-[#E7D8C3] p-4 space-y-2">
                <div className="font-extrabold text-[#594638] uppercase text-[11px]">Kết nối máy chủ</div>
                <div className="flex justify-between"><span className="text-[#846B58]">Địa chỉ:</span><span className="font-mono font-bold">{inspectBot.host}:{inspectBot.port}</span></div>
                <div className="flex justify-between"><span className="text-[#846B58]">Phiên bản Java:</span><span className="font-mono font-bold">{inspectBot.version}</span></div>
                <div className="flex justify-between"><span className="text-[#846B58]">Tài khoản MC:</span><span className="font-bold">@{inspectBot.mcUsername} ({inspectBot.authMode})</span></div>
                <div className="flex justify-between"><span className="text-[#846B58]">Kết nối gần nhất:</span><span className="font-mono">{formatDateTime(inspectBot.lastConnectedAt)}</span></div>
              </div>

              <div className="rounded-2xl bg-[#FFFFFF] border border-[#E7D8C3] p-4 space-y-2">
                <div className="font-extrabold text-[#594638] uppercase text-[11px]">Bảo mật &amp; Auto-Auth</div>
                <div className="flex justify-between"><span className="text-[#846B58]">Trạng thái xác thực:</span><span className="font-mono font-bold">{inspectBot.inGameAuthState}</span></div>
                <div className="flex justify-between"><span className="text-[#846B58]">Mật khẩu server:</span><span className="font-bold text-[#2F6B43]">{inspectBot.credentialConfigured ? 'Đã mã hóa AES-256-GCM (ẩn)' : 'Chưa thiết lập'}</span></div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const id = inspectBot.id;
                  setInspectBot(null);
                  onOpenConsole(id);
                }}
                className="px-4 py-2 rounded-xl cafe-btn-primary text-xs font-extrabold cursor-pointer"
              >
                Mở Console Bot này
              </button>
              <button
                type="button"
                onClick={() => setInspectBot(null)}
                className="px-4 py-2 rounded-xl cafe-btn-secondary text-xs font-bold cursor-pointer"
              >
                Đóng
              </button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Bot Confirmation Modal */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`Xóa bot "${deleteTarget?.name || ''}"?`}
        description="Hệ thống sẽ gửi lệnh dừng bot trên Worker và xóa cấu hình bot khỏi tài khoản của bạn. Hành động này không thể hoàn tác."
        confirmLabel="Xác nhận xóa"
        danger
        busy={deleteTarget ? !!busyIds[deleteTarget.id] : false}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          setDeleteTarget(null);
          await onBotCmd(id, 'delete');
        }}
      />
    </div>
  );
}

export interface WizardFormState {
  host: string;
  port: number;
  version: string;
  name: string;
  mcUsername: string;
  authMode: 'offline' | 'microsoft';
  autoRegister: boolean;
  autoLogin: boolean;
  registerTemplate: string;
  loginTemplate: string;
  serverPassword: string;
  autoStart: boolean;
  idempotencyKey: string;
}

interface BotConfigWizardProps {
  quota: QuotaInfo | null;
  healthyWorkers: number;
  wizardStep: number;
  setWizardStep: React.Dispatch<React.SetStateAction<number>>;
  wizard: WizardFormState;
  setWizard: React.Dispatch<React.SetStateAction<WizardFormState>>;
  busy: boolean;
  onCreateBot: () => Promise<void>;
  onGoToStore: () => void;
}

export function BotConfigWizardView({
  quota,
  healthyWorkers,
  wizardStep,
  setWizardStep,
  wizard,
  setWizard,
  busy,
  onCreateBot,
  onGoToStore,
}: BotConfigWizardProps) {
  const [stepError, setStepError] = useState<string | null>(null);
  const hasUnsaved = Boolean(wizard.host.trim() || wizard.name.trim() || wizard.mcUsername.trim());

  if ((quota?.remainingSlots ?? 0) <= 0) {
    return (
      <div className="max-w-lg mx-auto rounded-[28px] cafe-card p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#F3E8D8] border border-[#DFCBB2] flex items-center justify-center text-[#B58B68] mx-auto">
          <CreditCard className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-extrabold text-[#594638]">
          Bạn chưa có gói thuê hoặc đã dùng hết Slot
        </h2>
        <p className="text-xs text-[#7A6252] leading-relaxed">
          Hệ thống yêu cầu gói thuê hợp lệ còn slot trống trước khi khởi tạo và chạy bot Minecraft Java.
        </p>
        <button
          type="button"
          onClick={onGoToStore}
          className="px-5 py-2.5 rounded-xl cafe-btn-primary text-xs font-extrabold cursor-pointer"
        >
          Đi tới Cửa hàng chọn gói
        </button>
      </div>
    );
  }

  const validateAndNext = () => {
    setStepError(null);
    if (wizardStep === 1) {
      if (!wizard.host.trim()) {
        setStepError('Vui lòng nhập địa chỉ máy chủ Minecraft (ví dụ: play.craftopia.vn).');
        return;
      }
      if (!Number.isInteger(wizard.port) || wizard.port < 1 || wizard.port > 65535) {
        setStepError('Cổng kết nối (Port) phải nằm trong khoảng 1 đến 65535.');
        return;
      }
      if (!wizard.version.trim()) {
        setStepError('Vui lòng nhập phiên bản Minecraft Java (ví dụ: 1.21.4).');
        return;
      }
    }
    if (wizardStep === 2) {
      if (!wizard.name.trim()) {
        setStepError('Vui lòng nhập tên hiển thị cho bot trong Panel.');
        return;
      }
      if (!wizard.mcUsername.trim()) {
        setStepError('Vui lòng nhập tên tài khoản Minecraft (Username).');
        return;
      }
    }
    setWizardStep((s) => Math.min(5, s + 1));
  };

  const stepLabels = ['Máy chủ', 'Tài khoản', 'Auto-Auth', 'Tài nguyên', 'Xác nhận'];

  return (
    <div className="max-w-2xl mx-auto rounded-[28px] cafe-card overflow-hidden">
      {/* Header */}
      <div className="px-5 sm:px-7 py-5 kraft-ticket-header border-b border-[#E5D4BE] flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-[#594638]">Cấu hình &amp; Tạo Bot Java</h2>
            {hasUnsaved && (
              <span className="px-2 py-0.5 rounded-full bg-[#FDF4E3] border border-[#EAD0A0] text-[10px] font-bold text-[#9A6520]">
                Chưa lưu
              </span>
            )}
          </div>
          <p className="text-xs text-[#7A6252]">Bước {wizardStep} / 5 • {stepLabels[wizardStep - 1]}</p>
        </div>
        <span className="px-3 py-1 rounded-full bg-[#FFFDF7] border border-[#DFCBB2] text-xs font-extrabold text-[#7A593E]">
          Slot trống: {quota?.remainingSlots ?? 0}
        </span>
      </div>

      <div className="p-5 sm:p-7 space-y-6 bg-[#FFFFFF]">
        {/* Stepper */}
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-[#F3E8D8] overflow-hidden">
            <div
              style={{ width: `${(wizardStep / 5) * 100}%` }}
              className="h-full bg-[#B58B68] rounded-full transition-all duration-300"
            />
          </div>
          <div className="grid grid-cols-5 gap-1 text-[10px] font-bold text-center">
            {stepLabels.map((lbl, idx) => (
              <span key={lbl} className={idx + 1 <= wizardStep ? 'text-[#594638]' : 'text-[#A9927E]'}>
                {idx + 1}. {lbl}
              </span>
            ))}
          </div>
        </div>

        {stepError && (
          <div className="rounded-2xl bg-[#FCECE9] border border-[#EBBDB5] px-4 py-2.5 text-xs font-semibold text-[#A63A2E]">
            {stepError}
          </div>
        )}

        {/* Step 1: Server */}
        {wizardStep === 1 && (
          <div className="space-y-4">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#B58B68]">
              Nhóm 1: Thông tin máy chủ Minecraft Java
            </div>
            <div>
              <label htmlFor="wiz-host" className="block text-xs font-bold text-[#594638] mb-1.5">
                Địa chỉ máy chủ (Host / IP)
              </label>
              <input
                id="wiz-host"
                placeholder="Ví dụ: play.craftopia.vn"
                value={wizard.host}
                onChange={(e) => setWizard({ ...wizard, host: e.target.value })}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-sm text-[#594638] placeholder:text-[#A9927E] cafe-input"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="wiz-port" className="block text-xs font-bold text-[#594638] mb-1.5">
                  Cổng kết nối (Port)
                </label>
                <input
                  id="wiz-port"
                  type="number"
                  value={wizard.port}
                  onChange={(e) => setWizard({ ...wizard, port: Number(e.target.value) })}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-sm font-mono text-[#594638] cafe-input"
                />
              </div>
              <div>
                <label htmlFor="wiz-ver" className="block text-xs font-bold text-[#594638] mb-1.5">
                  Phiên bản Java
                </label>
                <input
                  id="wiz-ver"
                  value={wizard.version}
                  onChange={(e) => setWizard({ ...wizard, version: e.target.value })}
                  placeholder="1.21.4"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-sm font-mono text-[#594638] cafe-input"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Account */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#B58B68]">
              Nhóm 2: Định danh Bot &amp; Chế độ đăng nhập
            </div>
            <div>
              <label htmlFor="wiz-name" className="block text-xs font-bold text-[#594638] mb-1.5">
                Tên hiển thị trong Panel
              </label>
              <input
                id="wiz-name"
                placeholder="Ví dụ: Bot Farm-01"
                value={wizard.name}
                onChange={(e) => setWizard({ ...wizard, name: e.target.value })}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-sm text-[#594638] placeholder:text-[#A9927E] cafe-input"
              />
            </div>
            <div>
              <label htmlFor="wiz-mcuser" className="block text-xs font-bold text-[#594638] mb-1.5">
                Tên nhân vật Minecraft (Username)
              </label>
              <input
                id="wiz-mcuser"
                placeholder="Ví dụ: CafeBot01"
                value={wizard.mcUsername}
                onChange={(e) => setWizard({ ...wizard, mcUsername: e.target.value })}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-sm text-[#594638] placeholder:text-[#A9927E] cafe-input"
              />
            </div>
            <div>
              <label htmlFor="wiz-authmode" className="block text-xs font-bold text-[#594638] mb-1.5">
                Chế độ xác thực
              </label>
              <select
                id="wiz-authmode"
                value={wizard.authMode}
                onChange={(e) => setWizard({ ...wizard, authMode: e.target.value as 'offline' | 'microsoft' })}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-sm text-[#594638] cafe-input"
              >
                <option value="offline">Offline Mode (Server Cracked / Non-Premium)</option>
                <option value="microsoft">Microsoft OAuth (Bản quyền)</option>
              </select>
            </div>
          </div>
        )}

        {/* Step 3: Auto-Auth */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#B58B68]">
              Nhóm 3: Tự động đăng ký &amp; đăng nhập trong game
            </div>
            <div className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] p-4 space-y-3">
              <label className="flex items-center gap-2.5 text-xs font-semibold text-[#594638] cursor-pointer">
                <input
                  type="checkbox"
                  checked={wizard.autoRegister}
                  onChange={(e) => setWizard({ ...wizard, autoRegister: e.target.checked })}
                  className="w-4 h-4 accent-[#B58B68]"
                />
                Tự động gửi lệnh /register khi server yêu cầu lần đầu
              </label>
              <label className="flex items-center gap-2.5 text-xs font-semibold text-[#594638] cursor-pointer">
                <input
                  type="checkbox"
                  checked={wizard.autoLogin}
                  onChange={(e) => setWizard({ ...wizard, autoLogin: e.target.checked })}
                  className="w-4 h-4 accent-[#B58B68]"
                />
                Tự động gửi lệnh /login khi vào lại server
              </label>
            </div>

            {(wizard.autoRegister || wizard.autoLogin) && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="wiz-pass" className="block text-xs font-bold text-[#594638] mb-1.5">
                    Mật khẩu riêng cho Bot (được mã hóa AES-256-GCM)
                  </label>
                  <input
                    id="wiz-pass"
                    type="password"
                    placeholder="Nhập mật khẩu dùng cho /register hoặc /login"
                    value={wizard.serverPassword}
                    onChange={(e) => setWizard({ ...wizard, serverPassword: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-sm text-[#594638] placeholder:text-[#A9927E] cafe-input"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="wiz-regtpl" className="block text-xs font-bold text-[#594638] mb-1.5">
                      Mẫu lệnh Register
                    </label>
                    <input
                      id="wiz-regtpl"
                      value={wizard.registerTemplate}
                      onChange={(e) => setWizard({ ...wizard, registerTemplate: e.target.value })}
                      className="w-full min-h-[40px] px-3 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-xs font-mono text-[#594638] cafe-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="wiz-logtpl" className="block text-xs font-bold text-[#594638] mb-1.5">
                      Mẫu lệnh Login
                    </label>
                    <input
                      id="wiz-logtpl"
                      value={wizard.loginTemplate}
                      onChange={(e) => setWizard({ ...wizard, loginTemplate: e.target.value })}
                      className="w-full min-h-[40px] px-3 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-xs font-mono text-[#594638] cafe-input"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Placement */}
        {wizardStep === 4 && (
          <div className="space-y-4 text-xs">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#B58B68]">
              Nhóm 4: Tài nguyên &amp; Điều phối Worker
            </div>
            <div className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] p-4 space-y-2.5">
              <div className="flex justify-between">
                <span className="text-[#846B58]">Slot còn trống trong gói</span>
                <strong className="text-[#594638]">{quota?.remainingSlots ?? 0} / {quota?.maxBots ?? 0}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#846B58]">Node Worker đang khỏe</span>
                <strong className="text-[#2F6B43]">{healthyWorkers} node HEALTHY</strong>
              </div>
              <label className="flex items-center gap-2.5 pt-2 border-t border-[#EFE3D2] font-semibold text-[#594638] cursor-pointer">
                <input
                  type="checkbox"
                  checked={wizard.autoStart}
                  onChange={(e) => setWizard({ ...wizard, autoStart: e.target.checked })}
                  className="w-4 h-4 accent-[#B58B68]"
                />
                Tự động khởi chạy (Start) bot ngay sau khi tạo
              </label>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {wizardStep === 5 && (
          <div className="space-y-4 text-xs">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#B58B68]">
              Nhóm 5: Kiểm tra lại trước khi tạo Bot
            </div>
            <div className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] p-4 space-y-2 font-mono">
              <div className="flex justify-between gap-2"><span className="text-[#846B58]">Tên Bot:</span><span className="font-bold text-[#594638]">{wizard.name} (@{wizard.mcUsername})</span></div>
              <div className="flex justify-between gap-2"><span className="text-[#846B58]">Máy chủ:</span><span className="font-bold text-[#594638]">{wizard.host}:{wizard.port} (Java {wizard.version})</span></div>
              <div className="flex justify-between gap-2"><span className="text-[#846B58]">Chế độ:</span><span className="font-bold text-[#594638]">{wizard.authMode}</span></div>
              <div className="flex justify-between gap-2">
                <span className="text-[#846B58]">Auto-Auth:</span>
                <span className="font-bold text-[#594638]">
                  {wizard.autoRegister || wizard.autoLogin
                    ? `${wizard.autoRegister ? 'Register ' : ''}${wizard.autoLogin ? 'Login' : ''}`
                    : 'Tắt'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#846B58]">Mật khẩu bot:</span>
                <span className="font-bold text-[#2F6B43]">
                  {wizard.serverPassword ? '•••••••• (Mã hóa khi lưu)' : 'Không đặt'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#7A6252]">
              <ShieldCheck className="w-4 h-4 text-[#5A8F69] shrink-0" />
              <span>Mật khẩu trong game không bao giờ hiển thị lại dạng văn bản thô sau khi lưu.</span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 cafe-receipt-divider">
          <button
            type="button"
            disabled={wizardStep === 1}
            onClick={() => {
              setStepError(null);
              setWizardStep((s) => Math.max(1, s - 1));
            }}
            className="px-4 py-2.5 rounded-xl cafe-btn-secondary text-xs font-bold disabled:opacity-40 cursor-pointer"
          >
            Quay lại
          </button>

          {wizardStep < 5 ? (
            <button
              type="button"
              onClick={validateAndNext}
              className="px-5 py-2.5 rounded-xl cafe-btn-primary text-xs font-extrabold cursor-pointer"
            >
              Tiếp tục
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCreateBot()}
              className="px-5 py-2.5 rounded-xl bg-[#4A8B5C] hover:bg-[#3C744C] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {busy ? 'Đang khởi tạo...' : 'Xác nhận Tạo Bot'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
