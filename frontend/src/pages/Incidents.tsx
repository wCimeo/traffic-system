import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Filter,
  X,
  ChevronRight
} from 'lucide-react';
import api from '../api';

const NODE_META = [
  { id: 'A1',  name: '天府大道-锦城大道路口' },
  { id: 'B2',  name: '益州大道-锦城大道路口' },
  { id: 'C3',  name: '成华大道-杉板桥路口' },
  { id: 'D4',  name: '天府大道-华阳立交路口' },
  { id: 'E5',  name: '剑南大道-锦城大道路口' },
  { id: 'F6',  name: '益州大道-府城大道路口' },
  { id: 'G7',  name: '天府三街-天府大道路口' },
  { id: 'H8',  name: '科华南路-锦尚西二路路口' },
  { id: 'I9',  name: '中环路火车南站-科华南路口' },
  { id: 'J10', name: '东站西广场-邛崃山路路口' },
  { id: 'K11', name: '人民南路四段' },
];

const SEVERITY_MAP: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: '低级风险', color: '#10b981', bg: '#ecfdf5' },
  2: { label: '中级风险', color: '#f59e0b', bg: '#fffbeb' },
  3: { label: '紧急预警', color: '#ef4444', bg: '#fef2f2' },
};

const TYPE_OPTIONS = ['交通事故', '道路施工', '异常拥堵', '信号灯故障', '其他'];

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  active:   { label: '处理中', color: '#f59e0b', icon: Clock },
  resolved: { label: '已解决', color: '#10b981', icon: CheckCircle2 },
};

