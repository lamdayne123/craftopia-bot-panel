import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  Bot,
  Check,
  Clock,
  Copy,
  Eraser,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Send,
  Server,
  Shield,
  Square,
  Terminal,
  WifiOff,
  WrapText,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import type {
  AuditLogItem,
  BotItem,
  ConsoleLogEntry,
  ConsoleLogLevel,
  WorkerItem,
} from '../types';
import {
  api,
  buildRealBotLogs,
  CAFE_IMAGES,
  filterConsoleLogs,
  formatDateTime,
  formatLogsForCopy,
  formatTimeOnly,
  formatUptime,
} from '../utils/format';
import { BotStatusBadge, CafeImage, LiveUptime } from './CafeUI';

interface BotConsoleProps {
  bots: BotItem[];
  selectedBotId: string | null;
  onSelectBotId: (id: string) => void;
  auditLogs: AuditLogItem[];
  workers: WorkerItem[];
  realtimeConnected: boolean;
  busyIds: Record<string, boolean>;
  loadingWorkspace: boolean;
  onBotCmd: (botId: string, action: 'start' | 'stop' | 'reconnect') => Promise<void>;
  onRefresh: () => Promise<void>;
  notify: (type: 'ok' | 'err', text: string) => void;
  onGoToBots: () => void;
}

const LEVEL_STYLES: Record<ConsoleLogLevel, { badge: string; text: string }> = {
  INFO: {
    badge: 'bg-[#ECF6EE] text-[#2F6B43] border-[#C4E3CD]',
    text: 'text-[#594638]',
  },
  WARN: {
    badge: 'bg-[#FDF4E3] text-[#9A6520] border-[#EAD0A0]',
    text: 'text-[#7E5218]',
  },
  ERROR: {
    badge: 'bg-[#FCECE9] text-[#A63A2E] border-[#EBBDB5]',
    text: 'text-[#A63A2E]',
  },
  CMD: {
    badge: 'bg-[#F3E8D8] text-[#7A593E] border-[#DFCBB2]',
    text: 'text-[#594638]',
  },
  SYSTEM: {
    badge: 'bg-[#EFE9E1] text-[#6B5A4D] border-[#DDD2C6]',
    text: 'text-[#6B5A4D]',
  },
};

const QUICK_SUGGESTIONS = ['/spawn', '/home', '/afk', '/bal'];

function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, idx) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={idx} className="bg-[#F5D69E] text-[#594638] rounded px-0.5 font-semibold">
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

