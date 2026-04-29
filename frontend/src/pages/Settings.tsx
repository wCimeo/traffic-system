import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  CloudLightning,
  Database,
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

function ReportExport({
  exportHistory,
  onExportHistory,
}: {
  exportHistory: ExportRecord[];
  onExportHistory: (record: ExportRecord) => void;
}) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [nodeId, setNodeId] = useState('all');

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

    onExportHistory({
      id: `${Date.now()}`,
      type: '历史 CSV 导出',
      time: new Date().toLocaleString('zh-CN'),
      scope,
      range,
    });

    window.open(`http://localhost:3001/api/report/export?${params.toString()}&token=${token}`);
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-2">
          <label className="ml-1 text-[11px] font-bold text-slate-500">开始日期</label>
          <input
            type="date"
            className="input-base bg-white ring-1 ring-slate-100"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="ml-1 text-[11px] font-bold text-slate-500">结束日期</label>
          <input
            type="date"
            className="input-base bg-white ring-1 ring-slate-100"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="ml-1 text-[11px] font-bold text-slate-500">路口范围</label>
          <select
            className="input-base bg-white ring-1 ring-slate-100"
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
          >
            <option value="all">全部路口</option>
            {NODE_OPTIONS.slice(1).map((node) => (
              <option key={node} value={node}>
                {node}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-[28px] bg-slate-50 p-6 ring-1 ring-slate-100">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <FileArchive className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-black text-slate-900">历史档案导出</div>
            <div className="text-xs font-medium text-slate-500">按时间范围和目标路口导出历史路况数据</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={handleExport} className="btn-primary gap-2">
            <Download className="h-4 w-4" />
            <span>导出历史 CSV</span>
          </button>
          <button onClick={() => {}} className="btn-ghost gap-2 border border-slate-200 bg-white">
            <Database className="h-4 w-4" />
            <span>导出 AI 训练集</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] bg-slate-50 p-6 ring-1 ring-slate-100">
          <div className="mb-4 text-base font-black text-slate-900">导出说明</div>
          <div className="space-y-3 text-sm leading-6 text-slate-500">
            <div>1. 历史 CSV 导出会基于当前时间范围和路口筛选条件生成报表文件。</div>
            <div>2. 不填写日期时，系统会默认导出该路口的全部历史数据。</div>
            <div>3. 导出的 CSV 适合论文附录、离线分析和二次清洗。</div>
            <div>4. AI 训练集导出入口已预留，后续可接入模型训练数据打包流程。</div>
          </div>
        </div>

        <div className="rounded-[28px] bg-slate-50 p-6 ring-1 ring-slate-100">
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
      </div>
    </div>
  );
}

