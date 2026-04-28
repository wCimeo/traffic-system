import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  AlertTriangle, 
  Navigation, 
  Settings as SettingsIcon,
  LogOut,
  Radio,
  ChevronRight
} from 'lucide-react';

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
  const user = JSON.parse(localStorage.getItem('user') || '{"displayName": "管理员", "username": "admin_traffic"}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="relative flex w-72 shrink-0 flex-col bg-white border-r border-slate-200/60 z-20">
        <div className="p-8">
          <div className="flex items-center gap-3.5 mb-10">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-500 to-emerald-400 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-brand-500/10">
                <Radio className="h-6 w-6 stroke-[2.5px]" />
              </div>
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-widest text-slate-900 leading-tight">
                Traffic<br/>Matrix
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-tighter text-brand-600/80">实时节点态势引擎</span>
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
                      ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={`h-5 w-5 stroke-[2.25px] transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
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

        <div className="mt-auto p-6 space-y-4">
          <div className="rounded-[2rem] bg-slate-50 p-4 border border-slate-100 shadow-inner">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/50 text-brand-600 font-bold">
                {user.displayName.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-800 leading-none mb-1">{user.displayName}</div>
                <div className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{user.username}</div>
              </div>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500 border border-slate-200 transition-all hover:bg-red-50 hover:text-red-600 hover:border-red-100"
          >
            <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-20 shrink-0 items-center justify-between bg-white/80 backdrop-blur-md px-10 border-b border-slate-200/50 z-10">
          <div className="flex items-center gap-4">
            <div className="h-8 w-1 bg-slate-900 rounded-full" />
            <h2 className="text-lg font-black tracking-tight text-slate-900">
              {pageTitles[location.pathname] || '后台控制系统'}
            </h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200/50">
              <div className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">智脑系统物理链路安全</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-10 scroll-smooth">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-7xl mx-auto w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
