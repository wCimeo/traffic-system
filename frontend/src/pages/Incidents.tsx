import { useEffect, useState } from 'react';
import api from '../api';

const NODE_META = [
  { id: 'A1',  name: '天府大道-锦城大道路口' },
  { id: 'B2',  name: '益州大道-锦城大道路口' },
  { id: 'C3',  name: '天府大道-府城大道路口' },
  { id: 'D4',  name: '天府大道-华阳立交路口' },
  { id: 'E5',  name: '剑南大道-锦城大道路口' },
  { id: 'F6',  name: '益州大道-府城大道路口' },
  { id: 'G7',  name: '天府三街-天府大道路口' },
  { id: 'H8',  name: '科华南路-锦尚西二路路口' },
  { id: 'I9',  name: '中环路火车南站-科华南路口' },
  { id: 'J10', name: '东站西广场-邛崃山路路口' },
];

const SEVERITY_MAP: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: '低', color: '#10b981', bg: '#d1fae5' },
  2: { label: '中', color: '#f59e0b', bg: '#fef3c7' },
  3: { label: '高', color: '#ef4444', bg: '#fee2e2' },
};

const TYPE_OPTIONS = ['交通事故', '道路施工', '异常拥堵', '信号灯故障', '其他'];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active:   { label: '处理中', color: '#f59e0b' },
  resolved: { label: '已解决', color: '#10b981' },
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
    const res = await api.get('/api/incidents');
    setIncidents(res.data.data || []);
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
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id: number) => {
    await api.put(`/api/incidents/${id}`, { status: 'resolved' });
    await loadIncidents();
  };

  const filtered = incidents.filter((i) =>
    filter === 'all' ? true : i.status === filter
  );

  const activeCount = incidents.filter((i) => i.status === 'active').length;
  const resolvedCount = incidents.filter((i) => i.status === 'resolved').length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">突发事件监控</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            处理中 {activeCount} 条 · 已解决 {resolvedCount} 条
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg transition"
        >
          + 上报事件
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: '全部事件', value: incidents.length, key: 'all' },
          { label: '处理中', value: activeCount, key: 'active' },
          { label: '已解决', value: resolvedCount, key: 'resolved' },
        ].map((card) => (
          <div
            key={card.key}
            onClick={() => setFilter(card.key as any)}
            className={`bg-white rounded-2xl p-5 shadow-sm cursor-pointer transition border-2 ${
              filter === card.key ? 'border-emerald-400' : 'border-transparent'
            }`}
          >
            <div className="text-sm text-gray-400 mb-1">{card.label}</div>
            <div className="text-2xl font-bold text-gray-800">{card.value}</div>
          </div>
        ))}
      </div>

      {/* 事件列表 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">暂无事件记录</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['路口', '类型', '描述', '严重程度', '状态', '上报时间', '操作'].map((h) => (
                  <th key={h} className="text-left text-xs text-gray-400 font-medium px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const sev = SEVERITY_MAP[item.severity] || SEVERITY_MAP[1];
                const sta = STATUS_MAP[item.status] || STATUS_MAP['active'];
                return (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    <td className="px-5 py-3 text-sm font-medium text-gray-700">{item.node_id}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{item.type}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 max-w-xs truncate">{item.description}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ color: sev.color, background: sev.bg }}>
                        {sev.label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium" style={{ color: sta.color }}>
                        {sta.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">
                      {new Date(item.created_at).toLocaleString('zh')}
                    </td>
                    <td className="px-5 py-3">
                      {item.status === 'active' && (
                        <button
                          onClick={() => handleResolve(item.id)}
                          className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition"
                        >
                          标记解决
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 上报事件弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-[480px] shadow-xl">
            <h2 className="font-bold text-gray-800 mb-5">上报突发事件</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">路口</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                    value={form.node_id}
                    onChange={(e) => setForm({ ...form, node_id: e.target.value })}
                  >
                   {NODE_META.map((n) => (
                        <option key={n.id} value={n.id}>{n.id} · {n.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">事件类型</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                  >
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">严重程度</label>
                <div className="flex gap-3">
                  {Object.entries(SEVERITY_MAP).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => setForm({ ...form, severity: Number(k) })}
                      className="flex-1 py-2 rounded-lg text-sm font-medium border-2 transition"
                      style={{
                        borderColor: form.severity === Number(k) ? v.color : '#e5e7eb',
                        color: form.severity === Number(k) ? v.color : '#9ca3af',
                        background: form.severity === Number(k) ? v.bg : 'white',
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">事件描述</label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  placeholder="请描述事件详情..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 text-gray-500 rounded-lg py-2 text-sm hover:bg-gray-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !form.description.trim()}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg py-2 text-sm transition disabled:opacity-60"
              >
                {submitting ? '提交中...' : '确认上报'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}