export function BotConsole({
  bots,
  selectedBotId,
  onSelectBotId,
  auditLogs,
  workers,
  realtimeConnected,
  busyIds,
  loadingWorkspace,
  onBotCmd,
  onRefresh,
  notify,
  onGoToBots,
}: BotConsoleProps) {
  const activeBot = useMemo(
    () => bots.find((b) => b.id === selectedBotId) ?? bots[0] ?? null,
    [bots, selectedBotId]
  );

  // Per-bot session command/response logs (strictly real API events only)
  const [sessionLogsMap, setSessionLogsMap] = useState<Record<string, ConsoleLogEntry[]>>({});
  const [clearedAtMap, setClearedAtMap] = useState<Record<string, number>>({});
  const [levelFilter, setLevelFilter] = useState<ConsoleLogLevel | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Command bar state
  const [cmdInput, setCmdInput] = useState('');
  const [sendingCmd, setSendingCmd] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);

  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const [liveBotOverride, setLiveBotOverride] = useState<BotItem | null>(null);
  const [liveLogs, setLiveLogs] = useState<ConsoleLogEntry[]>([]);
  const [telemetry, setTelemetry] = useState<{
    health: number;
    food: number;
    position: { x: number; y: number; z: number } | null;
    quickBarSlot: number;
    dimension: string;
    playersOnline: number;
    uptimeMs: number;
  } | null>(null);
  const [activeSlot, setActiveSlot] = useState(0);
  const lastStatusRef = useRef<string | null>(null);

  const effectiveBot = liveBotOverride && liveBotOverride.id === activeBot?.id ? liveBotOverride : activeBot;

  useEffect(() => {
    if (!activeBot?.id) {
      setLiveBotOverride(null);
      setLiveLogs([]);
      setTelemetry(null);
      return;
    }
    let cancelled = false;
    lastStatusRef.current = activeBot.status;

    const pollLive = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await api<{
          bot: BotItem;
          logs: ConsoleLogEntry[];
          telemetry: {
            health: number;
            food: number;
            position: { x: number; y: number; z: number } | null;
            quickBarSlot: number;
            dimension: string;
            playersOnline: number;
            uptimeMs: number;
          } | null;
        }>(`/api/bots/${activeBot.id}/live`);
        if (cancelled) return;
        setLiveBotOverride(res.bot);
        setLiveLogs(res.logs ?? []);
        setTelemetry(res.telemetry ?? null);
        if (typeof res.telemetry?.quickBarSlot === 'number') {
          setActiveSlot(res.telemetry.quickBarSlot);
        }
        if (lastStatusRef.current && res.bot?.status && lastStatusRef.current !== res.bot.status) {
          lastStatusRef.current = res.bot.status;
          void onRefresh();
        }
      } catch {
        // ignore transient poll errors
      }
    };

    void pollLive();
    const timer = window.setInterval(() => {
      void pollLive();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeBot?.id, onRefresh]);

  const sendLiveControl = async (payload: Record<string, unknown>) => {
    if (!effectiveBot) return;
    try {
      await api(`/api/bots/${effectiveBot.id}/control`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Không thể điều khiển bot.');
    }
  };

  const rawLogs = useMemo(() => {
    if (!effectiveBot) return [];
    const sessionEntries = sessionLogsMap[effectiveBot.id] ?? [];
    const base = buildRealBotLogs(effectiveBot, auditLogs, sessionEntries);
    const seen = new Set<string>();
    const merged: ConsoleLogEntry[] = [];
    for (const item of [...base, ...liveLogs]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const clearedAt = clearedAtMap[effectiveBot.id];
    if (!clearedAt) return merged;
    return merged.filter((entry) => new Date(entry.timestamp).getTime() > clearedAt);
  }, [effectiveBot, auditLogs, sessionLogsMap, liveLogs, clearedAtMap]);

  const levelCounts = useMemo(() => {
    const counts: Record<ConsoleLogLevel | 'ALL', number> = {
      ALL: rawLogs.length,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
      CMD: 0,
      SYSTEM: 0,
    };
    for (const entry of rawLogs) {
      counts[entry.level] = (counts[entry.level] ?? 0) + 1;
    }
    return counts;
  }, [rawLogs]);

  const visibleLogs = useMemo(
    () => filterConsoleLogs(rawLogs, levelFilter, searchQuery),
    [rawLogs, levelFilter, searchQuery]
  );

  const scrollToBottom = () => {
    const el = logContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setIsAtBottom(true);
  };

  useEffect(() => {
    if (autoScroll && isAtBottom) {
      const el = logContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [visibleLogs.length, autoScroll, isAtBottom]);

  const handleScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 36;
    setIsAtBottom(nearBottom);
  };

  const appendSessionLog = (botId: string, entry: Omit<ConsoleLogEntry, 'id' | 'timestamp'>) => {
    const item: ConsoleLogEntry = {
      id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    setSessionLogsMap((prev) => ({
      ...prev,
      [botId]: [...(prev[botId] ?? []), item].slice(-300),
    }));
  };

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBot) return;
    const message = cmdInput.trim();
    if (!message || sendingCmd) return;

    setSendingCmd(true);
    try {
      await api(`/api/bots/${activeBot.id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      setCmdHistory((prev) => [message, ...prev.filter((c) => c !== message)].slice(0, 30));
      setHistoryIdx(-1);
      setCmdInput('');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Lỗi gửi lệnh';
      appendSessionLog(activeBot.id, {
        level: 'ERROR',
        source: 'BOT_CHAT',
        message: `Gửi "${message}" thất bại: ${errMsg}`,
      });
      notify('err', errMsg);
    } finally {
      setSendingCmd(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      if (cmdHistory.length === 0) return;
      e.preventDefault();
      const next = Math.min(cmdHistory.length - 1, historyIdx + 1);
      setHistoryIdx(next);
      setCmdInput(cmdHistory[next]);
    } else if (e.key === 'ArrowDown') {
      if (historyIdx <= 0) {
        setHistoryIdx(-1);
        setCmdInput('');
        return;
      }
      e.preventDefault();
      const next = historyIdx - 1;
      setHistoryIdx(next);
      setCmdInput(cmdHistory[next]);
    }
  };

  const handleCopyLine = async (entry: ConsoleLogEntry) => {
    const line = `[${formatTimeOnly(entry.timestamp)}] [${entry.level}] [${entry.source}] ${entry.message}`;
    try {
      await navigator.clipboard.writeText(line);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((curr) => (curr === entry.id ? null : curr)), 1500);
    } catch {
      notify('err', 'Trình duyệt không cho phép sao chép.');
    }
  };

  const handleCopyAll = async () => {
    if (visibleLogs.length === 0) return;
    try {
      await navigator.clipboard.writeText(formatLogsForCopy(visibleLogs));
      setCopiedAll(true);
      notify('ok', `Đã sao chép ${visibleLogs.length} dòng log đang hiển thị.`);
      setTimeout(() => setCopiedAll(false), 1800);
    } catch {
      notify('err', 'Trình duyệt không cho phép sao chép.');
    }
  };

  const matchedWorker = useMemo(() => {
    if (!activeBot?.workerId) return null;
    return workers.find((w) => w.id === activeBot.workerId) ?? null;
  }, [activeBot, workers]);

  if (!activeBot) {
    return (
      <div className="rounded-[28px] cafe-card p-8 sm:p-12 text-center space-y-4">
        <div className="w-24 h-24 rounded-3xl overflow-hidden mx-auto border-2 border-[#DFCBB2] shadow-sm">
          <CafeImage
            primary={CAFE_IMAGES.bakeryCat.primary}
            fallback={CAFE_IMAGES.bakeryCat.fallback}
            alt={CAFE_IMAGES.bakeryCat.alt}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-extrabold text-[#594638]">Chưa có Bot nào để mở Console</h2>
          <p className="text-xs text-[#846B58] max-w-md mx-auto">
            Hãy tạo bot Minecraft Java đầu tiên để theo dõi hoạt động và gửi lệnh trực tiếp tại đây.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToBots}
          className="px-5 py-2.5 rounded-xl cafe-btn-primary text-xs font-extrabold cursor-pointer"
        >
          Đi tới danh sách Bot
        </button>
      </div>
    );
  }

  const isBotBusy = !!busyIds[activeBot.id];
  const isDisconnected = activeBot.status === 'STOPPED' || activeBot.status === 'ERROR' || !realtimeConnected;

  return (
    <div className="space-y-4">
      {/* Console Top Header */}
      <div className="rounded-[26px] cafe-card overflow-hidden">
        <div className="px-4 sm:px-5 py-4 kraft-ticket-header border-b border-[#E5D4BE] flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#FFFDF7] border border-[#DFCBB2] flex items-center justify-center text-[#B58B68] shrink-0 shadow-xs">
              <Terminal className="w-5 h-5" />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {bots.length > 1 ? (
                  <select
                    aria-label="Chọn bot cho Console"
                    value={activeBot.id}
                    onChange={(e) => onSelectBotId(e.target.value)}
                    className="font-extrabold text-sm sm:text-base text-[#594638] bg-[#FFFDF7] border border-[#DFCBB2] rounded-xl px-2.5 py-1 cursor-pointer cafe-input"
                  >
                    {bots.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (@{b.mcUsername})
                      </option>
                    ))}
                  </select>
                ) : (
                  <h2 className="font-extrabold text-base text-[#594638] truncate">
                    {activeBot.name}
                  </h2>
                )}
                <BotStatusBadge status={activeBot.status} />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[#7A6252]">
                <span className="px-2 py-0.5 rounded-lg bg-[#FFFDF7] border border-[#E5D4BE]">
                  {activeBot.host}:{activeBot.port}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-[#FFFDF7] border border-[#E5D4BE]">
                  MC {activeBot.version}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-[#FFFDF7] border border-[#E5D4BE]">
                  @{activeBot.mcUsername}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-lg border inline-flex items-center gap-1 ${
                    effectiveBot?.status === 'ONLINE'
                      ? 'bg-[#ECF6EE] border-[#BFE0C8] text-[#2F6B43]'
                      : 'bg-[#FFFDF7] border-[#E5D4BE]'
                  }`}
                >
                  <Clock className="w-3 h-3 shrink-0" />
                  <LiveUptime bot={effectiveBot} showDot />
                </span>
              </div>
            </div>
          </div>

          {/* Quick Power Controls */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeBot.status === 'STOPPED' || activeBot.status === 'ERROR' ? (
              <button
                type="button"
                disabled={isBotBusy}
                onClick={() => void onBotCmd(activeBot.id, 'start')}
                className="px-3.5 py-2 rounded-xl bg-[#4A8B5C] hover:bg-[#3C744C] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs transition"
              >
                {isBotBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Start
              </button>
            ) : (
              <button
                type="button"
                disabled={isBotBusy}
                onClick={() => void onBotCmd(activeBot.id, 'stop')}
                className="px-3.5 py-2 rounded-xl bg-[#C84B3C] hover:bg-[#AD3B2E] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs transition"
              >
                {isBotBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                Stop
              </button>
            )}
            <button
              type="button"
              disabled={isBotBusy}
              onClick={() => void onBotCmd(activeBot.id, 'reconnect')}
              className="px-3.5 py-2 rounded-xl cafe-btn-secondary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBotBusy ? 'animate-spin' : ''}`} />
              Restart
            </button>
            <button
              type="button"
              disabled={loadingWorkspace}
              onClick={() => void onRefresh()}
              title="Đồng bộ dữ liệu mới nhất"
              aria-label="Đồng bộ dữ liệu mới nhất"
              className="p-2 rounded-xl cafe-btn-secondary text-[#846B58] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingWorkspace ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Console + Compact Side Stats Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Large Log Workspace (9 cols on xl) */}
        <div className="xl:col-span-9 rounded-[26px] cafe-card overflow-hidden flex flex-col">
          {/* Console Toolbar */}
          <div className="px-4 py-3 bg-[#FAF3E8] border-b border-[#E7D8C3] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Level Filters with Real Per-Level Counts */}
            <div className="flex flex-wrap items-center gap-1">
              {(['ALL', 'INFO', 'WARN', 'ERROR', 'CMD'] as const).map((lvl) => {
                const active = levelFilter === lvl;
                const count = levelCounts[lvl] ?? 0;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLevelFilter(lvl)}
                    className={`relative px-2.5 py-1 rounded-xl text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                      active
                        ? 'text-[#FFFDF7]'
                        : 'bg-[#FFFDF7] text-[#7A6252] border border-[#E5D4BE] hover:bg-[#F3E8D8]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="console-level-pill"
                        transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                        className="absolute inset-0 rounded-xl bg-[#594638] shadow-xs"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10">{lvl === 'ALL' ? 'Tất cả' : lvl}</span>
                    <span
                      className={`relative z-10 text-[10px] font-mono px-1 rounded ${
                        active ? 'bg-white/20 text-white' : 'bg-[#F3E8D8] text-[#8A6242]'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search + Display Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative flex-1 sm:flex-none">
                <Search className="w-3.5 h-3.5 text-[#9C826D] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm trong log..."
                  className="w-full sm:w-44 pl-8 pr-7 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-xs text-[#594638] placeholder:text-[#A9927E] cafe-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Xóa từ khóa tìm kiếm"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9C826D] hover:text-[#594638] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setAutoScroll((v) => !v)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border cursor-pointer transition ${
                  autoScroll
                    ? 'bg-[#ECF6EE] border-[#BFE0C8] text-[#2F6B43]'
                    : 'bg-[#FFFDF7] border-[#DFCBB2] text-[#846B58]'
                }`}
                title="Bật/tắt tự động cuộn khi có log mới"
              >
                Tự cuộn: {autoScroll ? 'Bật' : 'Tắt'}
              </button>

              <button
                type="button"
                onClick={() => setWrapLines((v) => !v)}
                className={`p-1.5 rounded-xl border cursor-pointer transition ${
                  wrapLines
                    ? 'bg-[#F3E8D8] border-[#C9A77C] text-[#594638]'
                    : 'bg-[#FFFDF7] border-[#DFCBB2] text-[#846B58]'
                }`}
                title={wrapLines ? 'Đang tự xuống dòng' : 'Đang cuộn ngang dòng dài'}
                aria-label="Chuyển chế độ xuống dòng"
              >
                <WrapText className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => void handleCopyAll()}
                disabled={visibleLogs.length === 0}
                className="px-2.5 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-[11px] font-bold text-[#594638] hover:bg-[#F3E8D8] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                title="Sao chép toàn bộ log đang hiển thị"
              >
                {copiedAll ? <Check className="w-3.5 h-3.5 text-[#3D8B57]" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Sao chép</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setClearedAtMap((prev) => ({ ...prev, [activeBot.id]: Date.now() }));
                  notify('ok', 'Đã xóa hiển thị log trên giao diện (không xóa log lưu trữ ở máy chủ).');
                }}
                disabled={rawLogs.length === 0}
                className="p-1.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-[#846B58] hover:text-[#A63A2E] hover:bg-[#FCECE9] cursor-pointer disabled:opacity-40"
                title="Xóa log trên màn hình (không xóa dữ liệu backend)"
                aria-label="Xóa log trên giao diện"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Disconnected / Status Warning Banner */}
          {isDisconnected && (
            <div className="px-4 py-2.5 bg-[#FDF4E3] border-b border-[#EAD0A0] flex items-center justify-between gap-2 text-xs text-[#8A5A1C]">
              <div className="flex items-center gap-2 font-semibold">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>
                  {activeBot.status === 'STOPPED'
                    ? 'Bot đang Offline. Hãy bấm Start để kết nối lại trước khi gửi lệnh.'
                    : activeBot.status === 'ERROR'
                    ? `Bot gặp lỗi kết nối: ${activeBot.lastError || 'Vui lòng kiểm tra cấu hình hoặc thử Restart.'}`
                    : 'Kênh Realtime đang ở chế độ Standalone/Local — bấm Làm mới để đồng bộ trạng thái mới nhất.'}
                </span>
              </div>
            </div>
          )}

          {/* Monospace Light Parchment Log Viewport */}
          <div className="relative bg-[#FFFDF7]">
            <div
              ref={logContainerRef}
              onScroll={handleScroll}
              className="h-[430px] sm:h-[500px] overflow-y-auto overflow-x-auto cafe-scroll p-3 sm:p-4 font-mono text-xs leading-relaxed space-y-1 shadow-[inset_0_4px_12px_rgba(89,70,56,0.03)]"
            >
              {loadingWorkspace && visibleLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2.5 text-[#846B58]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#B58B68]" />
                  <span className="font-sans text-xs font-semibold">Đang đồng bộ log từ hệ thống...</span>
                </div>
              ) : visibleLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2.5 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#F3E8D8] border border-[#E5D4BE] flex items-center justify-center text-[#B58B68]">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <p className="font-sans text-sm font-bold text-[#594638]">
                    {searchQuery || levelFilter !== 'ALL'
                      ? 'Không có dòng log nào khớp bộ lọc hiện tại'
                      : 'Chưa có log nào được ghi nhận cho bot này'}
                  </p>
                  <p className="font-sans text-xs text-[#846B58] max-w-md">
                    Console chỉ hiển thị log hoạt động thực tế và phản hồi lệnh từ Worker — không tự sinh dữ liệu mẫu.
                  </p>
                </div>
              ) : (
                visibleLogs.map((entry) => {
                  const st = LEVEL_STYLES[entry.level];
                  return (
                    <div
                      key={entry.id}
                      className="group flex items-start gap-2 rounded-xl px-2.5 py-1.5 hover:bg-[#F3E8D8]/65 transition"
                    >
                      <span className="text-[11px] text-[#9C826D] shrink-0 select-none pt-0.5">
                        {formatTimeOnly(entry.timestamp)}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border shrink-0 select-none ${st.badge}`}
                      >
                        {entry.level}
                      </span>
                      <span className="text-[11px] text-[#B58B68] font-semibold shrink-0 hidden sm:inline">
                        [{entry.source}]
                      </span>
                      <span
                        className={`flex-1 min-w-0 ${st.text} ${
                          wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
                        }`}
                      >
                        {highlightMatch(entry.message, searchQuery)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopyLine(entry)}
                        aria-label="Sao chép dòng log"
                        title="Sao chép dòng này"
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded-lg text-[#846B58] hover:bg-[#E7D8C3] transition shrink-0 cursor-pointer"
                      >
                        {copiedId === entry.id ? (
                          <Check className="w-3.5 h-3.5 text-[#3D8B57]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Jump to Latest Floating Button */}
            {!isAtBottom && visibleLogs.length > 0 && (
              <button
                type="button"
                onClick={scrollToBottom}
                className="absolute bottom-3 right-4 px-3.5 py-1.5 rounded-full cafe-btn-primary text-[11px] font-bold inline-flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                Về log mới nhất
              </button>
            )}
          </div>

          {/* Fixed Command Input Bar at Bottom */}
          <div className="border-t border-[#E7D8C3] bg-[#F8F1E5] p-3.5 sm:p-4 space-y-2.5">
            {/* Quick Command Chips + Filter Status */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-[#846B58] font-semibold mr-1">Gợi ý nhanh:</span>
              {QUICK_SUGGESTIONS.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => setCmdInput(cmd)}
                  className="px-2.5 py-0.5 rounded-lg bg-[#FFFFFF] border border-[#E5D4BE] font-mono text-[#7A593E] hover:bg-[#F3E8D8] hover:border-[#C9A77C] cursor-pointer transition"
                >
                  {cmd}
                </button>
              ))}
              {cmdHistory.length > 0 && (
                <span className="text-[10px] text-[#9C826D] ml-auto hidden sm:inline">
                  Phím ↑ / ↓ để chọn lại lệnh cũ ({cmdHistory.length})
                </span>
              )}
            </div>

            <form onSubmit={handleSendCommand} className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-[#B58B68] select-none">
                  &gt;
                </span>
                <input
                  value={cmdInput}
                  onChange={(e) => setCmdInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sendingCmd}
                  maxLength={256}
                  placeholder={
                    activeBot.status === 'ONLINE'
                      ? 'Nhập lệnh (/spawn, /login...) hoặc tin nhắn chat rồi nhấn Enter...'
                      : 'Bot cần ở trạng thái Online để Worker thực thi lệnh...'
                  }
                  className="w-full min-h-[44px] pl-8 pr-3.5 rounded-xl bg-[#FFFFFF] border border-[#DFCBB2] font-mono text-xs sm:text-sm text-[#594638] placeholder:text-[#A9927E] cafe-input disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={sendingCmd || !cmdInput.trim()}
                className="min-h-[44px] px-4 sm:px-5 rounded-xl cafe-btn-primary text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {sendingCmd ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="hidden sm:inline">Đang gửi...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Gửi lệnh</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Compact Side Stats Panel (3 cols on xl — strictly real backend fields) */}
        <aside className="xl:col-span-3 space-y-3">
          <div className="rounded-[24px] cafe-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#594638] pb-2.5 border-b border-[#F0E3D1]">
              <Bot className="w-4 h-4 text-[#B58B68]" />
              <span>Thông số Bot hiện tại</span>
            </div>

            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#846B58]">Trạng thái</dt>
                <dd className="font-bold text-[#594638] text-right">{activeBot.stage || activeBot.status}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#846B58]">Thời gian chạy</dt>
                <dd className="font-mono font-bold text-[#594638]">
                  <LiveUptime bot={effectiveBot} showDot />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#846B58]">Kết nối gần nhất</dt>
                <dd className="font-mono text-[11px] font-semibold text-[#594638] text-right">
                  {formatDateTime(activeBot.lastConnectedAt)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#846B58]">Xác thực in-game</dt>
                <dd className="font-mono font-semibold text-[#7A593E]">{activeBot.inGameAuthState}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#846B58]">Chế độ tài khoản</dt>
                <dd className="font-bold text-[#594638] capitalize">{activeBot.authMode}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#846B58]">Node điều phối</dt>
                <dd className="font-mono text-[11px] font-semibold text-[#594638] truncate max-w-[140px]">
                  {effectiveBot?.workerId || 'Chưa gán'}
                </dd>
              </div>
              {telemetry && (
                <>
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#F0E3D1]">
                    <dt className="text-[#846B58]">Sinh lực / Đói</dt>
                    <dd className="font-mono font-bold text-[#2F6B43]">
                      {telemetry.health} HP • {telemetry.food} Food
                    </dd>
                  </div>
                  {telemetry.position && (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-[#846B58]">Tọa độ (X/Y/Z)</dt>
                      <dd className="font-mono text-[11px] font-bold text-[#594638]">
                        {telemetry.position.x}, {telemetry.position.y}, {telemetry.position.z}
                      </dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </div>

          {/* Live Bot Control Pad */}
          <div className="rounded-[24px] cafe-card p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-extrabold text-[#594638] pb-2 border-b border-[#F0E3D1]">
              <span>Điều khiển trực tiếp</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                effectiveBot?.status === 'ONLINE' ? 'bg-[#ECF6EE] text-[#2F6B43]' : 'bg-[#F3E8D8] text-[#846B58]'
              }`}>
                {effectiveBot?.status === 'ONLINE' ? 'Sẵn sàng' : 'Chờ Online'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
              <div />
              <button
                type="button"
                disabled={effectiveBot?.status !== 'ONLINE'}
                onPointerDown={() => void sendLiveControl({ kind: 'state', control: 'forward', state: true })}
                onPointerUp={() => void sendLiveControl({ kind: 'state', control: 'forward', state: false })}
                onPointerLeave={() => void sendLiveControl({ kind: 'state', control: 'forward', state: false })}
                className="min-h-[36px] rounded-xl cafe-btn-secondary disabled:opacity-40 cursor-pointer"
              >
                Tiến
              </button>
              <button
                type="button"
                disabled={effectiveBot?.status !== 'ONLINE'}
                onClick={() => void sendLiveControl({ kind: 'state', control: 'jump', state: true }).then(() =>
                  setTimeout(() => void sendLiveControl({ kind: 'state', control: 'jump', state: false }), 250)
                )}
                className="min-h-[36px] rounded-xl bg-[#F3E8D8] text-[#594638] hover:bg-[#EAD9C2] disabled:opacity-40 cursor-pointer"
              >
                Nhảy
              </button>
              <button
                type="button"
                disabled={effectiveBot?.status !== 'ONLINE'}
                onPointerDown={() => void sendLiveControl({ kind: 'state', control: 'left', state: true })}
                onPointerUp={() => void sendLiveControl({ kind: 'state', control: 'left', state: false })}
                onPointerLeave={() => void sendLiveControl({ kind: 'state', control: 'left', state: false })}
                className="min-h-[36px] rounded-xl cafe-btn-secondary disabled:opacity-40 cursor-pointer"
              >
                Trái
              </button>
              <button
                type="button"
                disabled={effectiveBot?.status !== 'ONLINE'}
                onPointerDown={() => void sendLiveControl({ kind: 'state', control: 'back', state: true })}
                onPointerUp={() => void sendLiveControl({ kind: 'state', control: 'back', state: false })}
                onPointerLeave={() => void sendLiveControl({ kind: 'state', control: 'back', state: false })}
                className="min-h-[36px] rounded-xl cafe-btn-secondary disabled:opacity-40 cursor-pointer"
              >
                Lùi
              </button>
              <button
                type="button"
                disabled={effectiveBot?.status !== 'ONLINE'}
                onPointerDown={() => void sendLiveControl({ kind: 'state', control: 'right', state: true })}
                onPointerUp={() => void sendLiveControl({ kind: 'state', control: 'right', state: false })}
                onPointerLeave={() => void sendLiveControl({ kind: 'state', control: 'right', state: false })}
                className="min-h-[36px] rounded-xl cafe-btn-secondary disabled:opacity-40 cursor-pointer"
              >
                Phải
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-bold">
              <button
                type="button"
                disabled={effectiveBot?.status !== 'ONLINE'}
                onClick={() => void sendLiveControl({ kind: 'primary' })}
                className="min-h-[34px] rounded-xl cafe-btn-primary disabled:opacity-40 cursor-pointer"
              >
                Đánh / Đào
              </button>
              <button
                type="button"
                disabled={effectiveBot?.status !== 'ONLINE'}
                onClick={() => void sendLiveControl({ kind: 'secondary' })}
                className="min-h-[34px] rounded-xl cafe-btn-secondary disabled:opacity-40 cursor-pointer"
              >
                Dùng / Mở
              </button>
              <button
                type="button"
                disabled={effectiveBot?.status !== 'ONLINE'}
                onClick={() => void sendLiveControl({ kind: 'look_delta', dYaw: 0.45, dPitch: 0 })}
                className="min-h-[32px] rounded-xl bg-[#FFFDF7] border border-[#E5D4BE] text-[#7A6252] hover:bg-[#F3E8D8] disabled:opacity-40 cursor-pointer"
              >
                Quay trái
              </button>
              <button
                type="button"
                disabled={effectiveBot?.status !== 'ONLINE'}
                onClick={() => void sendLiveControl({ kind: 'look_delta', dYaw: -0.45, dPitch: 0 })}
                className="min-h-[32px] rounded-xl bg-[#FFFDF7] border border-[#E5D4BE] text-[#7A6252] hover:bg-[#F3E8D8] disabled:opacity-40 cursor-pointer"
              >
                Quay phải
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#846B58]">
                <span>Hotbar (1–9)</span>
                <button
                  type="button"
                  disabled={effectiveBot?.status !== 'ONLINE'}
                  onClick={() => void sendLiveControl({ kind: 'release_all' })}
                  className="text-[10px] font-bold text-[#A63A2E] hover:underline disabled:opacity-40 cursor-pointer"
                >
                  Dừng hết phím
                </button>
              </div>
              <div className="grid grid-cols-9 gap-1">
                {Array.from({ length: 9 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={effectiveBot?.status !== 'ONLINE'}
                    onClick={() => {
                      setActiveSlot(i);
                      void sendLiveControl({ kind: 'hotbar', slot: i });
                    }}
                    className={`relative h-7 rounded-lg text-[11px] font-mono font-bold cursor-pointer disabled:opacity-40 transition-colors ${
                      activeSlot === i
                        ? 'text-white'
                        : 'bg-[#FFFDF7] border border-[#E5D4BE] text-[#594638] hover:bg-[#F3E8D8]'
                    }`}
                  >
                    {activeSlot === i && (
                      <motion.span
                        layoutId="hotbar-active-slot"
                        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                        className="absolute inset-0 rounded-lg bg-[#B58B68]"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10">{i + 1}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Node Telemetry — shown ONLY if worker data is actually provided by backend (Admin) */}
          {matchedWorker && (
            <div className="rounded-[24px] cafe-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#594638] pb-2.5 border-b border-[#F0E3D1]">
                <Server className="w-4 h-4 text-[#B58B68]" />
                <span>Tài nguyên Node ({matchedWorker.name})</span>
              </div>
              <div className="space-y-2.5 text-xs">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-[#846B58]">RAM (RSS / Heap)</span>
                    <span className="font-mono font-bold text-[#594638]">
                      {matchedWorker.rssMb}MB / {matchedWorker.heapMb}MB
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F3E8D8] overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, Math.round((matchedWorker.rssMb / 512) * 100))}%` }}
                      className="h-full bg-[#B58B68] rounded-full"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#846B58]">Độ trễ Event Loop</span>
                  <span className="font-mono font-bold text-[#594638]">{matchedWorker.eventLoopLagMs}ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#846B58]">Tải Bot trên Node</span>
                  <span className="font-mono font-bold text-[#594638]">
                    {matchedWorker.activeBots} / {matchedWorker.maxBots}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeBot.lastError && (
            <div className="rounded-[24px] bg-[#FCECE9] border border-[#EBBDB5] p-4 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#A63A2E]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Lỗi gần nhất</span>
              </div>
              <p className="text-xs text-[#8C3227] break-words leading-relaxed">{activeBot.lastError}</p>
            </div>
          )}

          <div className="rounded-[24px] kraft-surface border border-[#DFCBB2] p-4 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-extrabold text-[#594638]">
              <Shield className="w-4 h-4 text-[#B58B68]" />
              <span>Ghi chú bảo mật</span>
            </div>
            <p className="text-[11px] text-[#7A6252] leading-relaxed">
              Lệnh gửi từ Console được chuyển tiếp qua API chính thức của hệ thống. Nút xóa log chỉ làm sạch màn hình hiển thị của bạn.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
