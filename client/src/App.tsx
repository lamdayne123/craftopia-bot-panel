import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Cpu,
  CreditCard,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Server,
  Shield,
  SlidersHorizontal,
  Terminal,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type {
  BotItem,
  CheckoutResponse,
  NavTab,
  OverviewData,
  PlanItem,
  PublicHealthData,
  PublicPage,
  QuotaInfo,
  UserProfile,
  WorkerItem,
} from './types';
import { api } from './utils/format';
import { AnimatedProgressBar, BrandLogo, CafeScrollProgress } from './components/CafeUI';
import { SalesSite } from './components/SalesSite';
import { BotConsole } from './components/BotConsole';
import { AccountDashboard, StoreView } from './components/StoreAndAccount';
import {
  BotConfigWizardView,
  BotListView,
  OverviewView,
  type WizardFormState,
} from './components/BotManagement';
import {
  ActivityLogsView,
  AdminHealthView,
  AdminUsersView,
  AdminWorkersView,
  BedrockComingSoonView,
  ResourcesView,
} from './components/ActivityAndResources';

export default function App() {
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  // Public storefront state
  const [publicPage, setPublicPage] = useState<PublicPage>('home');
  const [publicHealth, setPublicHealth] = useState<PublicHealthData | null>(null);
  const [preselectedPlanId, setPreselectedPlanId] = useState<string | null>(null);

  // Auth form state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Dashboard state
  const [tab, setTab] = useState<NavTab>('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [bots, setBots] = useState<BotItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [selectedConsoleBotId, setSelectedConsoleBotId] = useState<string | null>(null);
  const [sessionOrders, setSessionOrders] = useState<CheckoutResponse[]>([]);

  // 5-Step Create Bot Wizard State
  const [wizardStep, setWizardStep] = useState(1);
  const [wizard, setWizard] = useState<WizardFormState>({
    host: '',
    port: 25565,
    version: '1.21.4',
    name: '',
    mcUsername: '',
    authMode: 'offline',
    autoRegister: false,
    autoLogin: false,
    registerTemplate: '/register {password} {password}',
    loginTemplate: '/login {password}',
    serverPassword: '',
    autoStart: true,
    idempotencyKey: `bot_${Date.now()}`,
  });

  const notify = useCallback((type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast((curr) => (curr?.text === text ? null : curr)), 4200);
  }, []);

  const loadWorkspace = useCallback(async (currUser: UserProfile) => {
    setLoadingWorkspace(true);
    try {
      const [meRes, ovRes, botsRes, plansRes] = await Promise.all([
        api<{ user: UserProfile; quota: QuotaInfo }>('/api/auth/me'),
        api<OverviewData>('/api/overview'),
        api<{ bots: BotItem[] }>('/api/bots'),
        api<{ plans: PlanItem[] }>('/api/plans'),
      ]);
      setQuota(meRes.quota);
      setOverview(ovRes);
      const ovBots = ovRes.bots ?? [];
      setBots(botsRes.bots.length >= ovBots.length ? botsRes.bots : ovBots);
      setPlans(plansRes.plans);

      if (currUser.role === 'admin') {
        const [wRes, uRes] = await Promise.all([
          api<{ workers: WorkerItem[] }>('/api/admin/workers'),
          api<{ users: UserProfile[] }>('/api/admin/users'),
        ]);
        setWorkers(wRes.workers);
        setUsersList(uRes.users);
      }
    } finally {
      setLoadingWorkspace(false);
    }
  }, []);

  // Initial load: public plans + health + session check
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthErr = params.get('auth_error');
    if (oauthErr) {
      const msgMap: Record<string, string> = {
        discord_not_configured: 'Đăng nhập Discord chưa được cấu hình (thiếu DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET trên server).',
        discord_state_invalid: 'Phiên xác thực Discord không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
        discord_token_failed: 'Không lấy được token từ Discord. Vui lòng thử lại.',
        discord_user_failed: 'Không đọc được thông tin tài khoản Discord.',
        discord_oauth_error: 'Đăng nhập Discord thất bại.',
      };
      setAuthError(msgMap[oauthErr] || 'Đăng nhập Discord thất bại.');
      setPublicPage('auth');
      window.history.replaceState({}, '', window.location.pathname);
    }

    Promise.all([
      api<{ plans: PlanItem[] }>('/api/plans')
        .then((res) => setPlans(res.plans))
        .catch(() => {}),
      api<PublicHealthData>('/api/health')
        .then((res) => setPublicHealth(res))
        .catch(() => {}),
      api<{ user: UserProfile; quota: QuotaInfo }>('/api/auth/me')
        .then((res) => {
          setUser(res.user);
          setQuota(res.quota);
          return loadWorkspace(res.user);
        })
        .catch(() => {}),
    ]).finally(() => setChecked(true));
  }, [loadWorkspace]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        authMode === 'login'
          ? { username: authForm.username, password: authForm.password }
          : authForm;
      const res = await api<{ user: UserProfile }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setUser(res.user);
      await loadWorkspace(res.user);
      if (preselectedPlanId) {
        setTab('store');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Xác thực thất bại');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleBotCmd = async (botId: string, action: 'start' | 'stop' | 'reconnect' | 'delete') => {
    setBusyIds((p) => ({ ...p, [botId]: true }));
    try {
      if (action === 'delete') {
        await api(`/api/bots/${botId}`, { method: 'DELETE' });
        notify('ok', 'Đã xóa bot.');
        if (selectedConsoleBotId === botId) setSelectedConsoleBotId(null);
      } else {
        await api(`/api/bots/${botId}/${action}`, { method: 'POST' });
        const label = action === 'start' ? 'START' : action === 'stop' ? 'STOP' : 'RESTART';
        notify('ok', `Đã gửi lệnh ${label} tới Worker.`);
      }
      if (user) await loadWorkspace(user);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Thao tác thất bại');
    } finally {
      setBusyIds((p) => ({ ...p, [botId]: false }));
    }
  };

  const handleCreateBot = async () => {
    setBusyIds((p) => ({ ...p, create: true }));
    try {
      const created = await api<{ bot: BotItem }>('/api/bots', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: wizard.idempotencyKey,
          engine: 'java',
          name: wizard.name,
          mcUsername: wizard.mcUsername,
          host: wizard.host,
          port: Number(wizard.port),
          version: wizard.version,
          authMode: wizard.authMode,
          serverPassword: wizard.serverPassword || undefined,
          autoStart: wizard.autoStart,
          autoAuth: {
            autoRegister: wizard.autoRegister,
            autoLogin: wizard.autoLogin,
            registerTemplate: wizard.registerTemplate,
            loginTemplate: wizard.loginTemplate,
            handleOnReconnect: true,
          },
        }),
      });
      if (created?.bot) {
        setBots((prev) => [created.bot, ...prev.filter((b) => b.id !== created.bot.id)]);
      }
      notify('ok', 'Đã tạo bot Java và điều phối tới Worker!');
      setWizardStep(1);
      setWizard((w) => ({
        ...w,
        name: '',
        mcUsername: '',
        serverPassword: '',
        idempotencyKey: `bot_${Date.now()}`,
      }));
      setTab('bots');
      if (user) await loadWorkspace(user);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Không thể tạo bot');
    } finally {
      setBusyIds((p) => ({ ...p, create: false }));
    }
  };

  const handleOpenConsole = (botId: string) => {
    setSelectedConsoleBotId(botId);
    setTab('console');
    setMobileSidebarOpen(false);
  };

  const handleLogout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setPublicPage('home');
    setMobileSidebarOpen(false);
  };

  if (!checked) {
    return (
      <div className="min-h-screen bg-[#FFFDF7] flex flex-col items-center justify-center gap-3 text-sm font-bold text-[#846B58]">
        <BrandLogo size={52} />
        <span>Đang mở Craftopia Café Cloud...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <SalesSite
        page={publicPage}
        setPage={setPublicPage}
        plans={plans}
        health={publicHealth}
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authError={authError}
        authBusy={authBusy}
        onAuthSubmit={handleAuthSubmit}
        onSelectPlanIntent={(planId) => {
          setPreselectedPlanId(planId);
          setAuthMode('register');
          setPublicPage('auth');
        }}
      />
    );
  }

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: string }> = [
    { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'bots', label: 'Bot của tôi', icon: <Bot className="w-4 h-4" />, badge: String(bots.length) },
    { id: 'console', label: 'Console', icon: <Terminal className="w-4 h-4" /> },
    { id: 'create', label: 'Cấu hình bot', icon: <SlidersHorizontal className="w-4 h-4" /> },
    { id: 'logs', label: 'Lịch sử hoạt động', icon: <Activity className="w-4 h-4" /> },
    { id: 'resources', label: 'Tài nguyên', icon: <Gauge className="w-4 h-4" /> },
    { id: 'account', label: 'Tài khoản & gói thuê', icon: <UserCircle2 className="w-4 h-4" /> },
    { id: 'store', label: 'Bảng giá & Mua gói', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'bedrock', label: 'Bedrock', icon: <Cpu className="w-4 h-4" />, badge: 'Sắp ra mắt' },
  ];

  const adminNav: Array<{ id: NavTab; label: string; icon: React.ReactNode }> =
    user.role === 'admin'
      ? [
          { id: 'admin_workers', label: 'Workers', icon: <Server className="w-4 h-4" /> },
          { id: 'admin_users', label: 'Users & Plans', icon: <Users className="w-4 h-4" /> },
          { id: 'admin_health', label: 'System Health', icon: <Shield className="w-4 h-4" /> },
        ]
      : [];

  const activeNavTitle = [...navItems, ...adminNav].find((x) => x.id === tab)?.label ?? 'Craftopia Café';
  const slotMax = quota?.maxBots ?? 0;
  const slotUsed = quota?.usedBots ?? 0;
  const slotPct = slotMax > 0 ? Math.min(100, Math.round((slotUsed / slotMax) * 100)) : 0;

  const renderSidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full justify-between gap-4">
      <div className="space-y-5 overflow-y-auto cafe-scroll pr-1">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo size={40} />
            <div className="min-w-0">
              <div className="font-extrabold text-sm text-[#594638] truncate">Craftopia Café</div>
              <div className="text-[11px] font-semibold text-[#B58B68] truncate">Java Bot Hosting</div>
            </div>
          </div>
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Đóng menu"
              className="p-1.5 rounded-xl text-[#846B58] hover:bg-[#F3E8D8] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="space-y-1">
          {navItems.map((n) => {
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setTab(n.id);
                  setMobileSidebarOpen(false);
                }}
                className={`relative w-full min-h-[40px] px-3 rounded-xl flex items-center justify-between text-xs font-bold cursor-pointer transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-[#7A6252] hover:text-[#594638] hover:bg-[#F3E8D8]/80'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId={isMobile ? 'sidebar-nav-pill-mobile' : 'sidebar-nav-pill'}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-[#B58B68] shadow-[0_4px_12px_rgba(181,139,104,0.28)]"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10 flex items-center gap-2.5 truncate">
                  {n.icon}
                  <span className="truncate">{n.label}</span>
                </span>
                {n.badge && (
                  <span
                    className={`relative z-10 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      active ? 'bg-white/25 text-white' : 'bg-[#F3E8D8] text-[#8A6242]'
                    }`}
                  >
                    {n.badge}
                  </span>
                )}
              </button>
            );
          })}

          {adminNav.length > 0 && (
            <div className="pt-4 mt-3 space-y-1 border-t border-[#E7D8C3]">
              <div className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-[#9C826D]">
                Quản trị viên
              </div>
              {adminNav.map((n) => {
                const active = tab === n.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setTab(n.id);
                      setMobileSidebarOpen(false);
                    }}
                    className={`relative w-full min-h-[38px] px-3 rounded-xl flex items-center gap-2.5 text-xs font-bold cursor-pointer transition-colors ${
                      active
                        ? 'text-[#FFFDF7]'
                        : 'text-[#7A6252] hover:text-[#594638] hover:bg-[#F3E8D8]/80'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId={isMobile ? 'admin-nav-pill-mobile' : 'admin-nav-pill'}
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-xl bg-[#594638]"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2.5">
                      {n.icon}
                      <span>{n.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>
      </div>

      {/* User Card with Live Slot Meter */}
      <div className="rounded-2xl bg-[#FFFDF7] border border-[#E5D4BE] p-3 space-y-2.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName || user.username}
                className="w-8 h-8 rounded-xl object-cover border border-[#DFCBB2] shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-[#F3E8D8] border border-[#DFCBB2] flex items-center justify-center text-xs font-extrabold text-[#B58B68] shrink-0">
                {(user.displayName || user.username).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#594638] truncate">
                {user.displayName || user.username}
              </div>
              <div className="text-[10px] font-bold text-[#B58B68] uppercase">
                {user.role} • {slotUsed}/{slotMax} slot
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="p-2 rounded-xl bg-[#FFFFFF] border border-[#DFCBB2] text-[#846B58] hover:text-[#A63A2E] hover:bg-[#FCECE9] cursor-pointer transition shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <AnimatedProgressBar percent={slotPct} shimmer />
      </div>
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
    <CafeScrollProgress />
    <div className="min-h-screen bg-[#FFFDF7] text-[#594638] flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen bg-[#FAF3E8] border-r border-[#E7D8C3] p-4 z-30">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Collapsible Sidebar Drawer */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-[#594638]/35 backdrop-blur-[2px]"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 w-72 max-w-[85vw] h-full bg-[#FAF3E8] border-r border-[#E7D8C3] p-4 shadow-xl"
            >
              {renderSidebarContent(true)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-[#FFFDF7]/92 backdrop-blur-md border-b border-[#E7D8C3] px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Mở menu điều hướng"
              className="lg:hidden p-2 rounded-xl cafe-btn-secondary cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="text-sm sm:text-base font-extrabold text-[#594638] truncate">
              {activeNavTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3E8D8] border border-[#DFCBB2] text-[11px] font-bold text-[#7A593E]">
              Slot: {slotUsed}/{slotMax}
            </span>
            <button
              type="button"
              onClick={() => void loadWorkspace(user).catch(() => {})}
              title="Làm mới dữ liệu"
              aria-label="Làm mới dữ liệu"
              className="p-2 rounded-xl cafe-btn-secondary text-[#846B58] cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loadingWorkspace ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setTab('create')}
              className="px-3.5 py-2 rounded-xl cafe-btn-primary text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Tạo Bot</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {tab === 'overview' && (
                <OverviewView
                  overview={overview}
                  bots={bots}
                  quota={quota}
                  onGoToTab={(t) => setTab(t)}
                  onOpenConsole={handleOpenConsole}
                />
              )}

              {tab === 'bots' && (
                <BotListView
                  bots={bots}
                  slotMax={slotMax}
                  busyIds={busyIds}
                  onBotCmd={handleBotCmd}
                  onOpenConsole={handleOpenConsole}
                  onGoToCreateOrStore={() => setTab(slotMax === 0 ? 'store' : 'create')}
                />
              )}

              {tab === 'console' && (
                <BotConsole
                  bots={bots}
                  selectedBotId={selectedConsoleBotId}
                  onSelectBotId={setSelectedConsoleBotId}
                  auditLogs={overview?.recentActivity ?? []}
                  workers={workers}
                  realtimeConnected={Boolean(overview?.realtimeConnected)}
                  busyIds={busyIds}
                  loadingWorkspace={loadingWorkspace}
                  onBotCmd={(id, act) => handleBotCmd(id, act)}
                  onRefresh={() => loadWorkspace(user)}
                  notify={notify}
                  onGoToBots={() => setTab('bots')}
                />
              )}

              {tab === 'create' && (
                <BotConfigWizardView
                  quota={quota}
                  healthyWorkers={overview?.healthyWorkers ?? 0}
                  wizardStep={wizardStep}
                  setWizardStep={setWizardStep}
                  wizard={wizard}
                  setWizard={setWizard}
                  busy={!!busyIds.create}
                  onCreateBot={handleCreateBot}
                  onGoToStore={() => setTab('store')}
                />
              )}

              {tab === 'logs' && (
                <ActivityLogsView logs={overview?.recentActivity ?? []} />
              )}

              {tab === 'resources' && (
                <ResourcesView
                  quota={quota}
                  overview={overview}
                  workers={workers}
                  isAdmin={user.role === 'admin'}
                />
              )}

              {tab === 'account' && (
                <AccountDashboard
                  user={user}
                  quota={quota}
                  plans={plans}
                  recentActivity={overview?.recentActivity ?? []}
                  sessionOrders={sessionOrders}
                  onGoToStore={() => setTab('store')}
                  onGoToBots={() => setTab('bots')}
                  onProfileUpdated={(updated) => setUser(updated)}
                  notify={notify}
                  onDeleteAccount={async () => {
                    await api('/api/account', { method: 'DELETE' });
                    setUser(null);
                    setPublicPage('home');
                  }}
                />
              )}

              {tab === 'store' && (
                <StoreView
                  user={user}
                  plans={plans}
                  quota={quota}
                  preselectedPlanId={preselectedPlanId}
                  onClearPreselected={() => setPreselectedPlanId(null)}
                  onRefreshWorkspace={() => loadWorkspace(user)}
                  notify={notify}
                  onOrderCreated={(ord) =>
                    setSessionOrders((prev) => [ord, ...prev.filter((o) => o.payment.id !== ord.payment.id)])
                  }
                />
              )}

              {tab === 'bedrock' && <BedrockComingSoonView />}

              {tab === 'admin_workers' && user.role === 'admin' && (
                <AdminWorkersView
                  workers={workers}
                  onRefresh={() => loadWorkspace(user)}
                  notify={notify}
                />
              )}

              {tab === 'admin_users' && user.role === 'admin' && (
                <AdminUsersView usersList={usersList} />
              )}

              {tab === 'admin_health' && user.role === 'admin' && (
                <AdminHealthView overview={overview} workersCount={workers.length} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            role="status"
            className={`fixed bottom-5 right-4 z-50 max-w-sm px-4 py-3 rounded-2xl text-xs font-bold border shadow-lg ${
              toast.type === 'ok'
                ? 'bg-[#ECF6EE] border-[#BFE0C8] text-[#2F6B43]'
                : 'bg-[#FCECE9] border-[#EBBDB5] text-[#A63A2E]'
            }`}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
