import { useEffect, useState } from 'react';
import api from '../api';

const NODE_META: Record<string, string> = {
  A1: '天府大道-锦城大道路口',
  B2: '益州大道-锦城大道路口',
  C3: '天府大道-府城大道路口',
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
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">智能路线推荐</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            基于当前各路口实时车速排序 · 最后更新：{lastUpdate || '--'}
          </p>
        </div>
        <button
          onClick={loadRoute}
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg transition disabled:opacity-60"
        >
          {loading ? '更新中...' : '刷新推荐'}
        </button>
      </div>

      {/* 说明卡片 */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-6 text-sm text-emerald-700">
        系统根据高德API采集的各路口当前平均车速进行排序，车速越高表示该路口通行状况越好。
        推荐优先选择排名靠前的路口通行。
      </div>

      {/* 推荐前三 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {top3.map((item, index) => {
          const level = getSpeedLevel(item.speed);
          return (
            <div key={item.node_id}
              className="bg-white rounded-2xl p-5 shadow-sm border-2"
              style={{ borderColor: index === 0 ? '#10b981' : '#f3f4f6' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0 ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {index + 1}
                  </div>
                  <span className="font-bold text-gray-800">{item.node_id}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ color: level.color, background: level.bg }}>
                  {level.label}
                </span>
              </div>
              <div className="text-sm text-gray-400 mb-3">{NODE_META[item.node_id]}</div>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold text-gray-800">{item.speed}</span>
                <span className="text-sm text-gray-400 mb-1">km/h</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full"
                  style={{ background: STATUS_COLOR[item.congestion_status] }} />
                <span className="text-xs text-gray-400">
                  {STATUS_LABEL[item.congestion_status]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 其余路口 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-600">其余路口状态</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              {['排名', '路口', '路口名称', '当前车速', '拥堵状态', '通行建议'].map((h) => (
                <th key={h} className="text-left text-xs text-gray-400 font-medium px-5 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rest.map((item, index) => {
              const level = getSpeedLevel(item.speed);
              return (
                <tr key={item.node_id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="px-5 py-3 text-sm text-gray-400">{index + 4}</td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-700">{item.node_id}</td>
                  <td className="px-5 py-3 text-sm text-gray-400">{NODE_META[item.node_id]}</td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-700">{item.speed} km/h</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full"
                        style={{ background: STATUS_COLOR[item.congestion_status] }} />
                      <span className="text-xs text-gray-500">
                        {STATUS_LABEL[item.congestion_status]}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
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
  );
}