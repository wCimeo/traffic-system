import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import api from '../api';

const NODE_OPTIONS = ['A1','B2','C3','D4','E5','F6','G7','H8','I9','J10'];

const STATUS_LABEL: Record<number, { label: string; color: string }> = {
  0: { label: '未知', color: '#9ca3af' },
  1: { label: '畅通', color: '#10b981' },
  2: { label: '缓行', color: '#f59e0b' },
  3: { label: '拥堵', color: '#ef4444' },
  4: { label: '严重拥堵', color: '#7f1d1d' },
};

export default function Dashboard() {
  const [latest, setLatest] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState('A1');
  const [predicting, setPredicting] = useState(false);

  // 加载最新路况
  const loadLatest = async () => {
    const res = await api.get('/api/traffic/latest');
    setLatest(res.data.data || []);
  };

  // 加载历史流量图表数据
  const loadHistory = async (nodeId: string) => {
    const res = await api.get(`/api/traffic/history?node_id=${nodeId}&limit=24`);
    const rows = res.data.data || [];
    setHistory(rows.map((r: any) => ({
      time: new Date(r.collected_at).toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' }),
      speed: r.speed,
    })).reverse());
  };

  // 加载最新预测
  const loadPredictions = async () => {
    const res = await api.get('/api/predict/latest');
    setPredictions(res.data.data || []);
  };

  // 触发预测
  const triggerPredict = async () => {
    setPredicting(true);
    try {
      await api.post('/api/predict/trigger');
      await loadPredictions();
    } finally {
      setPredicting(false);
    }
  };

  useEffect(() => {
    loadLatest();
    loadPredictions();
    const timer = setInterval(loadLatest, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadHistory(selectedNode);
  }, [selectedNode]);

  // 统计卡片数据
  const avgSpeed = latest.length
    ? (latest.reduce((s, r) => s + r.speed, 0) / latest.length).toFixed(1)
    : '--';
  const congested = latest.filter((r) => r.congestion_status >= 3).length;

  return (
    <div className="console-page">
      <div className="page-head">
        <div>
          <h2 className="console-title">控制台总览</h2>
          <p className="console-subtitle">汇总展示核心路口实时状态、历史车速趋势与最新预测结果。</p>
        </div>
        <div className="toolbar">
          <select
            className="console-select"
            value={selectedNode}
            onChange={(e) => setSelectedNode(e.target.value)}
          >
            {NODE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button
            onClick={triggerPredict}
            disabled={predicting}
            className="primary-btn"
          >
            {predicting ? '预测中...' : '触发预测'}
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="cards-grid">
        {[
          { label: '监控路口数', value: `${latest.length}`, unit: '个' },
          { label: '平均车速', value: avgSpeed, unit: 'km/h' },
          { label: '当前拥堵路口', value: `${congested}`, unit: '个' },
          { label: '数据来源', value: '高德API', unit: '实时' },
        ].map((card) => (
          <div key={card.label} className="metric-card">
            <div className="metric-label">{card.label}</div>
            <div className="metric-value">
              {card.value}
              <span className="metric-unit">{card.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="content-grid">
        {/* 历史流量图 */}
        <div className="console-card">
          <div className="console-card-header">
            <div>
              <div className="console-card-title">历史车速趋势</div>
              <div className="mt-1 text-sm text-slate-500">最近24条采集记录，当前节点：{selectedNode}</div>
            </div>
          </div>

          <div className="console-card-body">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis unit="km/h" tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip formatter={(v: any) => [`${v} km/h`, '车速']} />
              <Line
                type="monotone"
                dataKey="speed"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* 各路口实时状态 */}
        <div className="console-card">
          <div className="console-card-header">
            <div className="console-card-title">各路口实时状态</div>
          </div>
          <div className="console-card-body">
          <div className="list-stack max-h-72 overflow-auto pr-1">
            {latest.map((row) => {
              const s = STATUS_LABEL[row.congestion_status] || STATUS_LABEL[0];
              return (
                <div key={row.node_id}
                  className="status-row">
                  <span className="text-sm font-semibold text-slate-800">{row.node_id}</span>
                  <span className="text-sm text-slate-500">{row.speed} km/h</span>
                  <span className="pill"
                    style={{ background: s.color + '20', color: s.color }}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 最新预测 */}
          {predictions.length > 0 && (
            <div className="mt-4 border-t border-[#e8eef2] pt-4">
              <div className="mb-3 text-sm font-semibold text-slate-700">最新预测结果</div>
              <div className="space-y-1">
                {predictions.slice(0, 5).map((p) => (
                  <div key={p.node_id}
                    className="flex justify-between rounded-md px-2 py-1 text-xs text-slate-500">
                    <span>{p.node_id}</span>
                    <span className="text-emerald-600 font-medium">
                      {p.predicted_speed} km/h
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