export default function Settings() {
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{"displayName":"管理员","username":"admin_traffic"}');
  const [activeSection, setActiveSection] = useState<SettingsSection>(getStoredSection);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>(getStoredExportHistory);
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(SETTINGS_SECTION_KEY, activeSection);
  }, [activeSection]);

  useEffect(() => {
    const section = getSectionFromSearch(location.search);
    if (section) {
      setActiveSection(section);
    }
  }, [location.search]);

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

  useEffect(() => {
    localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(exportHistory.slice(0, 10)));
  }, [exportHistory]);

  const handleChangePassword = async () => {
    if (!pwForm.oldPassword || !pwForm.newPassword) {
      setPwMsg({ text: '请填写完整的密码信息', ok: false });
      return;
    }
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwMsg({ text: '两次输入的新密码不一致', ok: false });
      return;
    }

    setPwLoading(true);
    try {
      await api.post('/api/auth/change-password', {
        oldPassword: pwForm.oldPassword,
        newPassword: pwForm.newPassword,
      });
      setPwMsg({ text: '密码修改成功', ok: true });
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' });
    } catch {
      setPwMsg({ text: '原密码校验失败，请重新输入', ok: false });
    } finally {
      setTimeout(() => setPwLoading(false), 800);
    }
  };

  const handleAddExportRecord = (record: ExportRecord) => {
    setExportHistory((current) => [record, ...current].slice(0, 10));
  };

  const navItems = [
    { key: 'overview' as SettingsSection, label: '设置主页', desc: '账号信息与系统概览', icon: Monitor },
    { key: 'password' as SettingsSection, label: '修改密码', desc: '账号安全与密码更新', icon: KeyRound },
    { key: 'archive' as SettingsSection, label: '历史档案导出', desc: '历史路况与数据报表', icon: FileArchive },
  ];

  const themeOptions: Array<{
    key: ThemeMode;
    label: string;
    desc: string;
    icon: typeof Sun;
  }> = [
    { key: 'light', label: '浅色', desc: '保持当前明亮控制台风格', icon: Sun },
    { key: 'dark', label: '深色', desc: '切换为低亮度深色阅读界面', icon: Moon },
    { key: 'system', label: '跟随系统', desc: '自动匹配操作系统主题偏好', icon: Laptop },
  ];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">系统设置</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            这里是设置中心。后续新增的账号安全、档案导出和系统管理能力，都可以继续挂在这个二级导航下。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="console-card h-fit bg-white p-4">
          <div className="px-3 pb-4 pt-2">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">系统设置</div>
            <div className="mt-2 text-sm font-semibold text-slate-500">请选择一个功能模块进行操作</div>
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
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                      isActive ? 'bg-white text-brand-600 shadow-sm' : 'bg-slate-50 text-slate-500'
                    }`}
                  >
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
                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">账号信息</h3>
                      <p className="text-sm text-slate-500">当前登录账号与权限身份</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {[
                      { label: '显示名称', value: user.displayName, icon: User },
                      { label: '用户名', value: user.username, icon: ShieldCheck },
                      { label: '角色', value: '超级管理员', icon: CloudLightning },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between border-b border-slate-50 py-4 last:border-b-0"
                      >
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
                            isActive
                              ? 'border-brand-200 bg-brand-50 shadow-sm'
                              : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
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
                      {themeMode === 'system'
                        ? `跟随系统（当前为${resolvedTheme === 'dark' ? '深色' : '浅色'}）`
                        : themeMode === 'dark'
                          ? '深色'
                          : '浅色'}
                    </div>
                  </div>
                </div>

                <div className="console-card bg-white p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                      <Monitor className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">系统信息</h3>
                      <p className="text-sm text-slate-500">当前平台版本与运行参数概览</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {[
                      { label: '系统名称', value: '智能交通流量监控与预测系统' },
                      { label: '数据来源', value: '高德地图交通 API / 本地路口采集数据' },
                      { label: '监控范围', value: '成都天府新区 10 个核心路口' },
                      { label: '采集频率', value: '每 60 秒采集一次' },
                      { label: '预测模型', value: 'LST-GCN 时空图卷积网络' },
                      { label: '后端服务', value: 'Express · localhost:3001' },
                      { label: '推理服务', value: 'Flask · localhost:5001' },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between border-b border-slate-50 py-4 last:border-b-0"
                      >
                        <span className="text-sm font-semibold text-slate-500">{item.label}</span>
                        <span className="text-sm font-bold text-slate-800">{item.value}</span>
                      </div>
                    ))}
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
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">修改密码</h3>
                    <p className="text-sm text-slate-500">更新当前账号的登录密码与安全凭证</p>
                  </div>
                </div>

                <div className="space-y-5">
                  {[
                    { label: '当前密码', key: 'oldPassword', placeholder: '请输入当前密码' },
                    { label: '新密码', key: 'newPassword', placeholder: '请输入新密码' },
                    { label: '确认新密码', key: 'confirm', placeholder: '请再次输入新密码' },
                  ].map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="ml-1 text-[11px] font-bold text-slate-500">{field.label}</label>
                      <input
                        type="password"
                        className="input-base bg-white ring-1 ring-slate-100"
                        placeholder={field.placeholder}
                        value={pwForm[field.key as keyof typeof pwForm]}
                        onChange={(e) => setPwForm({ ...pwForm, [field.key]: e.target.value })}
                      />
                    </div>
                  ))}

                  <AnimatePresence>
                    {pwMsg && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-4 text-sm font-semibold ${
                          pwMsg.ok
                            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                            : 'border-red-100 bg-red-50 text-red-600'
                        }`}
                      >
                        {pwMsg.ok ? <Check className="h-4 w-4" /> : <div className="h-2 w-2 rounded-full bg-red-500" />}
                        <span>{pwMsg.text}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="pt-2">
                    <button
                      onClick={handleChangePassword}
                      disabled={pwLoading}
                      className="btn-primary h-12 w-full gap-2"
                    >
                      <span>{pwLoading ? '正在校验并更新密码...' : '确认修改密码'}</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
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
                    <p className="text-sm text-slate-500">导出历史路况档案、报表数据和训练样本文件</p>
                  </div>
                </div>
                <ReportExport exportHistory={exportHistory} onExportHistory={handleAddExportRecord} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
