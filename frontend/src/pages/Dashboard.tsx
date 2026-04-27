import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
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
    <div className="p-8">
      <h1 className="text-xl font-bold text-gray-800 mb-6">控制台总览</h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: '监控路口数', value: `${latest.length}`, unit: '个' },
          { label: '平均车速', value: avgSpeed, unit: 'km/h' },
          { label: '当前拥堵路口', value: `${congested}`, unit: '个' },
          { label: '数据来源', value: '高德API', unit: '实时' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="text-sm text-gray-400 mb-2">{card.label}</div>
            <div className="text-2xl font-bold text-gray-800">
              {card.value}
              <span className="text-sm font-normal text-gray-400 ml-1">{card.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 历史流量图 */}
        <div className="col-span-2 bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-semibold text-gray-800">历史车速趋势</div>
              <div className="text-xs text-gray-400 mt-0.5">最近24条采集记录</div>
            </div>
            <div className="flex items-center gap-3">
              <select
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none"
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
                className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-4 py-1.5 rounded-lg transition disabled:opacity-60"
              >
                {predicting ? '预测中...' : '触发预测'}
              </button>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis unit="km/h" tick={{ fontSize: 11 }} />
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

        {/* 各路口实时状态 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="font-semibold text-gray-800 mb-4">各路口实时状态</div>
          <div className="space-y-2 overflow-auto max-h-72">
            {latest.map((row) => {
              const s = STATUS_LABEL[row.congestion_status] || STATUS_LABEL[0];
              return (
                <div key={row.node_id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                  <span className="text-sm font-medium text-gray-700">{row.node_id}</span>
                  <span className="text-sm text-gray-500">{row.speed} km/h</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: s.color + '20', color: s.color }}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 最新预测 */}
          {predictions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="text-sm font-semibold text-gray-700 mb-2">最新预测结果</div>
              <div className="space-y-1">
                {predictions.slice(0, 5).map((p) => (
                  <div key={p.node_id}
                    className="flex justify-between text-xs text-gray-500 px-2">
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
  );
}