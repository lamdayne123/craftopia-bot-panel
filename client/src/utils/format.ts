import type { AuditLogItem, BotItem, ConsoleLogEntry, ConsoleLogLevel } from '../types';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export function formatVnd(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '0đ';
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}

export function computeBotUptimeMs(
  bot: Pick<BotItem, 'status' | 'uptimeMs' | 'lastConnectedAt'> | null | undefined,
  nowMs = Date.now()
): number {
  if (!bot) return 0;
  const base = typeof bot.uptimeMs === 'number' && Number.isFinite(bot.uptimeMs) ? Math.max(0, bot.uptimeMs) : 0;
  if (bot.status === 'ONLINE' && bot.lastConnectedAt) {
    const started = Date.parse(bot.lastConnectedAt);
    if (Number.isFinite(started)) {
      return Math.max(base, Math.max(0, nowMs - started));
    }
  }
  return base;
}

export function formatUptime(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}n ${pad(hours)}g ${pad(minutes)}p`;
  if (hours > 0) return `${hours}g ${pad(minutes)}p ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}p ${pad(seconds)}s`;
  return `${seconds}s`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTimeOnly(iso: string | null | undefined): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRemainingDays(expiresAt: string | null | undefined): string {
  if (!expiresAt) return 'Chưa kích hoạt';
  const exp = new Date(expiresAt).getTime();
  if (Number.isNaN(exp)) return 'Không xác định';
  const diffMs = exp - Date.now();
  if (diffMs <= 0) return 'Đã hết hạn';
  const days = Math.ceil(diffMs / 86400_000);
  return `Còn ${days} ngày`;
}

export function inferLogLevel(action: string, detail: string): ConsoleLogLevel {
  const hay = `${action} ${detail}`.toUpperCase();
  if (hay.includes('ERROR') || hay.includes('FAIL') || hay.includes('REVOKE')) return 'ERROR';
  if (hay.includes('WARN') || hay.includes('RECONNECT') || hay.includes('MIGRATE') || hay.includes('STOP')) return 'WARN';
  if (hay.includes('CHAT') || hay.includes('CMD') || hay.includes('COMMAND')) return 'CMD';
  if (hay.includes('SYSTEM') || hay.includes('WORKER')) return 'SYSTEM';
  return 'INFO';
}

export function buildRealBotLogs(
  bot: BotItem | null,
  auditLogs: AuditLogItem[],
  sessionLogs: ConsoleLogEntry[]
): ConsoleLogEntry[] {
  if (!bot) return [];
  const relatedAudits: ConsoleLogEntry[] = auditLogs
    .filter((l) => l.targetId === bot.id || (l.targetType === 'bot' && l.detail.includes(bot.name)))
    .map((l) => ({
      id: `audit-${l.id}`,
      timestamp: l.createdAt,
      level: inferLogLevel(l.action, l.detail),
      source: l.action,
      message: l.detail,
    }));

  const statusDerived: ConsoleLogEntry[] = [];
  if (bot.lastError) {
    statusDerived.push({
      id: `err-${bot.id}-${bot.updatedAt || 'now'}`,
      timestamp: bot.updatedAt || new Date().toISOString(),
      level: 'ERROR',
      source: 'BOT_STATUS',
      message: bot.lastError,
    });
  }

  const combined = [...relatedAudits, ...statusDerived, ...sessionLogs];
  return combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function filterConsoleLogs(
  entries: ConsoleLogEntry[],
  levelFilter: ConsoleLogLevel | 'ALL',
  searchQuery: string
): ConsoleLogEntry[] {
  const q = searchQuery.trim().toLowerCase();
  return entries.filter((entry) => {
    if (levelFilter !== 'ALL' && entry.level !== levelFilter) return false;
    if (!q) return true;
    return (
      entry.message.toLowerCase().includes(q) ||
      entry.source.toLowerCase().includes(q) ||
      entry.level.toLowerCase().includes(q)
    );
  });
}

export function formatLogsForCopy(entries: ConsoleLogEntry[]): string {
  return entries
    .map((e) => `[${formatTimeOnly(e.timestamp)}] [${e.level}] [${e.source}] ${e.message}`)
    .join('\n');
}

/**
 * Curated Anime Café Chill artwork matching the user's warm sunlit, rainy window,
 * storefront, cat bakery, and autumn tree palette. Served locally from /cafe/
 * for guaranteed instant load and zero hotlink breakage.
 */
export const CAFE_IMAGES = {
  heroSunlit: {
    primary: '/cafe/cafe-sunlit-interior.jpg',
    fallback: '/cafe/cafe-storefront.jpg',
    alt: 'Quán cà phê anime ngập tràn ánh nắng ấm áp buổi sáng',
  },
  rainyWindow: {
    primary: '/cafe/cafe-rainy-window.jpg',
    fallback: '/cafe/cafe-sunlit-interior.jpg',
    alt: 'Quán cà phê pixel ngày mưa ấm cúng và thư giãn',
  },
  storefront: {
    primary: '/cafe/cafe-storefront.jpg',
    fallback: '/cafe/cafe-sunlit-interior.jpg',
    alt: 'Mặt tiền quán cà phê phong cách Nhật Bản dịu nhẹ',
  },
  bakeryCat: {
    primary: '/cafe/cafe-bakery-cat.jpg',
    fallback: '/cafe/cafe-storefront.jpg',
    alt: 'Tiệm bánh nhỏ ấm cúng cùng chú mèo cam dễ thương',
  },
  autumnTree: {
    primary: '/cafe/cafe-autumn-tree.jpg',
    fallback: '/cafe/cafe-sunlit-interior.jpg',
    alt: 'Khung cảnh mùa thu lá vàng nắng ấm nhẹ nhàng',
  },
} as const;
