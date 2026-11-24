import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coffee,
  Loader2,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import type { BotItem, PaymentItem } from '../types';
import { computeBotUptimeMs, formatUptime } from '../utils/format';

export function CafeScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 280,
    damping: 32,
    restDelta: 0.001,
  });

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[#C9A77C] via-[#B58B68] to-[#594638] origin-left z-50 pointer-events-none"
      aria-hidden="true"
    />
  );
}

export function SlidingNumber({
  value,
  className = '',
}: {
  value: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex overflow-hidden tabular-nums ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function AnimatedProgressBar({
  percent,
  colorClass = 'bg-[#B58B68]',
  heightClass = 'h-1.5',
  shimmer = false,
}: {
  percent: number;
  colorClass?: string;
  heightClass?: string;
  shimmer?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={`${heightClass} rounded-full bg-[#F3E8D8] overflow-hidden`}>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: clamped / 100 }}
        transition={{ type: 'spring', stiffness: 220, damping: 28 }}
        className={`h-full w-full origin-left rounded-full ${colorClass} ${
          shimmer && clamped > 0 ? 'cafe-shimmer-overlay' : ''
        }`}
      />
    </div>
  );
}

export function useNowTick(enabled: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}

export function LiveUptime({
  bot,
  showDot = false,
  className = '',
}: {
  bot: Pick<BotItem, 'status' | 'uptimeMs' | 'lastConnectedAt'> | null | undefined;
  showDot?: boolean;
  className?: string;
}) {
  const isOnline = bot?.status === 'ONLINE';
  const now = useNowTick(isOnline, 1000);
  const text = formatUptime(computeBotUptimeMs(bot, now));
  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums font-mono ${className}`}>
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isOnline ? 'bg-[#3D8B57] animate-pulse' : 'bg-[#C9A77C]'
          }`}
        />
      )}
      <span>{text}</span>
    </span>
  );
}

export function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-2xl kraft-surface border border-[#DFCBB2] flex items-center justify-center shrink-0 shadow-[0_3px_10px_rgba(89,70,56,0.09)]"
    >
      <svg
        width={Math.round(size * 0.64)}
        height={Math.round(size * 0.64)}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M11 6.5C11 5.2 12.2 4.5 12.2 3.2M16 6.5C16 5.2 17.2 4.5 17.2 3.2M21 6.5C21 5.2 22.2 4.5 22.2 3.2"
          stroke="#B58B68"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6.5 11.5H21.5V19.5C21.5 23.09 18.59 26 15 26H13C9.41 26 6.5 23.09 6.5 19.5V11.5Z"
          fill="#FFFDF7"
          stroke="#594638"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M21.5 13.5H24C25.66 13.5 27 14.84 27 16.5C27 18.16 25.66 19.5 24 19.5H21.5"
          stroke="#594638"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <rect x="11" y="15.5" width="6" height="6" rx="1.2" fill="#C9A77C" />
        <path d="M5 28.5H23" stroke="#B58B68" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function CafeImage({
  primary,
  fallback,
  alt,
  className = '',
}: {
  primary: string;
  fallback: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState(primary);
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (src !== fallback) setSrc(fallback);
      }}
      className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-95'}`}
    />
  );
}

export const BOT_STATUS_META: Record<
  BotItem['status'],
  {
    label: string;
    badgeClass: string;
    dotClass: string;
    accentBorderClass: string;
    icon: React.ReactNode;
  }
> = {
  ONLINE: {
    label: 'Online',
    badgeClass: 'bg-[#ECF6EE] text-[#2F6B43] border-[#BFE0C8]',
    dotClass: 'bg-[#3D8B57]',
    accentBorderClass: 'border-l-[#4A8B5C]',
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
  },
  CONNECTING: {
    label: 'Đang kết nối',
    badgeClass: 'bg-[#FDF4E3] text-[#9A6520] border-[#EAD0A0]',
    dotClass: 'bg-[#C98A32]',
    accentBorderClass: 'border-l-[#C98A32]',
    icon: <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />,
  },
  AUTHENTICATING: {
    label: 'Đang xác thực',
    badgeClass: 'bg-[#FDF4E3] text-[#9A6520] border-[#EAD0A0]',
    dotClass: 'bg-[#C98A32]',
    accentBorderClass: 'border-l-[#C98A32]',
    icon: <ShieldCheck className="w-3.5 h-3.5 shrink-0" />,
  },
  RECONNECTING: {
    label: 'Đang kết nối lại',
    badgeClass: 'bg-[#FBF0E4] text-[#9C5C24] border-[#E7C6A2]',
    dotClass: 'bg-[#C77D3B]',
    accentBorderClass: 'border-l-[#C77D3B]',
    icon: <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />,
  },
  QUEUED: {
    label: 'Đang chờ hàng đợi',
    badgeClass: 'bg-[#F3E8D8] text-[#7A593E] border-[#DFCBB2]',
    dotClass: 'bg-[#B58B68]',
    accentBorderClass: 'border-l-[#B58B68]',
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
  },
  STOPPED: {
    label: 'Offline',
    badgeClass: 'bg-[#F4EFEA] text-[#6E5C50] border-[#DDD2C6]',
    dotClass: 'bg-[#9C8B7E]',
    accentBorderClass: 'border-l-[#C4B4A5]',
    icon: <PauseCircle className="w-3.5 h-3.5 shrink-0" />,
  },
  ERROR: {
    label: 'Lỗi kết nối',
    badgeClass: 'bg-[#FCECE9] text-[#A63A2E] border-[#EBBDB5]',
    dotClass: 'bg-[#C84B3C]',
    accentBorderClass: 'border-l-[#C84B3C]',
    icon: <AlertCircle className="w-3.5 h-3.5 shrink-0" />,
  },
};

export function BotStatusBadge({ status }: { status: BotItem['status'] }) {
  const meta = BOT_STATUS_META[status] ?? BOT_STATUS_META.STOPPED;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}
    >
      {meta.icon}
      <span>{meta.label}</span>
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentItem['status'] }) {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ECF6EE] text-[#2F6B43] border border-[#BFE0C8]">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Thành công
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FCECE9] text-[#A63A2E] border border-[#EBBDB5]">
        <XCircle className="w-3.5 h-3.5" />
        Thất bại
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FDF4E3] text-[#9A6520] border border-[#EAD0A0]">
      <Clock className="w-3.5 h-3.5" />
      Chờ thanh toán
    </span>
  );
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open || busy) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={() => {
            if (!busy) onCancel();
          }}
          className="fixed inset-0 z-50 bg-[#594638]/35 backdrop-blur-[2px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[#FFFDF7] border border-[#E5D4BE] shadow-[0_18px_45px_rgba(89,70,56,0.18)] p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${danger ? 'bg-[#FCECE9] text-[#A63A2E]' : 'bg-[#F3E8D8] text-[#B58B68]'}`}>
                  {danger ? <AlertCircle className="w-5 h-5" /> : <Coffee className="w-5 h-5" />}
                </div>
                <h3 id="confirm-modal-title" className="text-base font-extrabold text-[#594638]">
                  {title}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                aria-label="Đóng hộp thoại"
                className="p-1.5 rounded-xl text-[#846B58] hover:bg-[#F3E8D8] cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[#7A6252] leading-relaxed">{description}</p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="px-4 py-2 rounded-xl cafe-btn-secondary text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
                  danger
                    ? 'bg-[#C84B3C] hover:bg-[#AD3B2E] text-white'
                    : 'cafe-btn-primary'
                }`}
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