export default function Incidents() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [form, setForm] = useState({
    node_id: 'A1',
    type: '交通事故',
    description: '',
    severity: 1,
  });
  const [submitting, setSubmitting] = useState(false);

  const loadIncidents = async () => {
    try {
      const res = await api.get('/api/incidents');
      setIncidents(res.data.data || []);
    } catch (e) {
      // Mock for demo
      setIncidents([
        { id: 1, node_id: 'A1', type: '交通事故', description: '两车发生轻微刮蹭', severity: 1, status: 'active', created_at: new Date().toISOString() },
        { id: 2, node_id: 'C3', type: '异常拥堵', description: '车流量突增，路口滞留严重', severity: 3, status: 'active', created_at: new Date().toISOString() },
        { id: 3, node_id: 'F6', type: '信号灯故障', description: '红绿灯闪烁不灵', severity: 2, status: 'resolved', created_at: new Date().toISOString() },
      ]);
    }
  };

  useEffect(() => { loadIncidents(); }, []);

  const handleSubmit = async () => {
    if (!form.description.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/api/incidents', form);
      setForm({ node_id: 'A1', type: '交通事故', description: '', severity: 1 });
      setShowForm(false);
      await loadIncidents();
    } catch (e) {
      console.error(e);
      // Logic for adding to state if mock
      const newIncident = { ...form, id: Date.now(), status: 'active', created_at: new Date().toISOString() };
      setIncidents([newIncident, ...incidents]);
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id: number) => {
    try {
      await api.put(`/api/incidents/${id}`, { status: 'resolved' });
      await loadIncidents();
    } catch (e) {
      setIncidents(incidents.map(i => i.id === id ? { ...i, status: 'resolved' } : i));
    }
  };

  const filtered = incidents.filter((i) =>
    filter === 'all' ? true : i.status === filter
  );

  const activeCount = incidents.filter((i) => i.status === 'active').length;
  const resolvedCount = incidents.filter((i) => i.status === 'resolved').length;

  return (
    <div className="space-y-10 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">突发事件监控</h1>
          <p className="mt-2 text-slate-500 font-medium uppercase text-[10px] tracking-widest leading-relaxed">
            实时突发情报流 · 当前待处理: {activeCount} · 已闭环解决: {resolvedCount}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary gap-2 shadow-lg shadow-slate-900/10"
        >
          <Plus className="h-4 w-4" />
          <span>上报突发事件</span>
        </button>
      </div>

      {/* Stats Quick Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: '全量事件汇总', value: incidents.length, key: 'all', icon: Filter },
          { label: '正在处理节点', value: activeCount, key: 'active', icon: Clock },
          { label: '已恢复常态运行', value: resolvedCount, key: 'resolved', icon: CheckCircle2 },
        ].map((card) => (
          <button
            key={card.key}
            onClick={() => setFilter(card.key as any)}
            className={`console-card p-6 flex items-center justify-between group transition-all duration-300 ${
              filter === card.key ? 'bg-slate-900 border-slate-900 shadow-xl' : 'hover:bg-white hover:border-slate-300'
            }`}
          >
            <div className="text-left">
              <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${
                filter === card.key ? 'text-slate-400' : 'text-slate-500'
              }`}>{card.label}</div>
              <div className={`text-4xl font-black data-mono tracking-tighter ${
                filter === card.key ? 'text-white' : 'text-slate-900'
              }`}>
                {card.value.toString().padStart(2, '0')}
              </div>
            </div>
            <div className={`h-12 w-12 flex items-center justify-center rounded-2xl transition-all ${
              filter === card.key ? 'bg-white/10 text-white animate-pulse' : 'bg-slate-50 text-slate-400 group-hover:scale-110'
            }`}>
              <card.icon className="h-6 w-6 stroke-[2.5px]" />
            </div>
          </button>
        ))}
      </div>

      {/* Incidents List */}
      <div className="console-card">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-white sticky top-0 z-10">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 uppercase">全域系统异常日志</h3>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">当前过滤项: {filtered.length} 条记录</p>
          </div>
          <div className="flex items-center gap-3">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 pointer-events-none" />
                <input placeholder="搜索节点编号..." className="h-10 pl-9 pr-4 bg-slate-50 rounded-xl text-xs font-bold border-none focus:ring-2 focus:ring-brand-500/20 outline-none w-48" />
             </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                {['核心节点', '事件类型', '详情描述', '威胁等级', '当前状态', '上报时标', '管理指令'].map((h) => (
                  <th key={h} className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence mode="popLayout">
                {filtered.map((item) => {
                  const sev = SEVERITY_MAP[item.severity] || SEVERITY_MAP[1];
                  const sta = STATUS_MAP[item.status] || STATUS_MAP['active'];
                  const Icon = sta.icon;
                  return (
                    <motion.tr 
                      key={item.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="group hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white text-[10px] font-black shadow-sm">
                            {item.node_id}
                          </div>
                          <div>
                            <div className="text-xs font-black text-slate-800 uppercase tracking-tight">{item.node_id} 节点</div>
                            <div className="text-[10px] font-bold text-slate-400">区域控制站</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-xs font-black text-slate-700">{item.type}</span>
                      </td>
                      <td className="px-8 py-5">
                        <p className="text-xs font-medium text-slate-500 max-w-xs truncate group-hover:text-slate-800 transition-colors">{item.description}</p>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm w-fit" style={{ borderColor: sev.color + '20', background: sev.bg }}>
                          <div className="h-1.5 w-1.5 rounded-full" style={{ background: sev.color }} />
                          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: sev.color }}>{sev.label}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2 text-xs font-black" style={{ color: sta.color }}>
                          <Icon className="h-3.5 w-3.5" />
                          <span className="uppercase tracking-widest">{sta.label}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-[10px] font-bold text-slate-400 capitalize data-mono">
                        {new Date(item.created_at).toLocaleString('zh', { hour: '2-digit', minute: '2-digit', second: '2-digit', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-8 py-5">
                        {item.status === 'active' ? (
                          <button
                            onClick={() => handleResolve(item.id)}
                            className="h-8 px-3 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                          >
                            恢复常态
                          </button>
                        ) : (
                          <div className="h-8 px-3 inline-flex items-center rounded-lg bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest cursor-not-allowed">
                            已存档
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-24 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-50 text-slate-300 mb-4">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <p className="text-slate-400 font-black text-xs uppercase tracking-widest">No matching logs found in system</p>
            </div>
          )}
        </div>
      </div>

      {/* Reporting Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black tracking-tight text-slate-900">上报突发事件</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">New Incident Entry Form</p>
                </div>
                <button onClick={() => setShowForm(false)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-8 pt-4 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">受影响节点</label>
                    <select
                      className="input-base px-5 font-bold"
                      value={form.node_id}
                      onChange={(e) => setForm({ ...form, node_id: e.target.value })}
                    >
                     {NODE_META.map((n) => (
                          <option key={n.id} value={n.id}>{n.id} · {n.name.slice(0, 10)}...</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">事件分类</label>
                    <select
                      className="input-base px-5 font-bold"
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                    >
                      {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">风险评估等级</label>
                  <div className="flex gap-3">
                    {Object.entries(SEVERITY_MAP).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => setForm({ ...form, severity: Number(k) })}
                        className="flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all group overflow-hidden relative"
                        style={{
                          borderColor: form.severity === Number(k) ? v.color : '#f1f5f9',
                          color: form.severity === Number(k) ? v.color : '#94a3b8',
                          background: form.severity === Number(k) ? v.bg : 'transparent',
                        }}
                      >
                        {v.label}
                        {form.severity === Number(k) && (
                          <motion.div layoutId="sevHighlight" className="absolute left-0 right-0 bottom-0 h-1" style={{ background: v.color }} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">现场日志描述</label>
                  <textarea
                    rows={4}
                    className="w-full p-5 bg-slate-50 border-none rounded-2xl text-sm transition-all focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:outline-none placeholder:text-slate-400 font-medium resize-none"
                    placeholder="输入现场具体情况报告..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    onClick={() => setShowForm(false)}
                    className="btn-ghost flex-1 !h-14 font-black uppercase tracking-widest"
                  >
                    取消录入
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !form.description.trim()}
                    className="btn-primary flex-1 !h-14 gap-2 shadow-xl shadow-slate-900/20 uppercase tracking-widest"
                  >
                    {submitting ? '写入核心数据库...' : '确认同步上报'}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
