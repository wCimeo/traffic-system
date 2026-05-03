import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  X,
  ChevronRight,
  Trash2,
  Sparkles,
  UserRound,
  ShieldCheck,
} from 'lucide-react';
import api from '../api';
import { useToast } from '../components/ToastProvider';

type IncidentStatus = 'reported' | 'active' | 'resolved' | 'ignored';

type Incident = {
  id: number;
  node_id: string;
  type: string;
  description: string;
  severity: number;
  status: IncidentStatus;
  reporter_id?: string | null;
  handler_id?: string | null;
  created_at: string;
  handled_at?: string | null;
};

type CurrentUser = {
  id?: number;
  role?: string | null;
  roleId?: string | null;
};

type UserOption = {
  id: number;
  username?: string | null;
  role?: string | null;
  role_id?: string | null;
};

const NODE_META = [
  { id: 'A1', name: '天府大道-锦城大道路口' },
  { id: 'B2', name: '益州大道-锦城大道路口' },
  { id: 'C3', name: '成华大道-杉板桥路口' },
  { id: 'D4', name: '天府大道-华阳立交路口' },
  { id: 'E5', name: '剑南大道-锦城大道路口' },
  { id: 'F6', name: '益州大道-府城大道路口' },
  { id: 'G7', name: '天府三街-天府大道路口' },
  { id: 'H8', name: '科华南路-锦尚西二路路口' },
  { id: 'I9', name: '中环路火车南站-科华南路口' },
  { id: 'J10', name: '东站西广场-邛崃山路路口' },
  { id: 'K11', name: '人民南路四段' },
];

const SEVERITY_MAP: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: '低风险', color: '#10b981', bg: '#ecfdf5' },
  2: { label: '中风险', color: '#f59e0b', bg: '#fffbeb' },
  3: { label: '高风险', color: '#ef4444', bg: '#fef2f2' },
};

const TYPE_OPTIONS = ['交通事故', '道路施工', '异常拥堵', '信号灯故障', '其他'];

const STATUS_MAP: Record<IncidentStatus, { label: string; color: string; icon: any }> = {
  reported: { label: '待受理', color: '#64748b', icon: AlertTriangle },
  active: { label: '处理中', color: '#f59e0b', icon: Clock },
  resolved: { label: '已解决', color: '#10b981', icon: CheckCircle2 },
  ignored: { label: '已忽略', color: '#94a3b8', icon: X },
};

const FILTER_ITEMS: Array<{ key: 'all' | IncidentStatus; label: string; icon: any }> = [
  { key: 'all', label: '全部事件', icon: Filter },
  { key: 'reported', label: '待受理', icon: AlertTriangle },
  { key: 'active', label: '处理中', icon: Clock },
  { key: 'resolved', label: '已解决', icon: CheckCircle2 },
];

