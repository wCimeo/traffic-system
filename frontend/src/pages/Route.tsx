import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Navigation, RefreshCcw, MapPin, Clock3, CircleCheckBig, CircleAlert } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/ToastProvider';

const NODE_OPTIONS = [
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

const HORIZONS = [15, 30, 45, 60] as const;

type DecisionData = {
  node_id: string;
  horizon: number;
  predicted_speed: number;
  recommendation: string;
  level: 'good' | 'normal' | 'bad';
  generated_at: string;
};

export default function RoutePage() {
  const { showToast } = useToast();
  const [selectedNodes, setSelectedNodes] = useState<string[]>(['A1']);
  const [horizon, setHorizon] = useState<number>(15);
  const [loading, setLoading] = useState(false);
  const [decisions, setDecisions] = useState<DecisionData[]>([]);
  const [error, setError] = useState('');

  const nodeNameMap = useMemo(() => Object.fromEntries(NODE_OPTIONS.map((n) => [n.id, n.name])), []);

  const toggleNode = (id: string) => {
    setSelectedNodes((prev) => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const resetSelection = () => {
    setSelectedNodes(['A1']);
    setHorizon(15);
  };

  const getDecision = async (silent = false) => {
    if (selectedNodes.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const responses = await Promise.all(
        selectedNodes.map((nodeId) => api.get('/api/route/decision', { params: { node_id: nodeId, horizon } }))
      );
      const list = responses
        .map((r) => r.data?.data as DecisionData)
        .filter(Boolean)
        .sort((a, b) => b.predicted_speed - a.predicted_speed);
      setDecisions(list);
      if (!silent) showToast('路线建议已刷新', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.error || '获取建议失败，请稍后重试';
      setError(msg);
      if (!silent) showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getDecision(true);
  }, []);

  const levelClass = (level: DecisionData['level']) =>
    level === 'good'
      ? { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' }
      : level === 'bad'
      ? { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' }
      : { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };

  return (
    <div className="space-y-8 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">智能辅助决策路径</h1>
          <p className="mt-2 text-sm text-slate-500">可多选路口，统一查看 15/30/45/60 分钟后的未来路况建议。</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetSelection} className="btn-ghost">
            重置
          </button>
          <button onClick={() => getDecision()} disabled={loading} className="btn-primary gap-2">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新建议
          </button>
        </div>
      </div>

      <div className="console-card space-y-5 p-6">
        <div>
          <label className="text-xs font-bold text-slate-500">选择路口（可多选）</label>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {NODE_OPTIONS.map((n) => {
              const active = selectedNodes.includes(n.id);
              return (
                <button
                  key={n.id}
                  onClick={() => toggleNode(n.id)}
                  className={`h-11 rounded-xl border text-sm font-bold ${
                    active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {n.id}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500">预测时间</label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {HORIZONS.map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`h-11 rounded-xl border text-sm font-bold ${
                  horizon === h ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                {h}分钟
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              resetSelection();
              setTimeout(() => getDecision(), 0);
            }}
            className="btn-ghost"
          >
            恢复默认
          </button>
          <button onClick={() => getDecision()} disabled={loading} className="btn-primary gap-2">
            <Navigation className="h-4 w-4" />
            查询所选路口未来路况
          </button>
        </div>
      </div>

      {error && <div className="console-card p-4 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {decisions.map((decision) => {
          const style = levelClass(decision.level);
          return (
            <motion.div key={decision.node_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="console-card space-y-4 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-black text-slate-900">{decision.node_id}</div>
                  <div className="text-sm text-slate-500">{nodeNameMap[decision.node_id] || decision.node_id}</div>
                </div>
                <div className="flex items-center gap-1 text-sm text-slate-500">
                  <Clock3 className="h-4 w-4" />
                  {decision.horizon} 分钟后
                </div>
              </div>
              <div className="text-4xl font-black text-slate-900">{decision.predicted_speed.toFixed(1)} km/h</div>
              <div className={`rounded-xl border px-4 py-3 ${style.bg} ${style.border}`}>
                <div className={`flex items-center gap-2 font-black ${style.text}`}>
                  {decision.level === 'good' ? <CircleCheckBig className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
                  {decision.recommendation}
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="h-3.5 w-3.5" />
                更新时间：{new Date(decision.generated_at).toLocaleString('zh-CN')}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
