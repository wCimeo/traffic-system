import { useEffect, useState } from 'react';
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
    <div className="console-page">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="console-title">突发事件监控</h2>
          <p className="console-subtitle">
            处理中 {activeCount} 条 · 已解决 {resolvedCount} 条
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="primary-btn"
        >
          + 上报事件
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="stats-grid">
        {[
          { label: '全部事件', value: incidents.length, key: 'all' },
          { label: '处理中', value: activeCount, key: 'active' },
          { label: '已解决', value: resolvedCount, key: 'resolved' },
        ].map((card) => (
          <div
            key={card.key}
            onClick={() => setFilter(card.key as any)}
            className={`stat-card ${filter === card.key ? 'active' : ''}`}
          >
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{card.value}</div>
          </div>
        ))}
      </div>

      {/* 事件列表 */}
      <div className="console-card table-card">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">暂无事件记录</div>
        ) : (
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {['路口', '类型', '描述', '严重程度', '状态', '上报时间', '操作'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const sev = SEVERITY_MAP[item.severity] || SEVERITY_MAP[1];
                const sta = STATUS_MAP[item.status] || STATUS_MAP['active'];
                return (
                  <tr key={item.id}>
                    <td className="font-medium text-slate-800">{item.node_id}</td>
                    <td>{item.type}</td>
                    <td className="max-w-xs truncate">{item.description}</td>
                    <td>
                      <span className="severity-pill"
                        style={{ color: sev.color, background: sev.bg }}>
                        {sev.label}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs font-medium" style={{ color: sta.color }}>
                        {sta.label}
                      </span>
                    </td>
                    <td className="text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleString('zh')}
                    </td>
                    <td>
                      {item.status === 'active' && (
                        <button
                          onClick={() => handleResolve(item.id)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-700"
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
          </div>
        )}
      </div>

      {/* 上报事件弹窗 */}
      {showForm && (
        <div className="modal-mask">
          <div className="modal-card">
            <div className="modal-header">上报突发事件</div>

            <div className="modal-body">
            <div className="form-grid">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">路口</label>
                  <select
                    className="console-select"
                    value={form.node_id}
                    onChange={(e) => setForm({ ...form, node_id: e.target.value })}
                  >
                   {NODE_META.map((n) => (
                        <option key={n.id} value={n.id}>{n.id} · {n.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">事件类型</label>
                  <select
                    className="console-select"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                  >
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="field-label">严重程度</label>
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
                <label className="field-label">事件描述</label>
                <textarea
                  rows={3}
                  className="console-textarea"
                  placeholder="请描述事件详情..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="ghost-btn flex-1"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !form.description.trim()}
                className="primary-btn flex-1"
              >
                {submitting ? '提交中...' : '确认上报'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
