import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactElement } from 'react';

const navItems = [
  { path: '/dashboard', label: '控制台总览', icon: '▥' },
  { path: '/map', label: '实时路网地图', icon: '□' },
  { path: '/incidents', label: '突发事件监控', icon: '△' },
  { path: '/route', label: '智能路线推荐', icon: '↗' },
  { path: '/settings', label: '系统设置', icon: '⚙' },
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
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="flex h-screen min-h-0 w-screen overflow-hidden bg-[#f6faf8] text-slate-900">
      {/* 侧边栏 */}
      <aside className="flex w-[304px] shrink-0 flex-col border-r border-[#e8eef2] bg-white px-5 py-6">
        <div className="mb-10 flex min-h-16 items-center gap-4 px-1">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-base font-bold text-white shadow-lg shadow-emerald-100">◆</span>
          <div className="min-w-0">
            <div className="truncate text-2xl font-bold leading-8 text-slate-900">智能交通系统</div>
            <div className="text-base font-medium leading-6 text-emerald-600">Traffic Console</div>
          </div>
        </div>

        <nav className="flex-1 space-y-3">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `group flex min-h-12 items-center gap-4 rounded-2xl px-4 py-3 text-base font-medium transition ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-100'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base leading-none transition ${
                    isActive
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-slate-700'
                  }`}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-4 pt-10">
          <div className="rounded-2xl border border-[#e8eef2] bg-[#f8fafc] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-emerald-600 shadow-sm">
                {(user.displayName || user.username || '管').slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="mb-0.5 text-xs font-medium text-slate-400">当前账号</div>
                <div className="truncate text-base font-bold leading-6 text-slate-900">{user.displayName || '管理员'}</div>
                <div className="truncate text-sm leading-5 text-slate-500">{user.username || 'admin_traffic'}</div>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e8eef2] bg-white px-3 py-3.5 text-base font-medium text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-red-500"
          >
            <span>↪</span> 退出登录
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#e8eef2] bg-white px-7">
          <h1 className="text-base font-semibold text-slate-900">{pageTitles[location.pathname] || '智能交通系统'}</h1>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-auto bg-[#f6faf8]">
          {children}
        </main>
      </div>
    </div>
  );
}
