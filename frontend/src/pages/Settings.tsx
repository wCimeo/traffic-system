import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  Download,
  FileArchive,
  KeyRound,
  Laptop,
  Lock,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import api from '../api';

type SettingsSection = 'overview' | 'password' | 'archive';
type ThemeMode = 'light' | 'dark' | 'system';
type CurrentUser = {
  id?: number;
  username?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  nickname?: string | null;
  displayName?: string | null;
  gender?: string | null;
  isPasswordSet?: boolean;
  lastLoginTime?: string | null;
  lastLoginIp?: string | null;
};

const SETTINGS_SECTION_KEY = 'traffic_settings_active_section';
const SETTINGS_THEME_KEY = 'traffic_theme_mode';
const NODE_OPTIONS = ['all', 'A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10'];

function getStoredSection(): SettingsSection {
  const stored = localStorage.getItem(SETTINGS_SECTION_KEY);
  return stored === 'password' || stored === 'archive' || stored === 'overview' ? stored : 'overview';
}

function getSectionFromSearch(search: string): SettingsSection | null {
  const section = new URLSearchParams(search).get('section');
  return section === 'password' || section === 'archive' || section === 'overview' ? section : null;
}

function getStoredThemeMode(): ThemeMode {
  const stored = localStorage.getItem(SETTINGS_THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const resolved = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
  root.dataset.themeMode = mode;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

function formatDateTime(value?: string | null) {
  if (!value) return '暂无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无记录';
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function Settings() {
  const location = useLocation();
  const storedUser = JSON.parse(localStorage.getItem('user') || '{"displayName":"管理员","username":"admin_traffic"}');
  const [activeSection, setActiveSection] = useState<SettingsSection>(getStoredSection);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<CurrentUser>(storedUser);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [nodeId, setNodeId] = useState('all');
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    const section = getSectionFromSearch(location.search);
    if (section) setActiveSection(section);
  }, [location.search]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_SECTION_KEY, activeSection);
  }, [activeSection]);

  useEffect(() => {
    api.get('/api/auth/me')
      .then((res) => {
        setUser(res.data.user);
        localStorage.setItem('user', JSON.stringify(res.data.user));
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_THEME_KEY, themeMode);
    applyTheme(themeMode);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncResolvedTheme = () => {
      const nextTheme = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
      setResolvedTheme(nextTheme);
      applyTheme(themeMode);
    };

    syncResolvedTheme();
    media.addEventListener('change', syncResolvedTheme);
    return () => media.removeEventListener('change', syncResolvedTheme);
  }, [themeMode]);

  const handleChangePassword = async () => {
    if (user.isPasswordSet && !pwForm.oldPassword) {
      setPwMsg({ text: '请输入当前密码', ok: false });
      return;
    }
    if (!pwForm.newPassword || pwForm.newPassword.length < 6) {
      setPwMsg({ text: '新密码至少需要 6 位', ok: false });
      return;
    }
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwMsg({ text: '两次输入的新密码不一致', ok: false });
      return;
    }

    setPwLoading(true);
    try {
      const res = await api.post('/api/auth/change-password', {
        oldPassword: pwForm.oldPassword,
        newPassword: pwForm.newPassword,
      });
      setUser(res.data.user);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setPwMsg({ text: user.isPasswordSet ? '密码修改成功' : '登录密码设置成功', ok: true });
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (err: any) {
      setPwMsg({ text: err.response?.data?.error || '密码更新失败，请重试', ok: false });
    } finally {
      setTimeout(() => setPwLoading(false), 600);
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (startDate) params.append('start', startDate);
    if (endDate) params.append('end', endDate);
    if (nodeId) params.append('node_id', nodeId);
    const token = localStorage.getItem('token');
    window.open(`http://localhost:3001/api/report/export?${params.toString()}&token=${token}`);
  };

  const navItems = [
    { key: 'overview' as SettingsSection, label: '用户信息', desc: '账号资料与登录记录', icon: User },
    { key: 'password' as SettingsSection, label: user.isPasswordSet ? '修改密码' : '设置密码', desc: '账号安全与密码更新', icon: KeyRound },
    { key: 'archive' as SettingsSection, label: '历史档案导出', desc: '历史路况与数据报表', icon: FileArchive },
  ];

  const themeOptions: Array<{ key: ThemeMode; label: string; desc: string; icon: typeof Sun }> = [
    { key: 'light', label: '浅色', desc: '保持明亮控制台外观', icon: Sun },
    { key: 'dark', label: '深色', desc: '切换为低亮度深色界面', icon: Moon },
    { key: 'system', label: '跟随系统', desc: '自动匹配操作系统主题', icon: Laptop },
  ];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">系统设置</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">管理账号资料、安全密码、主题偏好和历史数据导出。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="console-card h-fit bg-white p-4">
          <div className="px-3 pb-4 pt-2">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">系统设置</div>
            <div className="mt-2 text-sm font-semibold text-slate-500">请选择一个功能模块</div>
          </div>

          <div className="space-y-2">
            {navItems.map((item) => {
              const isActive = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={`flex w-full items-center gap-4 rounded-[24px] px-4 py-4 text-left transition-all ${
                    isActive ? 'bg-brand-50 ring-1 ring-brand-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                    isActive ? 'bg-white text-brand-600 shadow-sm' : 'bg-slate-50 text-slate-500'
                  }`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-black ${isActive ? 'text-slate-950' : 'text-slate-800'}`}>{item.label}</div>
                    <div className="mt-1 text-xs font-medium text-slate-500">{item.desc}</div>
                  </div>
                  <ChevronRight className={`h-4 w-4 ${isActive ? 'text-brand-600' : 'text-slate-300'}`} />
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {activeSection === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {!user.isPasswordSet && (
                  <button
                    onClick={() => setActiveSection('password')}
                    className="flex w-full items-center justify-between rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-left text-amber-800"
                  >
                    <div>
                      <div className="text-sm font-black">请设置密码以保障账户安全</div>
                      <div className="mt-1 text-xs font-semibold text-amber-700">手机号验证码注册的新用户可以在这里补全登录密码。</div>
                    </div>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}

                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-center gap-4">
                    <img
                      src={user.avatarUrl || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.displayName || user.username || 'user')}`}
                      alt="用户头像"
                      className="h-16 w-16 rounded-2xl border border-slate-100 bg-slate-50"
                    />
                    <div>
                      <h3 className="text-xl font-black text-slate-900">{user.nickname || user.displayName || '用户'}</h3>
                      <p className="mt-1 text-sm text-slate-500">上次登录时间：{formatDateTime(user.lastLoginTime)}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {[
                      { label: '用户名', value: user.username || '待完善', icon: ShieldCheck },
                      { label: '手机号', value: user.phone || '未绑定', icon: User },
                      { label: '性别', value: user.gender || '未设置', icon: User },
                      { label: '上次登录 IP', value: user.lastLoginIp || '暂无记录', icon: Monitor },
                      { label: '密码状态', value: user.isPasswordSet ? '已设置' : '未设置', icon: Lock },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between border-b border-slate-50 py-4 last:border-b-0">
                        <div className="flex items-center gap-3">
                          <item.icon className="h-4 w-4 text-slate-400" />
                          <span className="text-sm font-semibold text-slate-500">{item.label}</span>
                        </div>
                        <span className="text-sm font-black text-slate-900">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                      <Monitor className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">系统主题</h3>
                      <p className="text-sm text-slate-500">切换浅色、深色或跟随系统外观</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {themeOptions.map((option) => {
                      const isActive = themeMode === option.key;
                      return (
                        <button
                          key={option.key}
                          onClick={() => setThemeMode(option.key)}
                          className={`rounded-[24px] border p-5 text-left transition-all ${
                            isActive ? 'border-brand-200 bg-brand-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                          }`}
                        >
                          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                            <option.icon className="h-5 w-5" />
                          </div>
                          <div className="text-sm font-black text-slate-900">{option.label}</div>
                          <div className="mt-2 text-xs leading-5 text-slate-500">{option.desc}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-6 rounded-[24px] bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">当前生效主题</div>
                    <div className="mt-2 text-sm font-black text-slate-900">
                      {themeMode === 'system' ? `跟随系统（当前为${resolvedTheme === 'dark' ? '深色' : '浅色'}）` : themeMode === 'dark' ? '深色' : '浅色'}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'password' && (
              <motion.div
                key="password"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="console-card bg-white p-8"
              >
                <div className="mb-8 flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white ${user.isPasswordSet ? 'bg-slate-900' : 'bg-amber-500'}`}>
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{user.isPasswordSet ? '修改密码' : '设置登录密码'}</h3>
                    <p className="text-sm text-slate-500">
                      {user.isPasswordSet ? '更新当前账号的登录密码' : '请设置密码以保障账户安全，并启用账号密码登录'}
                    </p>
                  </div>
                </div>

                {!user.isPasswordSet && (
                  <div className="mb-6 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
                    当前账号通过手机验证码注册，尚未设置登录密码。
                  </div>
                )}

                <div className="space-y-5">
                  {user.isPasswordSet && (
                    <div className="space-y-2">
                      <label className="ml-1 text-[11px] font-bold text-slate-500">当前密码</label>
                      <input
                        type="password"
                        className="input-base bg-white ring-1 ring-slate-100"
                        placeholder="请输入当前密码"
                        value={pwForm.oldPassword}
                        onChange={(e) => setPwForm({ ...pwForm, oldPassword: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="ml-1 text-[11px] font-bold text-slate-500">新密码</label>
                    <input
                      type="password"
                      className="input-base bg-white ring-1 ring-slate-100"
                      placeholder="请输入至少 6 位新密码"
                      value={pwForm.newPassword}
                      onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="ml-1 text-[11px] font-bold text-slate-500">确认新密码</label>
                    <input
                      type="password"
                      className="input-base bg-white ring-1 ring-slate-100"
                      placeholder="请再次输入新密码"
                      value={pwForm.confirm}
                      onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                    />
                  </div>

                  <AnimatePresence>
                    {pwMsg && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-4 text-sm font-semibold ${
                          pwMsg.ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-red-100 bg-red-50 text-red-600'
                        }`}
                      >
                        {pwMsg.ok ? <Check className="h-4 w-4" /> : <div className="h-2 w-2 rounded-full bg-red-500" />}
                        <span>{pwMsg.text}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button onClick={handleChangePassword} disabled={pwLoading} className="btn-primary h-12 w-full gap-2">
                    <span>{pwLoading ? '正在更新密码...' : user.isPasswordSet ? '确认修改密码' : '确认设置密码'}</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {activeSection === 'archive' && (
              <motion.div
                key="archive"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="console-card bg-white p-8"
              >
                <div className="mb-8 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <Download className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">历史档案数据导出</h3>
                    <p className="text-sm text-slate-500">导出历史路况档案和报表数据</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div className="space-y-2">
                    <label className="ml-1 text-[11px] font-bold text-slate-500">开始日期</label>
                    <input type="date" className="input-base bg-white ring-1 ring-slate-100" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="ml-1 text-[11px] font-bold text-slate-500">结束日期</label>
                    <input type="date" className="input-base bg-white ring-1 ring-slate-100" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="ml-1 text-[11px] font-bold text-slate-500">路口范围</label>
                    <select className="input-base bg-white ring-1 ring-slate-100" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
                      <option value="all">全部路口</option>
                      {NODE_OPTIONS.slice(1).map((node) => <option key={node} value={node}>{node}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-6 rounded-[28px] bg-slate-50 p-6 ring-1 ring-slate-100">
                  <div className="mb-4 text-base font-black text-slate-900">导出说明</div>
                  <p className="text-sm leading-6 text-slate-500">CSV 会根据当前时间范围和路口筛选条件生成，适合离线分析、论文附录和二次清洗。</p>
                  <button onClick={handleExport} className="btn-primary mt-5 gap-2">
                    <Download className="h-4 w-4" />
                    <span>导出历史 CSV</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
