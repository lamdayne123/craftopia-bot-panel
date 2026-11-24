import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Coffee,
  Cpu,
  KeyRound,
  Menu,
  Server,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  X,
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type { PlanItem, PublicHealthData, PublicPage } from '../types';
import { CAFE_IMAGES, formatVnd } from '../utils/format';
import { BrandLogo, CafeImage, CafeScrollProgress } from './CafeUI';

interface SalesSiteProps {
  page: PublicPage;
  setPage: (p: PublicPage) => void;
  plans: PlanItem[];
  health: PublicHealthData | null;
  authMode: 'login' | 'register';
  setAuthMode: (m: 'login' | 'register') => void;
  authForm: { username: string; email: string; password: string };
  setAuthForm: React.Dispatch<React.SetStateAction<{ username: string; email: string; password: string }>>;
  authError: string | null;
  authBusy: boolean;
  onAuthSubmit: (e: React.FormEvent) => void;
  onSelectPlanIntent: (planId: string) => void;
}

export function SalesSite({
  page,
  setPage,
  plans,
  health,
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  authError,
  authBusy,
  onAuthSubmit,
  onSelectPlanIntent,
}: SalesSiteProps) {
  const [mobileMenu, setMobileMenu] = useState(false);

  const openAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setPage('auth');
    setMobileMenu(false);
  };

  const minPrice = plans.length > 0 ? Math.min(...plans.map((p) => p.priceVnd)) : null;

  return (
    <MotionConfig reducedMotion="user">
    <CafeScrollProgress />
    <div className="min-h-screen bg-[#FFFDF7] text-[#594638] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#FFFDF7]/92 backdrop-blur-md border-b border-[#E7D8C3]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[68px] flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setPage('home')}
            className="flex items-center gap-3 text-left cursor-pointer group"
          >
            <BrandLogo size={40} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-[#594638] leading-tight">
                  Craftopia Café
                </span>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-[#F3E8D8] border border-[#DFCBB2] text-[10px] font-extrabold text-[#8A6242] tracking-wide">
                  JAVA CLOUD
                </span>
              </div>
              <div className="text-[11px] font-medium text-[#846B58]">
                Minecraft Bot Hosting
              </div>
            </div>
          </button>

          <nav className="hidden md:flex items-center gap-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setPage('home')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${
                page === 'home'
                  ? 'bg-[#F3E8D8] text-[#594638] font-bold shadow-[inset_0_0_0_1px_#DFCBB2]'
                  : 'text-[#7A6252] hover:bg-[#F3E8D8]/60 hover:text-[#594638]'
              }`}
            >
              Trang chủ
            </button>
            <a
              href="#how-it-works"
              onClick={() => setPage('home')}
              className="px-3.5 py-2 rounded-xl text-[#7A6252] hover:bg-[#F3E8D8]/60 hover:text-[#594638] transition"
            >
              Cách hoạt động
            </a>
            <button
              type="button"
              onClick={() => setPage('pricing')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${
                page === 'pricing'
                  ? 'bg-[#F3E8D8] text-[#594638] font-bold shadow-[inset_0_0_0_1px_#DFCBB2]'
                  : 'text-[#7A6252] hover:bg-[#F3E8D8]/60 hover:text-[#594638]'
              }`}
            >
              Bảng giá
            </button>
            <a
              href="#system-status"
              onClick={() => setPage('home')}
              className="px-3.5 py-2 rounded-xl text-[#7A6252] hover:bg-[#F3E8D8]/60 hover:text-[#594638] transition inline-flex items-center gap-1.5"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  health?.ok ? 'bg-[#3D8B57]' : 'bg-[#C98A32]'
                }`}
              />
              <span>Trạng thái</span>
            </a>
          </nav>

          <div className="hidden md:flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => openAuth('login')}
              className="px-4 py-2.5 rounded-xl cafe-btn-secondary text-xs font-bold cursor-pointer"
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => openAuth('register')}
              className="px-4 py-2.5 rounded-xl cafe-btn-primary text-xs font-extrabold cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Đăng ký ngay</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenu((v) => !v)}
            aria-label="Mở menu điều hướng"
            className="md:hidden p-2.5 rounded-xl cafe-btn-secondary cursor-pointer"
          >
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Nav Drawer */}
        <AnimatePresence>
          {mobileMenu && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden border-t border-[#E7D8C3] bg-[#FFFDF7] px-4 py-4 space-y-2 shadow-lg"
            >
              <button
                type="button"
                onClick={() => {
                  setPage('home');
                  setMobileMenu(false);
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold ${
                  page === 'home' ? 'bg-[#F3E8D8] text-[#594638]' : 'text-[#594638] hover:bg-[#F3E8D8]/60'
                }`}
              >
                Trang chủ
              </button>
              <button
                type="button"
                onClick={() => {
                  setPage('pricing');
                  setMobileMenu(false);
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold ${
                  page === 'pricing' ? 'bg-[#F3E8D8] text-[#594638]' : 'text-[#594638] hover:bg-[#F3E8D8]/60'
                }`}
              >
                Bảng giá dịch vụ
              </button>
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => openAuth('login')}
                  className="min-h-[44px] rounded-xl cafe-btn-secondary text-xs font-bold"
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => openAuth('register')}
                  className="min-h-[44px] rounded-xl cafe-btn-primary text-xs font-extrabold"
                >
                  Đăng ký
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* AUTH PAGE */}
      {page === 'auth' && (
        <main className="flex-1 flex items-center justify-center px-4 py-10 cafe-sunlit-bg">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 rounded-[28px] overflow-hidden cafe-card"
          >
            {/* Left Café Illustration */}
            <div className="hidden md:flex md:col-span-5 relative flex-col justify-between p-6 kraft-surface border-r border-[#E7D8C3]">
              <div className="relative z-10 flex items-center gap-2.5">
                <BrandLogo size={36} />
                <div>
                  <div className="font-extrabold text-sm text-[#594638]">Craftopia Café</div>
                  <div className="text-[10px] font-semibold text-[#8A6242]">Minecraft Java Cloud</div>
                </div>
              </div>

              <div className="relative z-10 my-5 rounded-2xl overflow-hidden border-2 border-[#FFFDF7] shadow-[0_10px_24px_rgba(89,70,56,0.12)] aspect-[16/10] bg-[#594638]">
                <CafeImage
                  primary={CAFE_IMAGES.rainyWindow.primary}
                  fallback={CAFE_IMAGES.rainyWindow.fallback}
                  alt={CAFE_IMAGES.rainyWindow.alt}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="relative z-10 space-y-3">
                <p className="font-serif-cafe italic text-[15px] font-semibold text-[#594638] leading-snug">
                  “Treo bot êm nhẹ như một buổi chiều ghé quán quen.”
                </p>
                <ul className="space-y-1.5 text-[11px] font-medium text-[#7A6252]">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#4A8B5C] shrink-0" />
                    Điều phối tự động Multi-Worker
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#4A8B5C] shrink-0" />
                    Auto-Login mã hóa AES-256-GCM
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#4A8B5C] shrink-0" />
                    Console trực quan trên mọi thiết bị
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Form */}
            <div className="md:col-span-7 p-6 sm:p-9 bg-[#FFFFFF] flex flex-col justify-center space-y-5">
              {/* Mode Switcher */}
              <div className="inline-grid grid-cols-2 p-1 rounded-2xl bg-[#F3E8D8]/80 border border-[#E5D4BE] w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`relative py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                    authMode === 'login' ? 'text-[#594638]' : 'text-[#846B58] hover:text-[#594638]'
                  }`}
                >
                  {authMode === 'login' && (
                    <motion.span
                      layoutId="auth-mode-pill"
                      transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-[#FFFFFF] shadow-sm"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">Đăng nhập</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className={`relative py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                    authMode === 'register' ? 'text-[#594638]' : 'text-[#846B58] hover:text-[#594638]'
                  }`}
                >
                  {authMode === 'register' && (
                    <motion.span
                      layoutId="auth-mode-pill"
                      transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-[#FFFFFF] shadow-sm"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">Đăng ký mới</span>
                </button>
              </div>

              <div className="space-y-1">
                <h1 className="text-2xl font-extrabold text-[#594638]">
                  {authMode === 'login' ? 'Chào mừng trở lại Panel' : 'Tạo tài khoản Craftopia Café'}
                </h1>
                <p className="text-xs text-[#846B58]">
                  {authMode === 'login'
                    ? 'Đăng nhập để kiểm tra gói thuê, điều khiển bot và mở Console.'
                    : 'Tạo tài khoản để thuê slot và quản lý bot Minecraft Java.'}
                </p>
              </div>

              {authError && (
                <div className="rounded-2xl bg-[#FCECE9] border border-[#EBBDB5] px-4 py-3 text-xs font-semibold text-[#A63A2E]">
                  {authError}
                </div>
              )}

              <form onSubmit={onAuthSubmit} className="space-y-4">
                <div>
                  <label htmlFor="auth-username" className="block text-xs font-bold text-[#594638] mb-1.5">
                    Tên đăng nhập
                  </label>
                  <input
                    id="auth-username"
                    required
                    placeholder="Nhập tên đăng nhập của bạn"
                    value={authForm.username}
                    onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-sm text-[#594638] placeholder:text-[#A9927E] cafe-input"
                  />
                </div>

                {authMode === 'register' && (
                  <div>
                    <label htmlFor="auth-email" className="block text-xs font-bold text-[#594638] mb-1.5">
                      Địa chỉ Email
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      required
                      placeholder="ban@example.com"
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-sm text-[#594638] placeholder:text-[#A9927E] cafe-input"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="auth-password" className="block text-xs font-bold text-[#594638] mb-1.5">
                    Mật khẩu
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Tối thiểu 8 ký tự"
                    value={authForm.password}
                    onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FFFDF7] border border-[#DFCBB2] text-sm text-[#594638] placeholder:text-[#A9927E] cafe-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full min-h-[46px] rounded-xl cafe-btn-primary text-sm font-extrabold cursor-pointer disabled:opacity-60"
                >
                  {authBusy
                    ? 'Đang xử lý...'
                    : authMode === 'login'
                    ? 'Đăng nhập ngay'
                    : 'Tạo tài khoản & Vào Panel'}
                </button>
              </form>

              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-[#E7D8C3]" />
                <span className="shrink-0 mx-3 text-[11px] font-bold text-[#9C826D] uppercase tracking-wider">
                  hoặc
                </span>
                <div className="flex-grow border-t border-[#E7D8C3]" />
              </div>

              <button
                type="button"
                onClick={() => {
                  window.location.href = '/api/auth/discord';
                }}
                className="w-full min-h-[46px] rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-extrabold inline-flex items-center justify-center gap-2.5 shadow-[0_4px_14px_rgba(88,101,242,0.28)] cursor-pointer transition-colors"
              >
                <svg
                  className="w-5 h-5 shrink-0"
                  viewBox="0 0 127.14 96.36"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                </svg>
                <span>Tiếp tục với Discord</span>
              </button>

              <div className="flex items-center justify-between pt-3 cafe-receipt-divider text-xs">
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="font-bold text-[#B58B68] hover:text-[#594638] hover:underline cursor-pointer"
                >
                  {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
                </button>
                <button
                  type="button"
                  onClick={() => setPage('home')}
                  className="font-semibold text-[#846B58] hover:text-[#594638] cursor-pointer"
                >
                  ← Về trang chủ
                </button>
              </div>
            </div>
          </motion.div>
        </main>
      )}

      {/* HOME PAGE */}
      {page === 'home' && (
        <main className="flex-1">
          {/* Hero Section — Editorial Japanese Café × Commercial Hosting */}
          <section className="relative overflow-hidden border-b border-[#EADBC7] cafe-sunlit-bg">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-18 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="lg:col-span-6 space-y-6"
              >
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full kraft-surface border border-[#DFCBB2] text-xs font-bold text-[#7A593E] shadow-xs">
                  <Coffee className="w-3.5 h-3.5 text-[#B58B68]" />
                  <span>Minecraft Java Bot Hosting • Multi-Worker Cloud</span>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-[#594638] leading-[1.16] tracking-tight">
                  Treo Bot Minecraft Java{' '}
                  <span className="font-serif-cafe italic font-semibold text-[#B58B68]">
                    êm nhẹ, ổn định
                  </span>{' '}
                  và an tâm mỗi ngày
                </h1>

                <p className="text-sm sm:text-base text-[#7A6252] leading-relaxed max-w-xl">
                  Thuê và điều khiển bot Minecraft Java trên nhiều Worker: tự chọn node ít tải, hỗ trợ Auto-Register / Auto-Login mã hóa AES-256-GCM và Console trực tiếp trên trình duyệt.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => openAuth('register')}
                    className="px-6 py-3.5 rounded-2xl cafe-btn-primary text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <span>Bắt đầu thuê Bot</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('pricing')}
                    className="px-6 py-3.5 rounded-2xl cafe-btn-secondary text-sm font-bold cursor-pointer"
                  >
                    Xem bảng giá gói
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                  {[
                    'Kích hoạt tự động VietQR',
                    'Không cần bật máy tính',
                    'Mã hóa AES-256-GCM',
                  ].map((badge) => (
                    <div
                      key={badge}
                      className="rounded-xl bg-[#FFFFFF]/85 border border-[#E7D8C3] px-3 py-2 text-[11px] font-bold text-[#6B5443] inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#4A8B5C] shrink-0" />
                      <span className="truncate">{badge}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Hero Layered Café Postcard Showcase */}
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35 }}
                className="lg:col-span-6"
              >
                <div className="relative">
                  {/* Main Kraft Paper Postcard Frame */}
                  <div className="rounded-[30px] p-3 kraft-surface border border-[#DFCBB2] shadow-[0_18px_46px_rgba(89,70,56,0.12)]">
                    <div className="relative rounded-[22px] overflow-hidden aspect-[16/10] bg-[#F3E8D8]">
                      <CafeImage
                        primary={CAFE_IMAGES.heroSunlit.primary}
                        fallback={CAFE_IMAGES.heroSunlit.fallback}
                        alt={CAFE_IMAGES.heroSunlit.alt}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#594638]/30 via-transparent to-transparent pointer-events-none" />
                      <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[#FFFDF7]/92 border border-[#E5D4BE] text-[11px] font-bold text-[#594638] inline-flex items-center gap-1.5 shadow-sm">
                        <Sparkles className="w-3.5 h-3.5 text-[#B58B68]" />
                        <span>Craftopia Café Cloud</span>
                      </div>
                    </div>

                    {/* Bottom Live Status Bar (Strictly Real Data) */}
                    <div className="mt-3 px-4 py-3 rounded-2xl bg-[#FFFDF7] border border-[#E5D4BE] flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            health?.ok ? 'bg-[#3D8B57]' : 'bg-[#C98A32]'
                          }`}
                        />
                        <span className="font-bold text-[#594638]">
                          {health?.ok ? 'Máy chủ API sẵn sàng' : 'Đang kiểm tra kết nối...'}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#F3E8D8] text-[#7A593E]">
                        {minPrice !== null ? `Từ ${formatVnd(minPrice)} / gói` : 'Minecraft Java'}
                      </span>
                    </div>
                  </div>

                  {/* Subtle Floating Mini Rainy Café Accent Card (Desktop) */}
                  <div className="hidden sm:flex items-center gap-2.5 absolute -bottom-5 -left-4 rounded-2xl bg-[#FFFFFF] border border-[#DFCBB2] p-2 pr-3.5 shadow-[0_10px_28px_rgba(89,70,56,0.12)]">
                    <div className="w-12 h-10 rounded-xl overflow-hidden border border-[#E7D8C3] shrink-0">
                      <CafeImage
                        primary={CAFE_IMAGES.rainyWindow.primary}
                        fallback={CAFE_IMAGES.rainyWindow.fallback}
                        alt={CAFE_IMAGES.rainyWindow.alt}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-[11px] leading-tight">
                      <div className="font-extrabold text-[#594638]">Console &amp; Auto-Auth</div>
                      <div className="text-[#846B58] font-medium">Giám sát 24/7 trên web</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          {/* Benefits Section */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-9">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#B58B68]">
                  <Sparkles className="w-3.5 h-3.5" />
                  Điểm nổi bật
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#594638] tracking-tight">
                  Hạ tầng gọn gàng, thiết kế riêng cho người chơi Minecraft Java
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-[#7A6252] max-w-md">
                Mọi tính năng đều bám sát cơ chế vận hành thực tế của hệ thống — dễ cấu hình, minh bạch và ổn định lâu dài.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  num: '01',
                  icon: <Server className="w-5 h-5 text-[#B58B68]" />,
                  title: 'Điều phối Multi-Worker',
                  desc: 'Hệ thống tự động chọn node Worker khỏe và ít tải nhất khi bạn khởi tạo hoặc chạy bot Java.',
                },
                {
                  num: '02',
                  icon: <KeyRound className="w-5 h-5 text-[#B58B68]" />,
                  title: 'Auto-Auth mã hóa',
                  desc: 'Hỗ trợ cấu hình sẵn mẫu lệnh /register và /login khi vào server; mật khẩu bot mã hóa AES-256-GCM.',
                },
                {
                  num: '03',
                  icon: <Terminal className="w-5 h-5 text-[#B58B68]" />,
                  title: 'Console & Gửi lệnh',
                  desc: 'Theo dõi trạng thái kết nối, lọc lịch sử hoạt động theo cấp độ và gửi lệnh chat trực tiếp tới bot.',
                },
                {
                  num: '04',
                  icon: <ShieldCheck className="w-5 h-5 text-[#B58B68]" />,
                  title: 'Thanh toán minh bạch',
                  desc: 'Tạo đơn VietQR rõ ràng theo từng gói, xác minh tự động qua chữ ký webhook và cộng slot ngay.',
                },
              ].map((item) => (
                <div key={item.title} className="rounded-[24px] cafe-card-hover p-5 flex flex-col justify-between gap-4">
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="w-11 h-11 rounded-2xl bg-[#F3E8D8] border border-[#E5D4BE] flex items-center justify-center">
                        {item.icon}
                      </div>
                      <span className="font-mono text-xs font-extrabold text-[#C9A77C]">
                        {item.num}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-[#594638]">{item.title}</h3>
                    <p className="text-xs text-[#7A6252] leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* How It Works — Japanese Café Storyboard */}
          <section id="how-it-works" className="border-y border-[#EADBC7] kraft-surface">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              {/* Left Dual Postcard Collage */}
              <div className="lg:col-span-5 space-y-4">
                <div className="relative">
                  <div className="rounded-[26px] overflow-hidden border-2 border-[#FFFDF7] bg-[#FFFFFF] p-2.5 shadow-[0_12px_32px_rgba(89,70,56,0.10)]">
                    <div className="rounded-[18px] overflow-hidden aspect-square max-h-[340px] w-full">
                      <CafeImage
                        primary={CAFE_IMAGES.storefront.primary}
                        fallback={CAFE_IMAGES.storefront.fallback}
                        alt={CAFE_IMAGES.storefront.alt}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="pt-2.5 px-1.5 flex items-center justify-between text-[11px]">
                      <span className="font-serif-cafe italic text-[#7A6252]">
                        Góc quán nhỏ • mở cửa 24/7
                      </span>
                      <span className="font-mono font-bold text-[#B58B68]">OPEN</span>
                    </div>
                  </div>

                  {/* Overlapping Cat Bakery Mini Postcard */}
                  <div className="hidden sm:block absolute -bottom-4 -right-3 w-28 rounded-2xl bg-[#FFFFFF] p-1.5 border border-[#DFCBB2] shadow-[0_10px_24px_rgba(89,70,56,0.14)] rotate-2">
                    <div className="rounded-xl overflow-hidden aspect-square">
                      <CafeImage
                        primary={CAFE_IMAGES.bakeryCat.primary}
                        fallback={CAFE_IMAGES.bakeryCat.fallback}
                        alt={CAFE_IMAGES.bakeryCat.alt}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 3-Step Connected Journey */}
              <div className="lg:col-span-7 space-y-6">
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFDF7] border border-[#DFCBB2] text-[11px] font-extrabold text-[#9A714F] uppercase tracking-wider">
                    Quy trình 3 bước
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-[#594638] leading-tight">
                    Từ lúc chọn gói đến khi bot vào server chỉ mất vài phút
                  </h2>
                </div>

                <div className="space-y-3.5">
                  {[
                    {
                      step: '01',
                      title: 'Đăng ký tài khoản & chọn gói slot bot',
                      desc: 'Chọn gói thuê phù hợp với số lượng bot Minecraft Java bạn cần treo và xác nhận đơn thanh toán VietQR.',
                    },
                    {
                      step: '02',
                      title: 'Cấu hình Bot qua trình hướng dẫn 5 bước',
                      desc: 'Nhập địa chỉ máy chủ, cổng Port, phiên bản Java, chế độ Offline/Microsoft và thiết lập Auto-Login nếu server yêu cầu.',
                    },
                    {
                      step: '03',
                      title: 'Điều khiển & giám sát ngay trên Console',
                      desc: 'Bấm Start, Stop, Restart, theo dõi log hoạt động và gửi lệnh chat trực tiếp trên điện thoại hoặc máy tính.',
                    },
                  ].map((s) => (
                    <div
                      key={s.step}
                      className="rounded-2xl bg-[#FFFDF7] border border-[#E5D4BE] p-4 sm:p-5 flex items-start gap-4 shadow-[0_4px_14px_rgba(89,70,56,0.04)]"
                    >
                      <span className="w-11 h-11 rounded-2xl bg-[#B58B68] text-white font-mono text-sm font-extrabold flex items-center justify-center shrink-0 shadow-xs">
                        {s.step}
                      </span>
                      <div className="space-y-1">
                        <h3 className="text-sm sm:text-base font-extrabold text-[#594638]">{s.title}</h3>
                        <p className="text-xs text-[#7A6252] leading-relaxed">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Pricing Preview Section */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#B58B68]">
                  Thực đơn gói thuê
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#594638] tracking-tight">
                  Bảng giá Bot Minecraft Java rõ ràng, không chi phí ẩn
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPage('pricing')}
                className="px-4 py-2 rounded-xl cafe-btn-secondary text-xs font-extrabold text-[#594638] inline-flex items-center gap-1.5 cursor-pointer"
              >
                Xem chi tiết bảng giá <ArrowRight className="w-3.5 h-3.5 text-[#B58B68]" />
              </button>
            </div>

            <PricingCardsGrid plans={plans} onChoose={onSelectPlanIntent} />
          </section>

          {/* Real System Status (Strictly from /api/health) */}
          <section id="system-status" className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
            <div className="rounded-[28px] cafe-card overflow-hidden">
              <div className="px-6 py-5 kraft-ticket-header border-b border-[#E5D4BE] flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h2 className="text-lg font-extrabold text-[#594638]">Trạng thái hạ tầng hệ thống</h2>
                  <p className="text-xs text-[#7A6252]">
                    Thông số kiểm tra trực tiếp từ máy chủ API của Craftopia.
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border ${
                    health?.ok
                      ? 'bg-[#ECF6EE] text-[#2F6B43] border-[#BFE0C8]'
                      : 'bg-[#FDF4E3] text-[#9A6520] border-[#EAD0A0]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${health?.ok ? 'bg-[#3D8B57]' : 'bg-[#C98A32]'}`} />
                  {health?.ok ? 'API Đang hoạt động' : 'Đang kiểm tra kết nối...'}
                </span>
              </div>

              <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#FFFFFF]">
                <div className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] p-4 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#846B58]">Cơ sở dữ liệu</div>
                  <div className="text-sm font-extrabold text-[#594638]">
                    {health ? (health.postgres ? 'PostgreSQL Cloud' : 'Local Panel Storage') : 'Đang tải...'}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] p-4 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#846B58]">Kênh điều phối Realtime</div>
                  <div className="text-sm font-extrabold text-[#594638]">
                    {health ? (health.managedRealtime ? 'Managed Realtime Active' : 'Standalone Mode') : 'Đang tải...'}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#FFFDF7] border border-[#E7D8C3] p-4 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#846B58]">Nền tảng hỗ trợ</div>
                  <div className="text-sm font-extrabold text-[#594638] flex flex-wrap items-center gap-2">
                    <span>Java Edition</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#F3E8D8] border border-[#DFCBB2] text-[10px] text-[#7A593E]">
                      Bedrock: {health?.bedrockStatus === 'COMING_SOON' ? 'Sắp ra mắt' : 'Đang cập nhật'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* DEDICATED PRICING PAGE */}
      {page === 'pricing' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-12 space-y-10">
          {/* Pricing Hero Banner */}
          <div className="rounded-[28px] kraft-surface border border-[#DFCBB2] p-6 sm:p-9 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-[0_10px_30px_rgba(89,70,56,0.06)]">
            <div className="space-y-2.5 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFDF7] border border-[#DFCBB2] text-[11px] font-extrabold text-[#8A6242]">
                <Coffee className="w-3.5 h-3.5 text-[#B58B68]" />
                Bảng giá chính thức
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#594638] tracking-tight">
                Chọn gói thuê phù hợp cho đội Bot Minecraft Java của bạn
              </h1>
              <p className="text-sm text-[#7A6252] leading-relaxed">
                Toàn bộ mức giá, số lượng slot bot và thời hạn sử dụng được đồng bộ trực tiếp từ hệ thống thanh toán của Craftopia Café.
              </p>
            </div>
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border-2 border-[#FFFDF7] bg-[#FFFDF7] shrink-0 self-start md:self-center shadow-sm">
              <CafeImage
                primary={CAFE_IMAGES.bakeryCat.primary}
                fallback={CAFE_IMAGES.bakeryCat.fallback}
                alt={CAFE_IMAGES.bakeryCat.alt}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <PricingCardsGrid plans={plans} onChoose={onSelectPlanIntent} />

          {/* Dynamic Plan Comparison Table (Strictly derived from backend plans) */}
          {plans.length > 0 && (
            <div className="rounded-[26px] cafe-card overflow-hidden">
              <div className="px-6 py-4 bg-[#FAF3E8] border-b border-[#E7D8C3]">
                <h2 className="text-sm font-extrabold text-[#594638]">So sánh nhanh thông số các gói</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#EFE3D2] text-[#846B58] bg-[#FFFDF7]">
                      <th className="py-3.5 px-5 font-extrabold">Tên gói</th>
                      <th className="py-3.5 px-5 font-extrabold">Số lượng Bot</th>
                      <th className="py-3.5 px-5 font-extrabold">Thời hạn</th>
                      <th className="py-3.5 px-5 font-extrabold">Giá gói</th>
                      <th className="py-3.5 px-5 font-extrabold text-right">Ước tính / ngày</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3E8D8]">
                    {plans.map((p) => (
                      <tr key={p.id} className="hover:bg-[#FFFDF7] transition">
                        <td className="py-3.5 px-5 font-extrabold text-[#594638]">{p.name}</td>
                        <td className="py-3.5 px-5 font-semibold text-[#594638]">{p.maxBots} bot Java</td>
                        <td className="py-3.5 px-5 text-[#7A6252]">{p.durationDays} ngày</td>
                        <td className="py-3.5 px-5 font-mono font-extrabold text-[#B58B68]">
                          {formatVnd(p.priceVnd)}
                        </td>
                        <td className="py-3.5 px-5 font-mono text-[#846B58] text-right">
                          ~{formatVnd(Math.round(p.priceVnd / Math.max(1, p.durationDays)))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bottom CTA */}
          <div className="rounded-[26px] cafe-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-[#F3E8D8] border border-[#E5D4BE] flex items-center justify-center text-[#B58B68] shrink-0">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#594638]">Sẵn sàng mở Panel điều khiển Bot?</h3>
                <p className="text-xs text-[#846B58]">
                  Đăng nhập hoặc tạo tài khoản để thanh toán VietQR và kích hoạt slot bot ngay lập tức.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openAuth('register')}
              className="px-5 py-2.5 rounded-xl cafe-btn-primary text-xs font-extrabold cursor-pointer shrink-0 inline-flex items-center gap-1.5"
            >
              <span>Tạo tài khoản ngay</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="border-t border-[#E7D8C3] bg-[#F3E8D8]/60 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-11 grid grid-cols-1 sm:grid-cols-3 gap-8 text-xs">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <BrandLogo size={36} />
              <div>
                <div className="font-extrabold text-sm text-[#594638]">Craftopia Café</div>
                <div className="text-[11px] text-[#846B58]">Minecraft Java Bot Hosting</div>
              </div>
            </div>
            <p className="text-[#7A6252] leading-relaxed">
              Dịch vụ cho thuê &amp; điều phối bot Minecraft Java ấm áp, ổn định với giao diện trực quan trên cả máy tính và điện thoại.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="font-extrabold text-[#594638] uppercase tracking-wider text-[11px]">Điều hướng</div>
            <ul className="space-y-2 text-[#7A6252] font-medium">
              <li>
                <button type="button" onClick={() => setPage('home')} className="hover:text-[#594638] cursor-pointer">
                  Trang chủ
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setPage('pricing')} className="hover:text-[#594638] cursor-pointer">
                  Bảng giá gói thuê
                </button>
              </li>
              <li>
                <button type="button" onClick={() => openAuth('login')} className="hover:text-[#594638] cursor-pointer">
                  Đăng nhập Panel
                </button>
              </li>
              <li>
                <button type="button" onClick={() => openAuth('register')} className="hover:text-[#594638] cursor-pointer">
                  Đăng ký tài khoản
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <div className="font-extrabold text-[#594638] uppercase tracking-wider text-[11px]">Cam kết vận hành</div>
            <ul className="space-y-2 text-[#7A6252]">
              <li>Nền tảng: Minecraft Java Edition</li>
              <li>Thanh toán: VietQR xác minh webhook tự động</li>
              <li>Bảo mật: Mã hóa AES-256-GCM cho thông tin bot</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[#E5D4BE] py-4 text-center text-[11px] text-[#846B58]">
          © {new Date().getFullYear()} Craftopia Café Cloud. Thiết kế dành cho cộng đồng Minecraft Java.
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
}

function PricingCardsGrid({
  plans,
  onChoose,
}: {
  plans: PlanItem[];
  onChoose: (planId: string) => void;
}) {
  if (plans.length === 0) {
    return (
      <div className="rounded-3xl cafe-card p-10 text-center text-sm text-[#846B58]">
        Đang tải danh sách gói dịch vụ từ hệ thống...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {plans.map((p) => {
        const isPopular = p.id === 'basic';
        const dailyCost = Math.round(p.priceVnd / Math.max(1, p.durationDays));
        return (
          <div
            key={p.id}
            className={`relative rounded-[26px] overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 ${
              isPopular
                ? 'bg-[#FFFFFF] border-2 border-[#B58B68] shadow-[0_14px_34px_rgba(181,139,104,0.18)]'
                : 'cafe-card hover:border-[#C9A77C] hover:shadow-[0_12px_28px_rgba(89,70,56,0.09)]'
            }`}
          >
            {/* Café Ticket Header */}
            <div
              className={`px-5 py-4 border-b border-[#EFE3D2] ${
                isPopular ? 'kraft-ticket-header' : 'bg-[#FAF5EC]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-[#594638]">{p.name}</h3>
                {isPopular ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#B58B68] text-white text-[10px] font-extrabold shadow-xs">
                    <Star className="w-3 h-3 fill-current" />
                    Phổ biến
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FFFFFF] border border-[#DFCBB2] text-[10px] font-extrabold text-[#7A593E]">
                    {p.maxBots} bot
                  </span>
                )}
              </div>
              <div className="text-[11px] font-semibold text-[#846B58] mt-1">
                Tối đa {p.maxBots} bot Java • {p.durationDays} ngày
              </div>
            </div>

            {/* Card Body */}
            <div className="p-5 flex-1 flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="pb-4 cafe-receipt-divider pt-1 border-t-0">
                  <div className="text-[26px] font-extrabold text-[#594638] tracking-tight leading-none">
                    {formatVnd(p.priceVnd)}
                  </div>
                  <div className="text-[11px] font-medium text-[#846B58] mt-1.5">
                    Chỉ khoảng <span className="font-mono font-bold text-[#7A593E]">{formatVnd(dailyCost)}</span> / ngày
                  </div>
                </div>

                <ul className="space-y-2.5 text-xs text-[#594638] pt-3 cafe-receipt-divider">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#4A8B5C] shrink-0 mt-0.5" />
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => onChoose(p.id)}
                className={`w-full min-h-[44px] rounded-xl text-xs font-extrabold cursor-pointer transition inline-flex items-center justify-center gap-1.5 ${
                  isPopular ? 'cafe-btn-primary' : 'cafe-btn-secondary hover:bg-[#F3E8D8]'
                }`}
              >
                <span>Chọn gói {p.name}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
