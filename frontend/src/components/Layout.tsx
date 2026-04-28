import type { ReactElement } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Navigation,
  Radio,
  Settings as SettingsIcon,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { path: '/dashboard', label: '控制台总览', icon: LayoutDashboard },
  { path: '/map', label: '实时路网地图', icon: MapIcon },
  { path: '/incidents', label: '突发事件监控', icon: AlertTriangle },
  { path: '/route', label: '智能路线推荐', icon: Navigation },
  { path: '/settings', label: '系统设置', icon: SettingsIcon },
];

const pageTitles: Record<string, string> = {
  '/dashboard': '控制台总览',
  '/map': '实时路网地图',
  '/incidents': '突发事件监控',
  '/route': '智能路线推荐',
  '/settings': '系统设置',
};

export default function Layout({ children }: { children: ReactElement }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{"displayName":"管理员","username":"admin_traffic"}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="relative z-20 flex w-72 shrink-0 flex-col border-r border-slate-200/60 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="p-8">
          <div className="mb-10 flex items-center gap-3.5">
            <div className="group relative">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-brand-500 to-emerald-400 opacity-25 blur transition duration-1000 group-hover:opacity-40 group-hover:duration-200" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-brand-500/10 dark:bg-brand-600">
                <Radio className="h-6 w-6 stroke-[2.5px]" />
              </div>
            </div>
            <div>
              <h1 className="text-sm font-black uppercase leading-tight tracking-widest text-slate-900 dark:text-slate-50">
                Traffic
                <br />
                Matrix
              </h1>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-tighter text-brand-600/80 dark:text-brand-300">
                  实时节点态势引擎
                </span>
              </div>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all duration-300 ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10 dark:bg-brand-600'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-50'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={`h-5 w-5 stroke-[2.25px] transition-transform duration-300 ${
                        isActive ? 'scale-110' : 'group-hover:scale-110'
                      }`}
                    />
                    <span className="flex-1">{item.label}</span>
                    {isActive && (
                      <motion.div layoutId="activeNav" className="absolute right-3">
                        <ChevronRight className="h-4 w-4 opacity-50" />
                      </motion.div>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto space-y-4 p-6">
          <div className="rounded-[2rem] border border-slate-100 bg-slate-50 p-4 shadow-inner dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white font-bold text-brand-600 shadow-sm ring-1 ring-slate-200/50 dark:bg-slate-800 dark:ring-slate-700">
                {user.displayName.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="mb-1 truncate text-sm font-bold leading-none text-slate-800 dark:text-slate-100">
                  {user.displayName}
                </div>
                <div className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {user.username}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500 transition-all hover:border-red-100 hover:bg-red-50 hover:text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-red-900/40 dark:hover:bg-red-950/40 dark:hover:text-red-300"
          >
            <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex h-20 shrink-0 items-center justify-between border-b border-slate-200/50 bg-white/80 px-10 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
          <div className="flex items-center gap-4">
            <div className="h-8 w-1 rounded-full bg-slate-900 dark:bg-brand-500" />
            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-50">
              {pageTitles[location.pathname] || '后台控制系统'}
            </h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 rounded-full border border-slate-200/50 bg-slate-100 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-300">
                智能系统物理链路安全
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-10 scroll-smooth dark:bg-slate-950">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-7xl"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