export default function Incidents() {
  const { showToast } = useToast();
  const currentUser: CurrentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const currentRoleId = String(currentUser.roleId || '').trim();
  const isAdmin = currentUser.role === '管理员';
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [filter, setFilter] = useState<'all' | IncidentStatus>('all');
  const [keyword, setKeyword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [roleForm, setRoleForm] = useState<{ userId: string; role: '管理员' | '执行者' }>({ userId: '', role: '执行者' });

  const [form, setForm] = useState({
    node_id: 'A1',
    type: '交通事故',
    description: '',
    severity: 1,
    reporter_id: currentRoleId,
    handler_id: '',
  });

  const loadIncidents = async () => {
    const res = await api.get('/api/incidents');
    setIncidents((res.data.data || []) as Incident[]);
  };

  const loadUsers = async () => {
    const res = await api.get('/api/auth/users');
    const list = (res.data.users || []) as UserOption[];
    setUsers(list);
    setForm((curr) => ({
      ...curr,
      reporter_id: curr.reporter_id || currentRoleId || list[0]?.role_id || '',
    }));
  };

  useEffect(() => {
    loadIncidents().catch((e) => {
      console.error(e);
      setIncidents([]);
    });
    loadUsers().catch((e) => {
      console.error(e);
      setUsers([]);
    });
  }, []);

  const statusCount = useMemo(() => {
    return {
      reported: incidents.filter((i) => i.status === 'reported').length,
      active: incidents.filter((i) => i.status === 'active').length,
      resolved: incidents.filter((i) => i.status === 'resolved').length,
    };
  }, [incidents]);

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      if (filter !== 'all' && i.status !== filter) return false;
      if (!keyword.trim()) return true;
      const q = keyword.trim().toLowerCase();
      return (
        i.node_id.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        (i.reporter_id || '').toLowerCase().includes(q) ||
        (i.handler_id || '').toLowerCase().includes(q)
      );
    });
  }, [incidents, filter, keyword]);

  const handleSubmit = async () => {
    if (!form.description.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/api/incidents', {
        ...form,
        reporter_id: form.reporter_id.trim(),
        handler_id: form.handler_id.trim(),
      });
      setForm({
        node_id: 'A1',
        type: '交通事故',
        description: '',
        severity: 1,
        reporter_id: currentRoleId || users[0]?.role_id || '',
        handler_id: '',
      });
      setShowForm(false);
      await loadIncidents();
      showToast('事件上报成功', 'success');
    } catch {
      showToast('事件上报失败，请稍后重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const updateIncidentStatus = async (id: number, status: IncidentStatus, handlerId?: string) => {
    try {
      await api.put(`/api/incidents/${id}`, { status, handler_id: handlerId || currentRoleId || '' });
      await loadIncidents();
      const labelMap: Record<IncidentStatus, string> = {
        reported: '待受理',
        active: '处理中',
        resolved: '已解决',
        ignored: '已忽略',
      };
      showToast(`事件状态已更新为${labelMap[status]}`, 'success');
    } catch {
      showToast('状态更新失败，请稍后重试', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/incidents/${id}`);
      await loadIncidents();
      showToast('事件已删除', 'success');
    } catch {
      showToast('删除失败，请稍后重试', 'error');
    }
  };

  const seedMockData = async () => {
    setSeeding(true);
    try {
      await api.post('/api/incidents/mock-seed', { count: 18 });
      await loadIncidents();
      showToast('模拟事件已生成', 'success');
    } catch {
      showToast('模拟事件生成失败', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const updateUserRole = async () => {
    if (!roleForm.userId) {
      showToast('请选择需要修改身份的用户', 'error');
      return;
    }
    setRoleSubmitting(true);
    try {
      await api.post(`/api/auth/users/${roleForm.userId}/role`, { role: roleForm.role });
      await loadUsers();
      setShowRoleModal(false);
      showToast('用户身份更新成功', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || '用户身份更新失败', 'error');
    } finally {
      setRoleSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">突发事件监控</h1>
          <p className="mt-2 text-slate-500 font-medium text-xs tracking-wide">
            待受理 {statusCount.reported} 条，处理中 {statusCount.active} 条，已解决 {statusCount.resolved} 条
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button onClick={() => setShowRoleModal(true)} className="btn-ghost gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>身份管理</span>
            </button>
          )}
          <button onClick={seedMockData} disabled={seeding} className="btn-ghost gap-2">
            <Sparkles className="h-4 w-4" />
            <span>{seeding ? '生成中...' : '生成模拟事件'}</span>
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary gap-2 shadow-lg shadow-slate-900/10">
            <Plus className="h-4 w-4" />
            <span>上报事件</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {FILTER_ITEMS.map((item) => {
          const value =
            item.key === 'all'
              ? incidents.length
              : item.key === 'reported'
              ? statusCount.reported
              : item.key === 'active'
              ? statusCount.active
              : statusCount.resolved;
          return (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`console-card p-4 flex items-center justify-between transition-all ${
                filter === item.key ? 'bg-slate-900 border-slate-900' : ''
              }`}
            >
              <div className="text-left">
                <div className={`text-[11px] font-bold ${filter === item.key ? 'text-slate-300' : 'text-slate-500'}`}>{item.label}</div>
                <div className={`text-3xl font-black ${filter === item.key ? 'text-white' : 'text-slate-900'}`}>{value}</div>
              </div>
              <item.icon className={`h-5 w-5 ${filter === item.key ? 'text-white' : 'text-slate-400'}`} />
            </button>
          );
        })}
      </div>

      <div className="console-card overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black tracking-wide text-slate-900">事件列表</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 pointer-events-none" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索路口 / 事件 / 人员ID"
              className="h-10 pl-9 pr-4 bg-slate-50 rounded-xl text-xs font-bold border-none focus:ring-2 focus:ring-brand-500/20 outline-none w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70">
                {['路口', '事件类型', '描述', '风险', '状态', '上报人ID', '处理人ID', '上报时间', '操作'].map((h) => (
                  <th key={h} className="px-6 py-4 text-[11px] font-bold text-slate-500 border-b border-slate-100 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence mode="popLayout">
                {filtered.map((item) => {
                  const sev = SEVERITY_MAP[item.severity] || SEVERITY_MAP[1];
                  const sta = STATUS_MAP[item.status] || STATUS_MAP.reported;
                  const StatusIcon = sta.icon;
                  return (
                    <motion.tr key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hover:bg-slate-50/60">
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-800">{item.node_id}</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-700">{item.type}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{item.description}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold" style={{ color: sev.color, background: sev.bg }}>
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: sta.color }}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          <span>{sta.label}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">{item.reporter_id || '-'}</td>
                      <td className="px-6 py-4 text-xs text-slate-600">{item.handler_id || '-'}</td>
                      <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">{new Date(item.created_at).toLocaleString('zh-CN')}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateIncidentStatus(item.id, 'active')}
                            className="h-8 px-2.5 rounded-lg border border-amber-100 bg-amber-50 text-amber-700 text-[11px] font-bold"
                          >
                            受理
                          </button>
                          <button
                            onClick={() => updateIncidentStatus(item.id, 'resolved')}
                            className="h-8 px-2.5 rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700 text-[11px] font-bold"
                          >
                            解决
                          </button>
                          <button
                            onClick={() => updateIncidentStatus(item.id, 'ignored')}
                            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-600 text-[11px] font-bold"
                          >
                            忽略
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600"
                            title="删除事件"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-20 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300 mb-4">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <p className="text-slate-400 text-sm">暂无匹配的事件记录</p>
            </div>
          )}
        </div>
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900">上报突发事件</h3>
                <button onClick={() => setShowForm(false)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-400 hover:text-red-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500">路口</label>
                    <select className="input-base px-4" value={form.node_id} onChange={(e) => setForm({ ...form, node_id: e.target.value })}>
                      {NODE_META.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.id} - {n.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500">事件类型</label>
                    <select className="input-base px-4" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                      {TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500">上报人ID</label>
                    <div className="relative">
                      <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                      <input
                        value={form.reporter_id}
                        onChange={(e) => setForm({ ...form, reporter_id: e.target.value })}
                        placeholder="例如 S0001 或 G0001"
                        className="input-base pl-10 pr-4"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500">处理人ID（可选）</label>
                    <div className="relative">
                      <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                      <input
                        value={form.handler_id}
                        onChange={(e) => setForm({ ...form, handler_id: e.target.value })}
                        placeholder="例如 G0002 或 S0003"
                        className="input-base pl-10 pr-4"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">风险等级</label>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(SEVERITY_MAP).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => setForm({ ...form, severity: Number(k) })}
                        className="h-11 rounded-xl border-2 text-xs font-bold transition-all"
                        style={{
                          borderColor: form.severity === Number(k) ? v.color : '#e2e8f0',
                          color: form.severity === Number(k) ? v.color : '#64748b',
                          background: form.severity === Number(k) ? v.bg : 'white',
                        }}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">事件描述</label>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="请输入现场情况、影响范围、临时措施等"
                    className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-brand-500/20 outline-none resize-none"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button onClick={() => setShowForm(false)} className="btn-ghost flex-1 !h-12">
                    取消
                  </button>
                  <button onClick={handleSubmit} disabled={submitting || !form.description.trim()} className="btn-primary flex-1 !h-12 gap-2">
                    <span>{submitting ? '提交中...' : '确认上报'}</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {showRoleModal && isAdmin && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[131] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-6"
              >
                <motion.div
                  initial={{ scale: 0.95, y: 20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.95, y: 20, opacity: 0 }}
                  className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
                >
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xl font-black text-slate-900">用户身份管理</h3>
                    <button onClick={() => setShowRoleModal(false)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-400 hover:text-red-500">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">选择用户</label>
                      <select
                        className="input-base px-4"
                        value={roleForm.userId}
                        onChange={(e) => setRoleForm((curr) => ({ ...curr, userId: e.target.value }))}
                      >
                        <option value="">请选择</option>
                        {users.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {(u.username || `用户${u.id}`)}：{u.role_id}（当前{u.role || '执行者'}）
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">目标身份</label>
                      <select
                        className="input-base px-4"
                        value={roleForm.role}
                        onChange={(e) => setRoleForm((curr) => ({ ...curr, role: e.target.value as '管理员' | '执行者' }))}
                      >
                        <option value="执行者">执行者</option>
                        <option value="管理员">管理员</option>
                      </select>
                    </div>
                    <div className="pt-2 flex gap-3">
                      <button onClick={() => setShowRoleModal(false)} className="btn-ghost flex-1 !h-11">取消</button>
                      <button onClick={updateUserRole} disabled={roleSubmitting} className="btn-primary flex-1 !h-11">
                        {roleSubmitting ? '更新中...' : '确认更新'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
