import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import {
  Check,
  BookOpenText,
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

type SettingsSection = 'overview' | 'password' | 'archive' | 'docs';
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
type ExportRecord = {
  id: string;
  type: string;
  time: string;
  scope: string;
  range: string;
};

const SETTINGS_SECTION_KEY = 'traffic_settings_active_section';
const SETTINGS_THEME_KEY = 'traffic_theme_mode';
const EXPORT_HISTORY_KEY = 'traffic_export_history';
const NODE_OPTIONS = ['all', 'A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10', 'K11'];

function getStoredSection(): SettingsSection {
  const stored = localStorage.getItem(SETTINGS_SECTION_KEY);
  return stored === 'password' || stored === 'archive' || stored === 'overview' || stored === 'docs' ? stored : 'overview';
}

function getSectionFromSearch(search: string): SettingsSection | null {
  const section = new URLSearchParams(search).get('section');
  return section === 'password' || section === 'archive' || section === 'overview' || section === 'docs' ? section : null;
}

function getStoredThemeMode(): ThemeMode {
  const stored = localStorage.getItem(SETTINGS_THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function getStoredExportHistory(): ExportRecord[] {
  try {
    const stored = JSON.parse(localStorage.getItem(EXPORT_HISTORY_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
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

function formatGender(value?: string | null) {
  if (value === 'male') return '男';
  if (value === 'female') return '女';
  if (value === 'other') return '其他';
  if (value === 'unknown') return '不便透露';
  return '未设置';
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
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>(getStoredExportHistory);
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({
    nickname: storedUser.nickname || storedUser.displayName || '',
    avatarUrl: storedUser.avatarUrl || '',
    gender: storedUser.gender || '',
  });
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const section = getSectionFromSearch(location.search);
    if (section) setActiveSection(section);
  }, [location.search]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_SECTION_KEY, activeSection);
  }, [activeSection]);

  useEffect(() => {
    localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(exportHistory.slice(0, 10)));
  }, [exportHistory]);

  useEffect(() => {
    api.get('/api/auth/me')
      .then((res) => {
        setUser(res.data.user);
        setProfileForm({
          nickname: res.data.user.nickname || res.data.user.displayName || '',
          avatarUrl: res.data.user.avatarUrl || '',
          gender: res.data.user.gender || '',
        });
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

  const handleSaveProfile = async () => {
    if (!profileForm.nickname.trim()) {
      setProfileMsg({ text: '请输入昵称', ok: false });
      return;
    }

    setProfileLoading(true);
    try {
      const res = await api.post('/api/auth/profile', {
        nickname: profileForm.nickname.trim(),
        avatarUrl: profileForm.avatarUrl.trim(),
        gender: profileForm.gender,
      });
      setUser(res.data.user);
      setProfileForm({
        nickname: res.data.user.nickname || res.data.user.displayName || '',
        avatarUrl: res.data.user.avatarUrl || '',
        gender: res.data.user.gender || '',
      });
      localStorage.setItem('user', JSON.stringify(res.data.user));
      window.dispatchEvent(new CustomEvent('traffic:user-updated', { detail: res.data.user }));
      setProfileMsg({ text: '用户信息已保存', ok: true });
    } catch (err: any) {
      setProfileMsg({ text: err.response?.data?.error || '用户信息保存失败，请重试', ok: false });
    } finally {
      setProfileLoading(false);
    }
  };

  const saveInlineProfile = async () => {
    if (!profileForm.nickname.trim()) {
      setProfileMsg({ text: '请输入显示名称', ok: false });
      return;
    }

    setProfileLoading(true);
    try {
      const res = await api.post('/api/auth/profile', {
        nickname: profileForm.nickname.trim(),
        avatarUrl: profileForm.avatarUrl.trim(),
        gender: profileForm.gender,
      });
      setUser(res.data.user);
      setProfileForm({
        nickname: res.data.user.nickname || res.data.user.displayName || '',
        avatarUrl: res.data.user.avatarUrl || '',
        gender: res.data.user.gender || '',
      });
      localStorage.setItem('user', JSON.stringify(res.data.user));
      window.dispatchEvent(new CustomEvent('traffic:user-updated', { detail: res.data.user }));
      setProfileMsg({ text: '用户信息已保存', ok: true });
      setProfileEditing(false);
    } catch (err: any) {
      setProfileMsg({ text: err.response?.data?.error || '用户信息保存失败，请重试', ok: false });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAvatarPick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarFileChange = (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileMsg({ text: '请选择图片文件', ok: false });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setProfileMsg({ text: '头像读取失败', ok: false });
        return;
      }
      setProfileForm((current) => ({ ...current, avatarUrl: result }));
      setProfileEditing(true);
      setProfileMsg({ text: '头像已选择，保存后生效', ok: true });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const cancelInlineProfileEdit = () => {
    setProfileForm({
      nickname: user.nickname || user.displayName || '',
      avatarUrl: user.avatarUrl || '',
      gender: user.gender || '',
    });
    setProfileEditing(false);
    setProfileMsg(null);
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (startDate) params.append('start', startDate);
    if (endDate) params.append('end', endDate);
    if (nodeId) params.append('node_id', nodeId);
    const token = localStorage.getItem('token');
    const scope = nodeId === 'all' ? '全部路口' : `路口 ${nodeId}`;
    const range =
      startDate || endDate
        ? `${startDate || '开始不限'} ~ ${endDate || '结束不限'}`
        : '全部历史时间';
    setExportHistory((current) => [
      { id: `${Date.now()}`, type: '历史 CSV 导出', time: new Date().toLocaleString('zh-CN'), scope, range },
      ...current,
    ].slice(0, 10));
    window.open(`http://localhost:3001/api/report/export?${params.toString()}&token=${token}`);
  };

  const handlePredictExport = () => {
    const params = new URLSearchParams();
    if (nodeId) params.append('node_id', nodeId);
    const token = localStorage.getItem('token');
    const scope = nodeId === 'all' ? '全部路口' : `路口 ${nodeId}`;
    setExportHistory((current) => [
      {
        id: `${Date.now()}`,
        type: '预测数据导出',
        time: new Date().toLocaleString('zh-CN'),
        scope,
        range: '当前数据窗口 + 15/30 分钟预测',
      },
      ...current,
    ].slice(0, 10));
    window.open(`http://localhost:3001/api/report/predict-export?${params.toString()}&token=${token}`);
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
            <button
              onClick={() => setActiveSection('docs')}
              className={`flex w-full items-center gap-4 rounded-[24px] px-4 py-4 text-left transition-all ${
                activeSection === 'docs' ? 'bg-brand-50 ring-1 ring-brand-100' : 'hover:bg-slate-50'
              }`}
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                activeSection === 'docs' ? 'bg-white text-brand-600 shadow-sm' : 'bg-slate-50 text-slate-500'
              }`}>
                <BookOpenText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-black ${activeSection === 'docs' ? 'text-slate-950' : 'text-slate-800'}`}>系统说明</div>
                <div className="mt-1 text-xs font-medium text-slate-500">文字说明与术语解释</div>
              </div>
              <ChevronRight className={`h-4 w-4 ${activeSection === 'docs' ? 'text-brand-600' : 'text-slate-300'}`} />
            </button>
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
                    {false && <div>
                      {profileEditing ? (
                        <input
                          className="input-base h-10 w-[220px]"
                          value={profileForm.nickname}
                          onChange={(event) => setProfileForm((current) => ({ ...current, nickname: event.target.value }))}
                          placeholder="请输入显示名称"
                        />
                      ) : (
                        <h3 className="text-xl font-black text-slate-900">{user.displayName || user.nickname || user.username || '用户'}</h3>
                      )}
                      <p className="mt-1 text-sm text-slate-500">上次登录时间：{formatDateTime(user.lastLoginTime)}</p>
                    </div>}
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}

                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-start justify-between gap-4">
                    <button
                      type="button"
                      onClick={handleAvatarPick}
                      className="relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 transition-transform hover:scale-[1.02]"
                    >
                      <img
                      src={profileForm.avatarUrl || user.avatarUrl || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.displayName || user.username || 'user')}`}
                      alt="用户头像"
                      className="h-16 w-16 object-cover"
                    />
                      <span className="absolute inset-x-0 bottom-0 bg-slate-900/75 px-2 py-1 text-[10px] font-black text-white">更换头像</span>
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileChange}
                    />
                    {false && <div>
                      <h3 className="text-xl font-black text-slate-900">{user.nickname || user.displayName || '用户'}</h3>
                      <p className="mt-1 text-sm text-slate-500">上次登录时间：{formatDateTime(user.lastLoginTime)}</p>
                    </div>}
                    <div>
                      {profileEditing ? (
                        <input
                          className="input-base h-10 w-[220px]"
                          value={profileForm.nickname}
                          onChange={(event) => setProfileForm((current) => ({ ...current, nickname: event.target.value }))}
                          placeholder="请输入显示名称"
                        />
                      ) : (
                        <h3 className="text-xl font-black text-slate-900">{user.displayName || user.nickname || user.username || '用户'}</h3>
                      )}
                      <p className="mt-1 text-sm text-slate-500">上次登录时间：{formatDateTime(user.lastLoginTime)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {profileEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={cancelInlineProfileEdit}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-500 transition-colors hover:bg-slate-50"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={saveInlineProfile}
                            disabled={profileLoading}
                            className="btn-primary h-10 px-4 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {profileLoading ? '保存中...' : '保存'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setProfileEditing(true)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          编辑资料
                        </button>
                      )}
                    </div>
                  </div>

                  {profileMsg && (
                    <div className={`mb-6 text-xs font-black ${profileMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {profileMsg.text}
                    </div>
                  )}

                  <div className="hidden">
                    {[
                      { label: '用户名', value: user.username || '待完善', icon: ShieldCheck },
                      { label: '手机号', value: user.phone || '未绑定', icon: User },
                      { label: '性别', value: formatGender(user.gender), icon: User },
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

                  <div className="space-y-2">
                    
                    <div className="flex items-center justify-between border-b border-slate-50 py-4">
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-500">登录账号</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">{user.username || '待完善'}</span>
                    </div>
                    <div className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <Lock className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-500">密码状态</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">{user.isPasswordSet ? '已设置' : '未设置'}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-50 py-4">
                      <div className="flex items-center gap-3">
                        <User className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-500">手机号</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">{user.phone || '未绑定'}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-50 py-4">
                      <div className="flex items-center gap-3">
                        <User className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-500">性别</span>
                      </div>
                      {profileEditing ? (
                        <select
                          className="input-base h-10 w-[140px]"
                          value={profileForm.gender}
                          onChange={(event) => setProfileForm((current) => ({ ...current, gender: event.target.value }))}
                        >
                          <option value="">未设置</option>
                          <option value="male">男</option>
                          <option value="female">女</option>
                          <option value="other">其他</option>
                          <option value="unknown">不便透露</option>
                        </select>
                      ) : (
                        <span className="text-sm font-black text-slate-900">{formatGender(user.gender)}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-50 py-4">
                      <div className="flex items-center gap-3">
                        <Monitor className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-500">上次登录 IP</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">{user.lastLoginIp || '暂无记录'}</span>
                    </div>
                    
                  </div>

                  <div className="hidden mt-8 border-t border-slate-50 pt-8">
                    <div className="mb-5">
                      <h4 className="text-sm font-black text-slate-900">编辑用户信息</h4>
                      <p className="mt-1 text-xs font-semibold text-slate-400">头像、昵称和性别会同步更新到主界面用户卡片</p>
                    </div>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                      <div className="space-y-2">
                        <label className="ml-1 text-[11px] font-bold text-slate-500">昵称</label>
                        <input
                          className="input-base"
                          value={profileForm.nickname}
                          onChange={(event) => setProfileForm((current) => ({ ...current, nickname: event.target.value }))}
                          placeholder="请输入昵称"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="ml-1 text-[11px] font-bold text-slate-500">性别</label>
                        <select
                          className="input-base"
                          value={profileForm.gender}
                          onChange={(event) => setProfileForm((current) => ({ ...current, gender: event.target.value }))}
                        >
                          <option value="">未设置</option>
                          <option value="male">男</option>
                          <option value="female">女</option>
                          <option value="other">其他</option>
                          <option value="unknown">不便透露</option>
                        </select>
                      </div>
                      <div className="space-y-2 xl:col-span-2">
                        <label className="ml-1 text-[11px] font-bold text-slate-500">头像链接</label>
                        <input
                          className="input-base"
                          value={profileForm.avatarUrl}
                          onChange={(event) => setProfileForm((current) => ({ ...current, avatarUrl: event.target.value }))}
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <button
                        onClick={handleSaveProfile}
                        disabled={profileLoading}
                        className="btn-primary gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" />
                        <span>{profileLoading ? '保存中...' : '保存用户信息'}</span>
                      </button>
                      {profileMsg && (
                        <span className={`text-xs font-black ${profileMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                          {profileMsg.text}
                        </span>
                      )}
                    </div>
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

            {activeSection === 'docs' && (
              <motion.div
                key="docs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                      <BookOpenText className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">系统文字说明</h3>
                      <p className="text-sm text-slate-500">面向日常运维、数据检查和论文展示的功能说明</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {[
                      { title: '实时路网地图', text: '展示核心路口的实时速度和拥堵状态，路口列表与地图标记可以联动聚焦。' },
                      { title: '控制台总览', text: '汇总最新采集数据、平均速度、拥堵节点数量和预测服务状态。' },
                      { title: '历史档案导出', text: '按时间范围和路口筛选导出 CSV，也可导出当前预测报表。' },
                    ].map((item) => (
                      <div key={item.title} className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
                        <div className="text-sm font-black text-slate-900">{item.title}</div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{item.text}</p>
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
                      <h3 className="text-lg font-black text-slate-900">系统术语解释</h3>
                      <p className="text-sm text-slate-500">统一界面、报表和模型相关概念口径</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {[
                      { term: '节点', desc: '系统监控的一个核心路口，例如 A1、B2、K11。' },
                      { term: '通行速度', desc: '高德路况接口或历史数据中采集到的路段平均车速，单位为 km/h。' },
                      { term: '拥堵状态', desc: '路况等级字段，通常包括畅通、缓行、拥堵、严重拥堵等状态。' },
                      { term: '采集窗口', desc: '模型预测时使用的最近连续时间步数据，目前默认使用 12 个时间步。' },
                      { term: 'LST-GCN', desc: '结合时序建模和图卷积的交通速度预测模型，用于推演下一时段路况。' },
                      { term: '预测报表', desc: '基于当前窗口生成的未来 15 分钟和 30 分钟速度、状态推演结果。' },
                    ].map((item) => (
                      <div key={item.term} className="flex flex-col gap-2 border-b border-slate-50 py-4 last:border-b-0 md:flex-row md:items-start md:justify-between">
                        <div className="text-sm font-black text-slate-900">{item.term}</div>
                        <div className="max-w-3xl text-sm leading-6 text-slate-500">{item.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <BookOpenText className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">速度-流量-密度关系</h3>
                      <p className="text-sm text-slate-500">基于 Greenshields 模型解释车辆速度与拥堵状态的映射逻辑</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {[
                      { title: '基本交通流关系', text: '流量 q = 速度 v x 密度 k。单位时间通过车辆越多，流量越高；但密度继续升高会压低速度。' },
                      { title: 'Greenshields 线性假设', text: '平均速度 v = vf x (1 - k / kj)。vf 表示自由流速度，kj 表示阻塞密度。' },
                      { title: '拥堵区判断', text: '当密度超过临界密度 kj / 2 后，速度和流量会同步下降，车辆排队与上游拥堵开始累积。' },
                      { title: '高德拥堵状态', text: 'congestion_status 直接来自高德 API 返回字段：1=畅通，2=缓行，3=拥堵，4=严重拥堵，不由系统主观设定。' },
                      { title: 'road_count 含义', text: '采集脚本以路口坐标为圆心、半径 100 米取圆，圆内覆盖路段数量即 road_count，用于描述采集代表性。' },
                      { title: '预测目标口径', text: '系统预测目标是路口平均行驶速度，不是车辆数量。速度可作为交通状态和拥堵程度的代理变量。' },
                    ].map((item) => (
                      <div key={item.title} className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
                        <div className="text-sm font-black text-slate-900">{item.title}</div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{item.text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 rounded-[24px] bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">系统应用口径</div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      当前系统主要使用高德路况速度和 congestion_status。高德 API 本质上提供路段速度与拥堵状态，不能直接提供单位时间通过路口的车辆数量；
                      车辆计数通常依赖路口摄像头、地感线圈等交管设备。论文与系统说明中应将预测目标明确为“路口平均行驶速度”，并用 Greenshields
                      模型解释速度、密度与流量之间的理论关系：速度下降通常意味着车辆密度升高、拥堵程度增强。因此，用速度作为交通状态代理变量是合理且自洽的。
                      road_count 目前仅作为采集覆盖路段数量存储，暂未参与模型推理和前端判断。
                    </p>
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
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button onClick={handleExport} className="btn-primary gap-2">
                    <Download className="h-4 w-4" />
                    <span>导出历史 CSV</span>
                    </button>
                    <button onClick={handlePredictExport} className="btn-primary gap-2">
                      <FileArchive className="h-4 w-4" />
                      <span>导出预测数据</span>
                    </button>
                  </div>
                </div>

                <div className="mt-6 rounded-[28px] bg-slate-50 p-6 ring-1 ring-slate-100">
                  <div className="mb-4 text-base font-black text-slate-900">最近导出记录</div>
                  <div className="space-y-3">
                    {exportHistory.length > 0 ? (
                      exportHistory.slice(0, 5).map((record) => (
                        <div key={record.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-sm font-black text-slate-900">{record.type}</div>
                            <div className="text-xs font-semibold text-slate-400">{record.time}</div>
                          </div>
                          <div className="mt-2 text-xs font-medium text-slate-500">范围：{record.range}</div>
                          <div className="mt-1 text-xs font-medium text-slate-500">目标：{record.scope}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-400">
                        暂无导出记录，执行一次导出后会显示在这里。
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
