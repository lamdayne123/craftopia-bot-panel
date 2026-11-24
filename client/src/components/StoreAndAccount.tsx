import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Calendar,
  Camera,
  CheckCircle2,
  Coffee,
  CreditCard,
  Loader2,
  QrCode,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  User,
} from 'lucide-react';
import { motion } from 'motion/react';
import type {
  AuditLogItem,
  CheckoutResponse,
  PlanItem,
  QuotaInfo,
  UserProfile,
} from '../types';
import {
  api,
  CAFE_IMAGES,
  formatDateTime,
  formatRemainingDays,
  formatVnd,
} from '../utils/format';
import { CafeImage, ConfirmModal, PaymentStatusBadge } from './CafeUI';

interface StoreViewProps {
  user: UserProfile;
  plans: PlanItem[];
  quota: QuotaInfo | null;
  preselectedPlanId: string | null;
  onClearPreselected: () => void;
  onRefreshWorkspace: () => Promise<void>;
  notify: (type: 'ok' | 'err', text: string) => void;
  onOrderCreated: (checkout: CheckoutResponse) => void;
}

export function StoreView({
  user,
  plans,
  quota,
  preselectedPlanId,
  onClearPreselected,
  onRefreshWorkspace,
  notify,
  onOrderCreated,
}: StoreViewProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanItem | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [activeOrder, setActiveOrder] = useState<CheckoutResponse | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const effectiveSelected = useMemo(() => {
    if (selectedPlan) return selectedPlan;
    if (preselectedPlanId) return plans.find((p) => p.id === preselectedPlanId) ?? null;
    return null;
  }, [selectedPlan, preselectedPlanId, plans]);

  const currentStep = activeOrder ? 3 : effectiveSelected ? 2 : 1;

  const handleConfirmCheckout = async (plan: PlanItem) => {
    setCheckoutBusy(true);
    setOrderError(null);
    try {
      const res = await api<CheckoutResponse>('/api/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planId: plan.id,
          provider: 'vietqr',
          idempotencyKey: `pay_${user.id}_${plan.id}_${Date.now()}`,
        }),
      });
      setActiveOrder(res);
      onOrderCreated(res);
      notify('ok', `Đã tạo đơn #${res.payment.id.slice(0, 8)} (${res.payment.status}).`);
      await onRefreshWorkspace();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo đơn thanh toán';
      setOrderError(msg);
      notify('err', msg);
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner + 3-Step Checkout Progress */}
      <div className="rounded-[26px] kraft-surface border border-[#DFCBB2] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#FFFDF7] border border-[#DFCBB2] text-[10px] font-extrabold text-[#8A6242]">
              <Sparkles className="w-3 h-3 text-[#B58B68]" /> CỬA HÀNG GÓI THUÊ BOT
            </span>
            <h2 className="text-xl font-extrabold text-[#594638]">
              Chọn gói slot phù hợp cho đội Bot của bạn
            </h2>
            <p className="text-xs text-[#7A6252]">
              Gói thuê được kích hoạt tự động ngay sau khi backend xác minh chữ ký webhook thanh toán.
            </p>
          </div>

          <div className="rounded-2xl bg-[#FFFDF7] border border-[#E5D4BE] px-4 py-3 text-xs space-y-0.5 shadow-xs">
            <div className="text-[#846B58] font-semibold">Hạn mức hiện tại</div>
            <div className="text-base font-extrabold text-[#594638]">
              {quota?.usedBots ?? 0} / {quota?.maxBots ?? 0} bot
            </div>
          </div>
        </div>

        {/* Stepper */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {[
            { step: 1, label: '1. Chọn gói' },
            { step: 2, label: '2. Xác nhận đơn' },
            { step: 3, label: '3. Thanh toán VietQR' },
          ].map((item) => {
            const active = currentStep >= item.step;
            return (
              <div
                key={item.step}
                className={`rounded-xl px-3 py-2 text-[11px] font-bold text-center border transition ${
                  currentStep === item.step
                    ? 'bg-[#B58B68] text-white border-[#A07653] shadow-xs'
                    : active
                    ? 'bg-[#FFFDF7] text-[#594638] border-[#DFCBB2]'
                    : 'bg-[#FFFDF7]/60 text-[#9C826D] border-[#E7D8C3]'
                }`}
              >
                {item.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Café Receipt Checkout Confirmation & Payment Status Panel */}
      {(effectiveSelected || activeOrder) && (
        <div className="rounded-[26px] cafe-card overflow-hidden border-[#C9A77C]">
          <div className="px-5 sm:px-6 py-4 kraft-ticket-header border-b border-[#E5D4BE] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[#FFFDF7] border border-[#DFCBB2] flex items-center justify-center text-[#B58B68]">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#594638]">
                  {activeOrder ? 'Phiếu đơn thanh toán VietQR' : 'Xác nhận đơn đặt gói'}
                </h3>
                <p className="text-[11px] text-[#7A6252]">
                  Kiểm tra kỹ tên gói, số lượng bot và thời hạn trước khi xác nhận.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedPlan(null);
                setActiveOrder(null);
                setOrderError(null);
                onClearPreselected();
              }}
              className="px-3 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-xs font-bold text-[#7A6252] hover:text-[#594638] cursor-pointer"
            >
              Đóng
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-5 bg-[#FFFFFF]">
            {orderError && (
              <div className="rounded-2xl bg-[#FCECE9] border border-[#EBBDB5] px-4 py-3 text-xs font-semibold text-[#A63A2E]">
                {orderError}
              </div>
            )}

            {activeOrder ? (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                <div className="md:col-span-7 rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#846B58]">Mã giao dịch</span>
                    <span className="font-mono font-bold text-[#594638]">{activeOrder.payment.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#846B58]">Gói dịch vụ</span>
                    <span className="font-bold text-[#594638]">
                      {activeOrder.plan.name} ({activeOrder.plan.maxBots} bot • {activeOrder.plan.durationDays} ngày)
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 cafe-receipt-divider">
                    <span className="text-[#846B58] font-bold">Số tiền thanh toán</span>
                    <span className="text-lg font-extrabold text-[#B58B68]">
                      {formatVnd(activeOrder.payment.amountVnd)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#846B58]">Phương thức</span>
                    <span className="uppercase font-bold text-[#594638]">{activeOrder.payment.provider}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#846B58]">Trạng thái</span>
                    <PaymentStatusBadge status={activeOrder.payment.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#846B58]">Thời gian tạo</span>
                    <span className="font-mono text-[#594638]">{formatDateTime(activeOrder.payment.createdAt)}</span>
                  </div>
                </div>

                <div
                  className={`md:col-span-5 rounded-2xl border p-4 space-y-3 ${
                    activeOrder.payment.status === 'paid'
                      ? 'bg-[#ECF6EE] border-[#BFE0C8]'
                      : activeOrder.payment.status === 'failed'
                      ? 'bg-[#FCECE9] border-[#EBBDB5]'
                      : 'bg-[#FDF8EE] border-[#EAD0A0]'
                  }`}
                >
                  <p className="text-xs font-extrabold text-[#594638]">Trạng thái xác minh thanh toán</p>
                  <p className="text-[11px] text-[#6E5A4C] leading-relaxed">
                    {activeOrder.payment.status === 'paid'
                      ? 'Giao dịch đã được xác nhận thành công và slot bot đã được cộng vào tài khoản của bạn.'
                      : activeOrder.payment.status === 'failed'
                      ? 'Giao dịch không thành công. Bạn có thể chọn gói và tạo lại đơn mới bất cứ lúc nào.'
                      : activeOrder.webhookConfigured
                      ? 'Đơn hàng đang chờ webhook thanh toán VietQR xác nhận. Sau khi chuyển khoản, bấm kiểm tra lại trạng thái.'
                      : 'Đơn hàng đã được ghi nhận ở trạng thái chờ thanh toán (Webhook chưa cấu hình trên môi trường này).'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void onRefreshWorkspace()}
                    className="w-full min-h-[42px] rounded-xl cafe-btn-secondary text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Kiểm tra cập nhật gói
                  </button>
                </div>
              </div>
            ) : (
              effectiveSelected && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  <div className="md:col-span-8 rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] p-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-[#846B58]">Gói đã chọn</span>
                      <span className="font-extrabold text-[#594638]">{effectiveSelected.name}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-[#846B58]">Hạn mức bot</span>
                      <span className="font-bold text-[#594638]">{effectiveSelected.maxBots} bot Minecraft Java</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-[#846B58]">Thời hạn sử dụng</span>
                      <span className="font-bold text-[#594638]">{effectiveSelected.durationDays} ngày</span>
                    </div>
                    <div className="flex items-center justify-between pt-2.5 cafe-receipt-divider">
                      <span className="font-bold text-[#594638]">Tổng thanh toán (VietQR)</span>
                      <span className="text-xl font-extrabold text-[#B58B68]">
                        {formatVnd(effectiveSelected.priceVnd)}
                      </span>
                    </div>
                  </div>
                  <div className="md:col-span-4 space-y-2.5">
                    <button
                      type="button"
                      disabled={checkoutBusy}
                      onClick={() => void handleConfirmCheckout(effectiveSelected)}
                      className="w-full min-h-[46px] rounded-xl cafe-btn-primary text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {checkoutBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                      {checkoutBusy ? 'Đang tạo đơn...' : 'Xác nhận tạo đơn VietQR'}
                    </button>
                    <p className="text-[11px] text-center text-[#846B58]">
                      Giá luôn được hệ thống xác thực trực tiếp từ máy chủ.
                    </p>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Café Menu Pricing Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((p, idx) => {
          const isCurrent = quota?.subscription?.planId === p.id;
          const isPopular = p.id === 'basic';
          const dailyCost = Math.round(p.priceVnd / Math.max(1, p.durationDays));
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className={`relative rounded-[26px] overflow-hidden flex flex-col justify-between cafe-card-hover ${
                isCurrent
                  ? 'bg-[#FFFFFF] border-2 border-[#4A8B5C] shadow-[0_12px_28px_rgba(74,139,92,0.14)]'
                  : isPopular
                  ? 'bg-[#FFFFFF] border-2 border-[#B58B68] shadow-[0_12px_30px_rgba(181,139,104,0.16)]'
                  : 'cafe-card hover:border-[#C9A77C]'
              }`}
            >
              <div
                className={`px-5 py-3.5 border-b border-[#EFE3D2] ${
                  isCurrent ? 'bg-[#ECF6EE]' : isPopular ? 'kraft-ticket-header' : 'bg-[#FAF5EC]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-extrabold text-[#594638]">{p.name}</span>
                  {isCurrent ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#4A8B5C] text-white text-[10px] font-extrabold">
                      Đang dùng
                    </span>
                  ) : isPopular ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#B58B68] text-white text-[10px] font-extrabold">
                      <Star className="w-3 h-3 fill-current" />
                      Phổ biến
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#FFFFFF] border border-[#DFCBB2] text-[#7A593E] text-[10px] font-extrabold">
                      {p.maxBots} bot
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-semibold text-[#846B58] mt-0.5">
                  {p.maxBots} bot Java • {p.durationDays} ngày
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-3.5">
                  <div>
                    <div className="text-2xl font-extrabold text-[#594638] tracking-tight">
                      {formatVnd(p.priceVnd)}
                    </div>
                    <div className="text-[11px] font-medium text-[#846B58] mt-0.5">
                      ~{formatVnd(dailyCost)} / ngày
                    </div>
                  </div>

                  <ul className="space-y-2 text-xs text-[#594638] pt-3 cafe-receipt-divider">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#4A8B5C] shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveOrder(null);
                    setOrderError(null);
                    setSelectedPlan(p);
                  }}
                  className={`w-full min-h-[42px] rounded-xl text-xs font-extrabold cursor-pointer transition ${
                    isPopular || isCurrent ? 'cafe-btn-primary' : 'cafe-btn-secondary hover:bg-[#F3E8D8]'
                  }`}
                >
                  {isCurrent ? 'Gia hạn gói này' : 'Chọn mua gói'}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

interface AccountDashboardProps {
  user: UserProfile;
  quota: QuotaInfo | null;
  plans: PlanItem[];
  recentActivity: AuditLogItem[];
  sessionOrders: CheckoutResponse[];
  onGoToStore: () => void;
  onGoToBots: () => void;
  onProfileUpdated: (user: UserProfile) => void;
  notify: (type: 'ok' | 'err', text: string) => void;
  onDeleteAccount: () => Promise<void>;
}

function resizeAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Định dạng ảnh không hợp lệ.'));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Trình duyệt không hỗ trợ xử lý ảnh.'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        const webp = canvas.toDataURL('image/webp', 0.86);
        resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function AccountDashboard({
  user,
  quota,
  plans,
  recentActivity,
  sessionOrders,
  onGoToStore,
  onGoToBots,
  onProfileUpdated,
  notify,
  onDeleteAccount,
}: AccountDashboardProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName || user.username);
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify('err', 'Ảnh gốc quá lớn (tối đa 5MB).');
      return;
    }
    try {
      const resized = await resizeAvatarImage(file);
      setAvatarUrl(resized);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Không thể xử lý ảnh.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api<{ user: UserProfile }>('/api/account/profile', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim(),
          avatarUrl,
        }),
      });
      onProfileUpdated(res.user);
      notify('ok', 'Đã lưu hồ sơ thành viên.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Lưu hồ sơ thất bại.');
    } finally {
      setSavingProfile(false);
    }
  };

  const currentPlan = useMemo(() => {
    if (!quota?.subscription?.planId) return null;
    return plans.find((p) => p.id === quota.subscription?.planId) ?? null;
  }, [quota, plans]);

  const billingLogs = useMemo(
    () =>
      recentActivity.filter((l) =>
        ['CHECKOUT_CREATED', 'SUBSCRIPTION_ACTIVATED'].includes(l.action)
      ),
    [recentActivity]
  );

  const slotUsed = quota?.usedBots ?? 0;
  const slotMax = quota?.maxBots ?? 0;
  const slotPct = slotMax > 0 ? Math.min(100, Math.round((slotUsed / slotMax) * 100)) : 0;

  return (
    <div className="space-y-5">
      {/* Café Member Pass Banner */}
      <div className="rounded-[28px] cafe-card overflow-hidden">
        <div className="p-5 sm:p-6 kraft-surface border-b border-[#E5D4BE] grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-8 space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFDF7] border border-[#DFCBB2] text-[11px] font-bold text-[#7A593E]">
                <Coffee className="w-3.5 h-3.5 text-[#B58B68]" />
                Thẻ thành viên dịch vụ
              </span>
              {quota?.subscription && (
                <span className="px-3 py-1 rounded-full bg-[#ECF6EE] border border-[#BFE0C8] text-[#2F6B43] text-[11px] font-extrabold">
                  {formatRemainingDays(quota.subscription.expiresAt)}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#594638]">
                {currentPlan
                  ? currentPlan.name
                  : quota?.subscription
                  ? `Gói ${quota.subscription.planId}`
                  : 'Chưa kích hoạt gói thuê'}
              </h2>
              <p className="text-xs text-[#7A6252]">
                {quota?.subscription
                  ? `Hết hạn ngày ${formatDateTime(quota.subscription.expiresAt)}`
                  : 'Chọn một gói thuê phù hợp tại cửa hàng để mở khóa slot tạo và treo bot Minecraft Java.'}
              </p>
            </div>

            {/* Slot Usage Meter */}
            <div className="max-w-md space-y-1.5 bg-[#FFFDF7]/90 rounded-2xl border border-[#E5D4BE] p-3">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-[#846B58]">Slot Bot đang sử dụng</span>
                <span className="font-mono text-[#594638]">
                  {slotUsed} / {slotMax} bot ({slotPct}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#F3E8D8] overflow-hidden">
                <div
                  style={{ width: `${slotPct}%` }}
                  className="h-full bg-[#B58B68] rounded-full transition-all duration-300"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={onGoToBots}
                className="px-4 py-2.5 rounded-xl cafe-btn-primary text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Bot className="w-4 h-4" />
                Mở Panel điều khiển Bot
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onGoToStore}
                className="px-4 py-2.5 rounded-xl cafe-btn-secondary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CreditCard className="w-4 h-4 text-[#B58B68]" />
                {quota?.subscription ? 'Nâng cấp / Gia hạn' : 'Xem bảng giá gói'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 hidden sm:block">
            <div className="rounded-2xl overflow-hidden border-2 border-[#FFFDF7] shadow-sm aspect-[16/10] bg-[#FFFDF7]">
              <CafeImage
                primary={CAFE_IMAGES.autumnTree.primary}
                fallback={CAFE_IMAGES.autumnTree.fallback}
                alt={CAFE_IMAGES.autumnTree.alt}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Details: Account Info & Order History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Account Info & Profile Customization */}
        <div className="lg:col-span-5 rounded-[26px] cafe-card p-5 space-y-4">
          <div className="flex items-center gap-3.5 pb-3 border-b border-[#F0E3D1]">
            <div className="relative group shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName || user.username}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-[#DFCBB2] shadow-xs"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl kraft-surface border-2 border-[#DFCBB2] flex items-center justify-center text-lg font-extrabold text-[#594638] uppercase">
                  {(displayName.trim() || user.username).slice(0, 2)}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Đổi ảnh đại diện từ máy"
                aria-label="Đổi ảnh đại diện từ máy"
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-[#B58B68] hover:bg-[#9E7554] text-white flex items-center justify-center shadow-sm border-2 border-[#FFFDF7] cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => void handleAvatarUpload(e)}
                className="hidden"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-base font-extrabold text-[#594638] truncate">
                {displayName.trim() || user.username}
              </div>
              <div className="text-[11px] text-[#846B58] truncate">
                @{user.username} • {user.email}
              </div>
              <div className="flex flex-wrap items-center gap-2.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] font-bold text-[#B58B68] hover:text-[#594638] cursor-pointer"
                >
                  Tải ảnh từ máy
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    className="text-[11px] font-bold text-[#A63A2E] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    Gỡ ảnh
                  </button>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={(e) => void handleSaveProfile(e)} className="space-y-3 text-xs">
            <div>
              <label htmlFor="profile-display-name" className="block font-bold text-[#594638] mb-1">
                Tên hiển thị
              </label>
              <input
                id="profile-display-name"
                type="text"
                maxLength={40}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nhập tên hiển thị của bạn..."
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-xs font-semibold text-[#594638] cafe-input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="profile-bio" className="font-bold text-[#594638]">
                  Tiểu sử
                </label>
                <span className="text-[10px] font-mono text-[#9C826D]">{bio.length}/240</span>
              </div>
              <textarea
                id="profile-bio"
                rows={3}
                maxLength={240}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Giới thiệu ngắn về bạn hoặc server Minecraft bạn đang chơi..."
                className="w-full p-3 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-xs text-[#594638] placeholder:text-[#A9927E] cafe-input resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              className="w-full min-h-[40px] rounded-xl cafe-btn-primary text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {savingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {savingProfile ? 'Đang lưu hồ sơ...' : 'Lưu hồ sơ'}
            </button>
          </form>

          <dl className="space-y-2 text-xs pt-1">
            <div className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] px-3.5 py-2 flex justify-between gap-2">
              <dt className="text-[#846B58]">Tên đăng nhập</dt>
              <dd className="font-extrabold text-[#594638]">{user.username}</dd>
            </div>
            <div className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] px-3.5 py-2 flex justify-between gap-2">
              <dt className="text-[#846B58]">Email</dt>
              <dd className="font-bold text-[#594638] truncate">{user.email}</dd>
            </div>
            <div className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] px-3.5 py-2 flex justify-between gap-2">
              <dt className="text-[#846B58]">Vai trò</dt>
              <dd className="uppercase font-mono font-bold text-[#B58B68]">{user.role}</dd>
            </div>
            {user.discordId && (
              <div className="rounded-2xl bg-[#EEF0FE] border border-[#C7CCF9] px-3.5 py-2 flex justify-between gap-2">
                <dt className="text-[#4752C4] font-semibold">Discord đã liên kết</dt>
                <dd className="font-mono font-bold text-[#5865F2]">{user.discordId}</dd>
              </div>
            )}
          </dl>

          <div className="pt-3 cafe-receipt-divider space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#A63A2E]">
              <ShieldAlert className="w-4 h-4" />
              <span>Khu vực thao tác nhạy cảm</span>
            </div>
            <p className="text-[11px] text-[#846B58] leading-relaxed">
              Xóa tài khoản sẽ gỡ toàn bộ dữ liệu bot và phiên đăng nhập hiện có. Hành động này không thể hoàn tác.
            </p>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#FCECE9] border border-[#EBBDB5] text-[#A63A2E] hover:bg-[#F8DBD5] text-xs font-extrabold cursor-pointer transition"
            >
              Xóa tài khoản &amp; dữ liệu cá nhân
            </button>
          </div>
        </div>

        {/* Order & Payment History */}
        <div className="lg:col-span-7 rounded-[26px] cafe-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#F0E3D1]">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#594638]">
              <Calendar className="w-4 h-4 text-[#B58B68]" />
              <span>Lịch sử đơn hàng &amp; thanh toán</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-[#F3E8D8] text-[11px] font-bold text-[#7A593E]">
              {sessionOrders.length + billingLogs.length} bản ghi
            </span>
          </div>

          {sessionOrders.length === 0 && billingLogs.length === 0 ? (
            <div className="rounded-2xl bg-[#FFFDF7] border border-dashed border-[#DFCBB2] py-10 px-4 text-center space-y-2">
              <p className="text-xs font-bold text-[#594638]">Chưa có giao dịch nào được ghi nhận</p>
              <p className="text-[11px] text-[#846B58]">
                Các đơn thanh toán VietQR và lần kích hoạt gói sẽ hiển thị tại đây.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sessionOrders.map((ord) => (
                <div
                  key={ord.payment.id}
                  className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-extrabold text-[#594638]">
                      Gói {ord.plan.name} • {formatVnd(ord.payment.amountVnd)}
                    </div>
                    <div className="font-mono text-[11px] text-[#846B58]">
                      #{ord.payment.id.slice(0, 8)} • {formatDateTime(ord.payment.createdAt)}
                    </div>
                  </div>
                  <PaymentStatusBadge status={ord.payment.status} />
                </div>
              ))}

              {billingLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-bold text-[#594638]">{log.detail}</div>
                    <div className="font-mono text-[11px] text-[#846B58]">
                      {log.action} • {formatDateTime(log.createdAt)}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      log.action === 'SUBSCRIPTION_ACTIVATED'
                        ? 'bg-[#ECF6EE] text-[#2F6B43] border-[#BFE0C8]'
                        : 'bg-[#FDF4E3] text-[#9A6520] border-[#EAD0A0]'
                    }`}
                  >
                    {log.action === 'SUBSCRIPTION_ACTIVATED' ? 'Đã kích hoạt' : 'Đã tạo đơn'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmDeleteOpen}
        title="Xác nhận xóa tài khoản?"
        description="Toàn bộ thông tin tài khoản, danh sách bot và phiên đăng nhập hiện tại sẽ bị xóa vĩnh viễn khỏi hệ thống."
        confirmLabel="Xóa tài khoản"
        danger
        busy={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await onDeleteAccount();
          } finally {
            setDeleting(false);
            setConfirmDeleteOpen(false);
          }
        }}
      />
    </div>
  );
}
