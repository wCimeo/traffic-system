import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactElement } from 'react';

const navItems = [
  { path: '/dashboard', label: '控制台总览', icon: '📊' },
  { path: '/map', label: '实时路网地图', icon: '🗺' },
  { path: '/incidents', label: '突发事件监控', icon: '⚠️' },
  { path: '/route', label: '智能路线推荐', icon: '🧭' },
  { path: '/settings', label: '系统设置', icon: '⚙️' },
];

export default function Layout({ children }: { children: ReactElement }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      {/* 侧边栏 */}
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-100">
          <span className="text-emerald-500 text-lg">📡</span>
          <span className="font-bold text-gray-800 text-sm">智能交通系统</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-600 font-medium'
                    : 'text-gray-500 hover:bg-gray-50'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100">
          <div className="text-xs text-gray-400 mb-1">当前账号</div>
          <div className="text-sm font-medium text-gray-700">{user.displayName}</div>
          <div className="text-xs text-gray-400 mb-3">{user.username}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-500 transition"
          >
            <span>→</span> 退出登录
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  );
}