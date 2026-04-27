import { useEffect, useState } from 'react';
import api from '../api';

const NODE_META: Record<string, string> = {
  A1: '天府大道-锦城大道路口',
  B2: '益州大道-锦城大道路口',
  C3: '成华大道-杉板桥路口',
  D4: '天府大道-华阳立交路口',
  E5: '剑南大道-锦城大道路口',
  F6: '益州大道-府城大道路口',
  G7: '天府三街-天府大道路口',
  H8: '科华南路-锦尚西二路路口',
  I9: '中环路火车南站-科华南路口',
  J10: '东站西广场-邛崃山路路口',
};

const STATUS_COLOR: Record<number, string> = {
  0: '#9ca3af', 1: '#10b981', 2: '#f59e0b', 3: '#ef4444', 4: '#7f1d1d',
};

const STATUS_LABEL: Record<number, string> = {
  0: '暂无数据', 1: '畅通', 2: '缓行', 3: '拥堵', 4: '严重拥堵',
};

export default function RoutePage() {
  const [routeData, setRouteData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');

  const loadRoute = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/route/recommend');
      setRouteData(res.data.data || []);
      setLastUpdate(new Date().toLocaleTimeString('zh'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRoute(); }, []);

  const top3 = routeData.slice(0, 3);
  const rest = routeData.slice(3);

  const getSpeedLevel = (speed: number) => {
    if (speed >= 40) return { label: '快速通行', color: '#10b981', bg: '#d1fae5' };
    if (speed >= 25) return { label: '正常通行', color: '#f59e0b', bg: '#fef3c7' };
    return { label: '建议绕行', color: '#ef4444', bg: '#fee2e2' };
  };

  return (
    <div className="console-page">
      <div className="page-head">
        <div>
          <h2 className="console-title">智能路线推荐</h2>
          <p className="console-subtitle">
            基于当前各路口实时车速排序 · 最后更新：{lastUpdate || '--'}
          </p>
        </div>
        <button
          onClick={loadRoute}
          disabled={loading}
          className="primary-btn"
        >
          {loading ? '更新中...' : '刷新推荐'}
        </button>
      </div>

      {/* 说明卡片 */}
      <div className="info-banner">
        系统根据高德API采集的各路口当前平均车速进行排序，车速越高表示该路口通行状况越好。
        推荐优先选择排名靠前的路口通行。
      </div>

      {/* 推荐前三 */}
      <div className="rank-grid">
        {top3.map((item, index) => {
          const level = getSpeedLevel(item.speed);
          return (
            <div key={item.node_id}
              className={`rank-card ${index === 0 ? 'best' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="rank-badge">
                    {index + 1}
                  </div>
                  <span className="font-bold text-slate-900">{item.node_id}</span>
                </div>
                <span className="pill"
                  style={{ color: level.color, background: level.bg }}>
                  {level.label}
                </span>
              </div>
              <div className="mb-3 min-h-10 text-sm leading-5 text-slate-500">{NODE_META[item.node_id]}</div>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-light text-slate-800">{item.speed}</span>
                <span className="mb-1 text-sm text-slate-400">km/h</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full"
                  style={{ background: STATUS_COLOR[item.congestion_status] }} />
                  <span className="text-xs text-slate-400">
                  {STATUS_LABEL[item.congestion_status]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 其余路口 */}
      <div className="console-card table-card">
        <div className="console-card-header pb-4">
          <span className="console-card-title">其余路口状态</span>
        </div>
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {['排名', '路口', '路口名称', '当前车速', '拥堵状态', '通行建议'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rest.map((item, index) => {
              const level = getSpeedLevel(item.speed);
              return (
                <tr key={item.node_id}>
                  <td className="text-slate-400">{index + 4}</td>
                  <td className="font-medium text-slate-800">{item.node_id}</td>
                  <td>{NODE_META[item.node_id]}</td>
                  <td className="font-medium text-slate-800">{item.speed} km/h</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full"
                        style={{ background: STATUS_COLOR[item.congestion_status] }} />
                      <span className="text-xs text-slate-500">
                        {STATUS_LABEL[item.congestion_status]}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="pill"
                      style={{ color: level.color, background: level.bg }}>
                      {level.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
