import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import {
  BookOpenText,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileArchive,
  KeyRound,
  Laptop,
  Lock,
  MessageSquareText,
  Monitor,
  Moon,
  Navigation,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import api from '../api';
import { useToast } from '../components/ToastProvider';

type SettingsSection = 'overview' | 'password' | 'archive' | 'docs';
type ThemeMode = 'light' | 'dark' | 'system';

type CurrentUser = {
  id?: number;
  username?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  gender?: string | null;
  isPasswordSet?: boolean;
  lastLoginTime?: string | null;
  lastLoginIp?: string | null;
  roleId?: string | null;
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
const PREDICTION_HORIZONS = [15, 30, 45, 60];

function getStoredSection(): SettingsSection {
  const stored = localStorage.getItem(SETTINGS_SECTION_KEY);
  return stored === 'overview' || stored === 'password' || stored === 'archive' || stored === 'docs' ? stored : 'overview';
}

function getSectionFromSearch(search: string): SettingsSection | null {
  const section = new URLSearchParams(search).get('section');
  return section === 'overview' || section === 'password' || section === 'archive' || section === 'docs' ? section : null;
}

function getStoredThemeMode(): ThemeMode {
  const stored = localStorage.getItem(SETTINGS_THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function getStoredExportHistory(): ExportRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXPORT_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
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
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatGender(value?: string | null) {
  if (value === 'male') return '男';
  if (value === 'female') return '女';
  if (value === 'other') return '其他';
  if (value === 'unknown') return '不便透露';
  return '未设置';
}

function formatLoginIp(value?: string | null) {
  if (!value) return '暂无记录';
  const ip = value.trim();
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return '192.168.1.159';
  return ip;
}

function formatEmailStatus(email?: string | null) {
  return email ? '已绑定' : '未绑定';
}

export default function Settings() {
  const { showToast } = useToast();
  const location = useLocation();
  const storedUser: CurrentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [activeSection, setActiveSection] = useState<SettingsSection>(getStoredSection);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<CurrentUser>(storedUser);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [nodeId, setNodeId] = useState('all');
  const [predictionHorizons, setPredictionHorizons] = useState<number[]>(PREDICTION_HORIZONS);
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>(getStoredExportHistory);

  const [profileForm, setProfileForm] = useState({
    username: storedUser.username || '',
    gender: storedUser.gender || '',
    avatarUrl: storedUser.avatarUrl || '',
  });
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [emailForm, setEmailForm] = useState({ email: storedUser.email || '', emailCode: '' });
  const [emailSending, setEmailSending] = useState(false);
  const [emailCountdown, setEmailCountdown] = useState(0);
  const [emailVerified, setEmailVerified] = useState(false);

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
    localStorage.setItem(SETTINGS_THEME_KEY, themeMode);
    applyTheme(themeMode);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const next = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
      setResolvedTheme(next);
      applyTheme(themeMode);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [themeMode]);

  useEffect(() => {
    if (emailCountdown <= 0) return;
    const timer = window.setTimeout(() => setEmailCountdown((curr) => curr - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [emailCountdown]);

  useEffect(() => {
    api.get('/api/auth/me')
      .then((res) => {
        const nextUser: CurrentUser = res.data.user || {};
        setUser(nextUser);
        setProfileForm({
          username: nextUser.username || '',
          gender: nextUser.gender || '',
          avatarUrl: nextUser.avatarUrl || '',
        });
        setEmailForm({ email: nextUser.email || '', emailCode: '' });
        localStorage.setItem('user', JSON.stringify(nextUser));
      })
      .catch(() => null);
  }, []);

  const displayName = useMemo(() => user.username || 'user', [user.username]);

  const saveUserToLocal = (nextUser: CurrentUser) => {
    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
    window.dispatchEvent(new CustomEvent('traffic:user-updated', { detail: nextUser }));
  };

  const handleSaveProfile = async () => {
    const username = profileForm.username.trim();
    if (!username) {
      setProfileMsg({ text: '请输入用户名', ok: false });
      showToast('请输入用户名', 'error');
      return;
    }

    setProfileLoading(true);
    try {
      const res = await api.post('/api/auth/profile', {
        username,
        email: user.email || '',
        emailCode: '',
        avatarUrl: profileForm.avatarUrl.trim(),
        gender: profileForm.gender,
      });
      const nextUser: CurrentUser = res.data.user;
      saveUserToLocal(nextUser);
      setProfileForm({
        username: nextUser.username || '',
        gender: nextUser.gender || '',
        avatarUrl: nextUser.avatarUrl || '',
      });
      setProfileEditing(false);
      setProfileMsg({ text: '用户信息已保存', ok: true });
      showToast('用户信息已保存', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.error || '用户信息保存失败，请稍后重试';
      setProfileMsg({ text: msg, ok: false });
      showToast(msg, 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const cancelProfileEdit = () => {
    setProfileForm({
      username: user.username || '',
      gender: user.gender || '',
      avatarUrl: user.avatarUrl || '',
    });
    setProfileEditing(false);
    setProfileMsg(null);
  };

  const handleAvatarPick = () => avatarInputRef.current?.click();

  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileMsg({ text: '请选择图片文件', ok: false });
      showToast('请选择图片文件', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setProfileMsg({ text: '头像读取失败', ok: false });
        showToast('头像读取失败', 'error');
        return;
      }
      setProfileForm((curr) => ({ ...curr, avatarUrl: result }));
      setProfileEditing(true);
      setProfileMsg({ text: '头像已选择，保存后生效', ok: true });
      showToast('头像已选择，保存后生效', 'success');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleChangePassword = async () => {
    if (user.isPasswordSet && !pwForm.oldPassword) {
      setPwMsg({ text: '请输入当前密码', ok: false });
      showToast('请输入当前密码', 'error');
      return;
    }
    if (!pwForm.newPassword || pwForm.newPassword.length < 6) {
      setPwMsg({ text: '新密码至少需要 6 位', ok: false });
      showToast('新密码至少需要 6 位', 'error');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwMsg({ text: '两次输入的新密码不一致', ok: false });
      showToast('两次输入的新密码不一致', 'error');
      return;
    }

    setPwLoading(true);
    try {
      const res = await api.post('/api/auth/change-password', {
        oldPassword: pwForm.oldPassword,
        newPassword: pwForm.newPassword,
      });
      saveUserToLocal(res.data.user);
      const successText = user.isPasswordSet ? '密码修改成功' : '密码设置成功';
      setPwMsg({ text: successText, ok: true });
      showToast(successText, 'success');
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (err: any) {
      const msg = err.response?.data?.error || '密码更新失败，请稍后重试';
      setPwMsg({ text: msg, ok: false });
      showToast(msg, 'error');
    } finally {
      setTimeout(() => setPwLoading(false), 600);
    }
  };

  const handleSendEmailCode = async () => {
    const email = String(emailForm.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('【邮箱验证】请输入有效邮箱地址', 'error');
      return;
    }
    setEmailSending(true);
    try {
      const res = await api.post('/api/auth/email/send-profile', { email });
      setEmailCountdown(60);
      const devCode = res.data?.devCode ? `（开发验证码：${res.data.devCode}）` : '';
      showToast(`【邮箱验证】验证码已发送，60 秒内有效${devCode}`, 'success');
    } catch (err: any) {
      showToast(`【邮箱验证】${err.response?.data?.error || '发送失败'}`, 'error');
    } finally {
      setEmailSending(false);
    }
  };

  const handleVerifyEmail = async () => {
    const email = String(emailForm.email || '').trim();
    const emailCode = String(emailForm.emailCode || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('【邮箱验证】请输入有效邮箱地址', 'error');
      return;
    }
    if (!emailCode) {
      showToast('【邮箱验证】请输入邮箱验证码', 'error');
      return;
    }

    try {
      const res = await api.post('/api/auth/email/bind', { email, emailCode });
      const nextUser: CurrentUser = res.data.user;
      saveUserToLocal(nextUser);
      setEmailForm({ email: nextUser.email || email, emailCode: '' });
      setEmailVerified(true);
      showToast('【邮箱验证】验证通过', 'success');
    } catch (err: any) {
      showToast(`【邮箱验证】${err.response?.data?.error || '验证失败'}`, 'error');
      setEmailVerified(false);
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (startDate) params.append('start', startDate);
    if (endDate) params.append('end', endDate);
    if (nodeId) params.append('node_id', nodeId);
    const token = localStorage.getItem('token');
    const scope = nodeId === 'all' ? '全部路口' : `路口 ${nodeId}`;
    const range = startDate || endDate ? `${startDate || '开始不限'} ~ ${endDate || '结束不限'}` : '全部历史时间';

    setExportHistory((curr) => [
      { id: `${Date.now()}`, type: '历史数据导出', time: new Date().toLocaleString('zh-CN'), scope, range },
      ...curr,
    ].slice(0, 10));

    if (token) params.append('token', token);
    window.open(`/api/report/export?${params.toString()}`);
    showToast('历史数据导出已开始', 'success');
  };

  const handlePredictExport = () => {
    const params = new URLSearchParams();
    if (nodeId) params.append('node_id', nodeId);
    params.append('horizons', predictionHorizons.join(','));
    const token = localStorage.getItem('token');
    const scope = nodeId === 'all' ? '全部路口' : `路口 ${nodeId}`;
    const horizonText = predictionHorizons.map((item) => `${item} 分钟`).join(' / ');

    setExportHistory((curr) => [
      { id: `${Date.now()}`, type: '预测数据导出', time: new Date().toLocaleString('zh-CN'), scope, range: `当前数据窗口 + ${horizonText}预测` },
      ...curr,
    ].slice(0, 10));

    if (token) params.append('token', token);
    window.open(`/api/report/predict-export?${params.toString()}`);
    showToast('预测数据导出已开始', 'success');
  };

  const togglePredictionHorizon = (horizon: number) => {
    setPredictionHorizons((curr) => {
      if (curr.includes(horizon)) {
        return curr.length === 1 ? curr : curr.filter((item) => item !== horizon);
      }
      return [...curr, horizon].sort((a, b) => a - b);
    });
  };

  const navItems: Array<{ key: SettingsSection; label: string; icon: typeof User }> = [
    { key: 'overview', label: '用户主页', icon: User },
    { key: 'password', label: '安全验证', icon: KeyRound },
    { key: 'archive', label: '数据导出', icon: FileArchive },
    { key: 'docs', label: '系统说明', icon: BookOpenText },
  ];

  const themeOptions: Array<{ key: ThemeMode; label: string; desc: string; icon: typeof Sun }> = [
    { key: 'light', label: '浅色', desc: '保持明亮、清晰的控制台风格。', icon: Sun },
    { key: 'dark', label: '深色', desc: '切换到低亮度深色界面。', icon: Moon },
    { key: 'system', label: '跟随系统', desc: '自动匹配系统主题偏好。', icon: Laptop },
  ];

  return (
    <div className="space-y-10 pb-12">
      <div className="space-y-6">
        <section className="console-card bg-white p-5">
          <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2 xl:grid-cols-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveSection(item.key)}
                  className={`group w-full rounded-[24px] border px-5 py-4 text-left transition-all duration-300 ${
                    active
                      ? 'border-brand-200 bg-brand-50 text-brand-700 shadow-lg shadow-brand-100/40'
                      : 'border-slate-200/70 bg-slate-50/80 text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-lg hover:shadow-slate-200/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors ${
                          active ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="text-sm font-black">{item.label}</div>
                    </div>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${active ? 'rotate-0 text-brand-500' : 'rotate-90 text-slate-300'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div>
          <AnimatePresence mode="wait">
            {activeSection === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-start justify-between gap-6">
                    <div className="flex items-start gap-4">
                      <div className="relative">
                        <img
                          src={profileForm.avatarUrl || user.avatarUrl || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(displayName)}`}
                          className="h-20 w-20 rounded-2xl bg-slate-100 object-cover"
                          alt="avatar"
                        />
                        <button
                          type="button"
                          onClick={handleAvatarPick}
                          className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1 text-[8px] font-bold text-white"
                        >
                          更换
                        </button>
                        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
                      </div>
                      <div className="flex flex-col gap-4">
                        <div className="text-4xl font-black text-slate-900">{displayName.toUpperCase()}</div>
                        <div className="text-sm text-slate-500">上次登录时间：{formatDateTime(user.lastLoginTime)}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => (profileEditing ? cancelProfileEdit() : setProfileEditing(true))}
                      className="rounded-2xl border border-slate-200 px-5 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
                    >
                      {profileEditing ? '取消编辑' : '编辑资料'}
                    </button>
                  </div>

                  {profileMsg && <div className={`mb-6 text-sm font-black ${profileMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{profileMsg.text}</div>}

                  <div className="rounded-[24px] border border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr]">
                      <div className="border-b border-slate-100 px-6 py-5 text-sm font-black text-slate-500 md:border-b-0">用户名</div>
                      <div className="border-b border-slate-100 px-6 py-5">
                        {profileEditing ? (
                          <input
                            className="input-base bg-white ring-1 ring-slate-100"
                            value={profileForm.username}
                            onChange={(event) => setProfileForm((curr) => ({ ...curr, username: event.target.value }))}
                            placeholder="请输入用户名"
                          />
                        ) : (
                          <span className="text-sm font-black text-slate-900">{user.username || '未设置'}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr]">
                      <div className="px-6 py-5 text-sm font-black text-slate-500">身份信息</div>
                      <div className="px-6 py-5">
                        <span className="text-sm font-black text-slate-900">{user.roleId}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr]">
                      <div className="border-b border-slate-100 px-6 py-5 text-sm font-black text-slate-500 md:border-b-0">密码</div>
                      <div className="border-b border-slate-100 px-6 py-5">
                        <span className="text-sm font-black text-slate-900">{user.isPasswordSet ? '已设置' : '未设置'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr]">
                      <div className="border-b border-slate-100 px-6 py-5 text-sm font-black text-slate-500 md:border-b-0">邮箱</div>
                      <div className="border-b border-slate-100 px-6 py-5">
                        <span className="text-sm font-black text-slate-900">{formatEmailStatus(user.email)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr]">
                      <div className="border-b border-slate-100 px-6 py-5 text-sm font-black text-slate-500 md:border-b-0">性别</div>
                      <div className="border-b border-slate-100 px-6 py-5">
                        {profileEditing ? (
                          <select
                            className="input-base bg-white ring-1 ring-slate-100"
                            value={profileForm.gender}
                            onChange={(event) => setProfileForm((curr) => ({ ...curr, gender: event.target.value }))}
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
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr]">
                      <div className="px-6 py-5 text-sm font-black text-slate-500">上次登录 IP</div>
                      <div className="px-6 py-5">
                        <span className="text-sm font-black text-slate-900">{formatLoginIp(user.lastLoginIp)}</span>
                      </div>
                    </div>
                  </div>

                  {profileEditing && (
                    <div className="mt-6">
                      <button onClick={handleSaveProfile} disabled={profileLoading} className="btn-primary h-12 w-full gap-2">
                        <span>{profileLoading ? '保存中...' : '保存用户信息'}</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="console-card bg-white p-8">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                      <Monitor className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">外观主题</h3>
                      <p className="text-sm text-slate-500">当前生效：{resolvedTheme === 'dark' ? '深色模式' : '浅色模式'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {themeOptions.map((item) => {
                      const Icon = item.icon;
                      const active = themeMode === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setThemeMode(item.key)}
                          className={`rounded-2xl border p-4 text-left ${active ? 'border-brand-200 bg-brand-50' : 'border-slate-100 bg-slate-50'}`}
                        >
                          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </div>
                          <p className="mt-2 text-xs font-semibold text-slate-500">{item.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'password' && (
              <motion.div key="password" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white ${user.isPasswordSet ? 'bg-slate-900' : 'bg-amber-500'}`}>
                      <Lock className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{user.isPasswordSet ? '修改密码' : '设置密码'}</h3>
                      <p className="text-sm text-slate-500">{user.isPasswordSet ? '更新当前账号的登录密码。' : '先设置密码，再启用账号密码登录。'}</p>
                    </div>
                  </div>

                  {!user.isPasswordSet && (
                    <div className="mb-6 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
                      当前账号通过邮箱验证码注册，尚未设置密码。
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
                          onChange={(e) => setPwForm((curr) => ({ ...curr, oldPassword: e.target.value }))}
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
                        onChange={(e) => setPwForm((curr) => ({ ...curr, newPassword: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="ml-1 text-[11px] font-bold text-slate-500">确认新密码</label>
                      <input
                        type="password"
                        className="input-base bg-white ring-1 ring-slate-100"
                        placeholder="请再次输入新密码"
                        value={pwForm.confirm}
                        onChange={(e) => setPwForm((curr) => ({ ...curr, confirm: e.target.value }))}
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
                </div>

                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">邮箱验证</h3>
                      <p className="text-sm text-slate-500">绑定或更新邮箱，用于账号安全验证。</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="text-sm font-black text-slate-900">{formatEmailStatus(user.email)}</div>
                    <div className="flex gap-2">
                      <input
                        className="input-base h-10 flex-1 bg-white ring-1 ring-slate-100"
                        value={emailForm.email}
                        onChange={(e) => {
                          setEmailForm((curr) => ({ ...curr, email: e.target.value }));
                          setEmailVerified(false);
                        }}
                        placeholder="输入邮箱地址"
                      />
                      <button
                        type="button"
                        onClick={handleSendEmailCode}
                        disabled={emailSending || emailCountdown > 0}
                        className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 disabled:opacity-50"
                      >
                        {emailCountdown > 0 ? `${emailCountdown}s` : emailSending ? '发送中' : '发验证码'}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="input-base h-10 flex-1 bg-white ring-1 ring-slate-100"
                        value={emailForm.emailCode}
                        onChange={(e) => setEmailForm((curr) => ({ ...curr, emailCode: e.target.value }))}
                        placeholder="输入邮箱验证码"
                      />
                      <button type="button" onClick={handleVerifyEmail} className="h-10 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white">
                        验证并绑定
                      </button>
                    </div>
                    <div className={`text-xs font-bold ${emailVerified ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {emailVerified ? '【邮箱验证】验证通过' : '邮箱验证码 60 秒内有效'}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'archive' && (
              <motion.div key="archive" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="console-card bg-white p-8">
                <div className="mb-8 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <Download className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">档案数据导出</h3>
                    <p className="text-sm text-slate-500">导出历史数据或预测数据报表。</p>
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
                      {NODE_OPTIONS.slice(1).map((node) => (
                        <option key={node} value={node}>{node}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="text-sm font-black text-slate-900">预测窗口</div>
                      <div className="text-xs font-semibold text-slate-500">预测导出会按“路口 + 窗口”生成明细行，包含目标时间、速度变化、评分和通行建议。</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPredictionHorizons(PREDICTION_HORIZONS)}
                      className="text-xs font-black text-brand-600 hover:text-brand-700"
                    >
                      全选
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PREDICTION_HORIZONS.map((horizon) => {
                      const active = predictionHorizons.includes(horizon);
                      return (
                        <button
                          key={horizon}
                          type="button"
                          onClick={() => togglePredictionHorizon(horizon)}
                          className={`h-11 rounded-xl border text-sm font-black transition-all ${
                            active
                              ? 'border-brand-200 bg-white text-brand-700 shadow-sm'
                              : 'border-slate-200 bg-slate-100 text-slate-400'
                          }`}
                        >
                          {horizon} 分钟
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button onClick={handleExport} className="btn-primary gap-2">
                    <Download className="h-4 w-4" />
                    <span>导出历史数据</span>
                  </button>
                  <button onClick={handlePredictExport} className="btn-primary gap-2">
                    <FileArchive className="h-4 w-4" />
                    <span>导出预测数据</span>
                  </button>
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
                          <div className="mt-1 text-xs font-medium text-slate-500">对象：{record.scope}</div>
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

            {activeSection === 'docs' && (
              <motion.div key="docs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="console-card bg-white p-8">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                      <MessageSquareText className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">功能一览</h3>
                      <p className="text-sm text-slate-500">面向日常运维、数据检查和展示汇报的统一入口。</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {[
                      { title: '监测总览面板', text: '汇总采集数据、平均速度、拥堵节点数量与预测服务状态。' },
                      { title: '实时路网地图', text: '展示核心路口速度与拥堵状态，支持列表与地图联动。' },
                      { title: '突发事件监控', text: '实时监控并预警交通突发事件。' },
                      { title: '智能路线推荐', text: '基于路况数据，为出行决策提供推荐参考。' },
                    ].map((item) => (
                      <div key={item.title} className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
                        <div className="text-sm font-black text-slate-900">{item.title}</div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{item.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="console-card bg-white p-8">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">术语解释</h3>
                      <p className="text-sm text-slate-500">帮助团队统一理解速度、状态、预测等核心指标。</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { term: '节点', desc: '系统监控的单个核心路口，例如 A1、B2。' },
                      { term: '通行速度', desc: '来源于路况接口或历史记录，单位为 km/h。' },
                      { term: '拥堵状态', desc: '路况等级字段，通常包含畅通、缓行、拥堵、严重拥堵。' },
                      { term: '预测报表', desc: '基于当前数据窗口生成的 15/30/45/60 分钟速度趋势。' },
                    ].map((item) => (
                      <div key={item.term} className="flex flex-col gap-2 border-b border-slate-50 py-4 last:border-b-0 md:flex-row md:justify-between">
                        <div className="text-sm font-black text-slate-900">{item.term}</div>
                        <div className="max-w-3xl text-sm leading-6 text-slate-500">{item.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                      <Navigation className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">路线评分规则</h3>
                      <p className="text-sm text-slate-500">说明智能路线推荐页面中的 score 是如何根据预测速度和速度变化计算的。</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {[
                      { title: '看未来速度', text: '评分首先看预测时段内的未来速度。预测速度越低，说明未来通行能力越弱，扣分越多。' },
                      { title: '看是否变慢', text: '系统还会比较预测速度和当前速度。如果未来明显比现在更慢，也会继续扣分。' },
                      { title: '等级判断', text: '未来速度很低，或者总分已经落到较低区间时，会判为 bad；中间状态判为 normal；速度稳定且整体较好时判为 good。' },
                    ].map((item) => (
                      <div key={item.title} className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
                        <div className="text-sm font-black text-slate-900">{item.title}</div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{item.text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 rounded-[24px] bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">示例理解</div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      例如某路口当前速度为 42 km/h，而 15 分钟后的预测速度只有 28 km/h，系统会认为“未来速度偏低”且“比当前明显变慢”，
                      因此 score 会被连续扣低，更可能给出“谨慎通行”或“建议绕行”。
                    </p>
                  </div>
                </div>

                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                      <BookOpenText className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">速度-流量-密度关系</h3>
                      <p className="text-sm text-slate-500">基于 Greenshields 模型解释交通状态的映射逻辑。</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {[
                      { title: '基本关系', text: '流量 q = 速度 v × 密度 k。密度上升通常会压低车速。' },
                      { title: '线性假设', text: 'Greenshields 模型近似为 v = vf × (1 - k / kj)，vf 为自由流速度，kj 为阻塞密度。' },
                      { title: '拥堵判断', text: '当密度超过临界值后，速度与通行能力会同步下降，排队风险增大。' },
                      { title: '状态来源', text: 'congestion_status 来自路况接口返回字段，不由前端主观定义。' },
                      { title: 'road_count 含义', text: '表示采集覆盖范围内的路段数量，用于描述样本代表性。' },
                      { title: '预测口径', text: '系统预测目标是路口平均速度，作为交通状态的核心代理变量。' },
                    ].map((item) => (
                      <div key={item.title} className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
                        <div className="text-sm font-black text-slate-900">{item.title}</div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{item.text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 rounded-[24px] bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">应用口径</div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      当前系统以路口平均速度和拥堵状态作为核心指标。速度下降通常对应密度升高与拥堵加重，因此在模型推理与业务展示中，
                      使用“速度”作为交通状态代理变量是合理且一致的。
                    </p>
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
