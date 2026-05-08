import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  CircleCheckBig,
  Clock3,
  Gauge,
  Navigation,
  RefreshCcw,
} from 'lucide-react';
import { fetchRouteOutlook } from '../api';
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
  { id: 'I9', name: '中环火车南站-科华南路口' },
  { id: 'J10', name: '东站西广场-邛崃山路路口' },
  { id: 'K11', name: '人民南路四段' },
];

const HORIZONS = [15, 30, 45, 60] as const;
const DEFAULT_SELECTED_NODES = ['A1'];
const DEFAULT_SELECTED_HORIZONS = [15];

type RouteLevel = 'good' | 'normal' | 'bad';

type RouteOutlookItem = {
  node_id: string;
  horizon_minutes: number;
  current_speed: number | null;
  current_status: number | null;
  current_collected_at: string | null;
  predicted_speed: number;
  speed_delta: number | null;
  score: number;
  recommendation: string;
  level: RouteLevel;
  reason: string;
  generated_at: string;
  target_at: string | null;
  source_table: string;
};

const levelStyle = (level: RouteLevel) =>
  level === 'good'
    ? { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500' }
    : level === 'bad'
    ? { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', bar: 'bg-red-500' }
    : { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-500' };

const statusText = (status: number | null) => {
  if (status === 1) return '畅通';
  if (status === 2) return '缓行';
  if (status === 3) return '拥堵';
  if (status === 4) return '严重拥堵';
  return '未知';
};

const statusColor = (status: number | null) => {
  if (status === 1) return 'text-emerald-600';
  if (status === 2) return 'text-amber-500';
  if (status === 3) return 'text-red-500';
  if (status === 4) return 'text-red-700';
  return 'text-slate-900';
};

const formatTime = (value: string | null) => {
  if (!value) return '--';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const fallbackScore = (speed: number, level: RouteLevel) => {
  if (level === 'good') return speed >= 45 ? 92 : 84;
  if (level === 'bad') return speed < 18 ? 35 : 48;
  return speed >= 35 ? 72 : 62;
};

const normalizeOutlookItem = (raw: any): RouteOutlookItem => {
  const predictedSpeed = Number(raw.predicted_speed ?? 0);
  const level = (raw.level || 'normal') as RouteLevel;
  const currentSpeed = typeof raw.current_speed === 'number' ? raw.current_speed : null;
  const delta = typeof raw.speed_delta === 'number' ? raw.speed_delta : null;
  return {
    node_id: String(raw.node_id || ''),
    horizon_minutes: Number(raw.horizon_minutes || raw.horizon || 0),
    current_speed: currentSpeed,
    current_status: typeof raw.current_status === 'number' ? raw.current_status : null,
    current_collected_at: raw.current_collected_at || null,
    predicted_speed: predictedSpeed,
    speed_delta: delta,
    score: typeof raw.score === 'number' ? raw.score : fallbackScore(predictedSpeed, level),
    recommendation: raw.recommendation || (level === 'good' ? '建议通行' : level === 'bad' ? '建议绕行' : '谨慎通行'),
    level,
    reason: raw.reason || `${Number(raw.horizon_minutes || raw.horizon || 0)}分钟后预测速度约 ${predictedSpeed.toFixed(1)} km/h`,
    generated_at: raw.generated_at || new Date().toISOString(),
    target_at: raw.target_at || null,
    source_table: raw.source_table || '--',
  };
};

export default function RoutePage() {
  const { showToast } = useToast();
  const [selectedNodes, setSelectedNodes] = useState<string[]>(DEFAULT_SELECTED_NODES);
  const [selectedHorizons, setSelectedHorizons] = useState<number[]>(DEFAULT_SELECTED_HORIZONS);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<RouteOutlookItem[]>([]);
  const [error, setError] = useState('');

  const nodeNameMap = useMemo(() => Object.fromEntries(NODE_OPTIONS.map((node) => [node.id, node.name])), []);

  const groupedByNode = useMemo(() => {
    const groups = new Map<string, RouteOutlookItem[]>();
    for (const item of items) {
      if (!groups.has(item.node_id)) groups.set(item.node_id, []);
      groups.get(item.node_id)!.push(item);
    }
    return Array.from(groups.entries())
      .map(([nodeId, nodeItems]) => ({
        nodeId,
        items: nodeItems.sort((a, b) => a.horizon_minutes - b.horizon_minutes),
        bestScore: Math.max(...nodeItems.map((item) => item.score)),
        first: nodeItems[0],
      }))
      .sort((a, b) => b.bestScore - a.bestScore);
  }, [items]);

  const bestOption = groupedByNode[0];
  const averageScore = items.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 0;

  const toggleNode = (id: string) => {
    setSelectedNodes((prev) => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  const toggleHorizon = (horizon: number) => {
    setSelectedHorizons((prev) => {
      if (prev.includes(horizon)) return prev.length === 1 ? prev : prev.filter((item) => item !== horizon);
      return [...prev, horizon].sort((a, b) => a - b);
    });
  };

  const resetSelection = () => {
    setSelectedNodes(DEFAULT_SELECTED_NODES);
    setSelectedHorizons(DEFAULT_SELECTED_HORIZONS);
  };

  const loadOutlook = async (silent = false) => {
    if (!selectedNodes.length || !selectedHorizons.length) return;
    setLoading(true);
    setError('');
    try {
      const responses = await Promise.all(selectedNodes.map((nodeId) => fetchRouteOutlook(nodeId, selectedHorizons)));
      const list = responses.flatMap((res) => (res.data?.data || []).map(normalizeOutlookItem));
      setItems(list);
      if (!silent) showToast('路线预测建议已刷新', 'success');
    } catch (err: any) {
      const message = err?.response?.data?.error || '获取路线建议失败，请稍后重试';
      setError(message);
      if (!silent) showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOutlook(true);
  }, []);

  return (
    <div className="space-y-8 pb-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="console-card p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Route Decision</div>
              <h2 className="mt-2 text-2xl font-black text-slate-900">多时域路口通行评估</h2>
            </div>
            <Navigation className="h-6 w-6 text-brand-500" />
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-500">选择路口，可多选</label>
              <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
                {NODE_OPTIONS.map((node) => {
                  const active = selectedNodes.includes(node.id);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => toggleNode(node.id)}
                      className={`h-11 rounded-xl border text-sm font-black transition ${
                        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                      }`}
                    >
                      {node.id}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500">预测时域</label>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {HORIZONS.map((horizon) => {
                  const active = selectedHorizons.includes(horizon);
                  return (
                    <button
                      key={horizon}
                      type="button"
                      onClick={() => toggleHorizon(horizon)}
                      className={`h-11 rounded-xl border text-sm font-black transition ${
                        active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                      }`}
                    >
                      {horizon} 分钟
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="console-card p-6">
          <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
            <Gauge className="h-4 w-4 text-brand-500" />
            Summary
          </div>
          <div className="text-4xl font-black text-slate-900">{averageScore || '--'}</div>
          <div className="mt-2 text-sm font-bold text-slate-500">平均通行评分</div>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
            推荐优先：{bestOption ? `${bestOption.nodeId} · ${nodeNameMap[bestOption.nodeId]}` : '--'}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={() => loadOutlook()} disabled={loading} className="btn-primary gap-2">
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新预测建议
        </button>
        <button onClick={resetSelection} className="btn-ghost">
          重置
        </button>
      </div>

      {error && <div className="console-card p-4 text-sm font-bold text-red-600">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {groupedByNode.map((group) => {
          const primary = group.items[0];
          const primaryStyle = levelStyle(primary.level);
          return (
            <motion.div key={group.nodeId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="console-card p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-black text-slate-900">{group.nodeId}</div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${primaryStyle.bg} ${primaryStyle.border} ${primaryStyle.text}`}>
                      {primary.recommendation}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-500">{nodeNameMap[group.nodeId] || group.nodeId}</div>
                </div>
              </div>

              <div className="mb-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-800">当前速度</div>
                  <div className={`mt-2 text-2xl font-black ${statusColor(primary.current_status)}`}>
                    {primary.current_speed === null ? '--' : `${primary.current_speed.toFixed(1)} km/h`}
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-400">{statusText(primary.current_status)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-800">分数</div>
                  <div className={`mt-2 text-2xl font-black ${primaryStyle.text}`}>{primary.score}</div>
                  <span className="text-xs font-bold text-slate-400">{primary.recommendation}</span>
                </div>
              </div>

              <div className="space-y-3">
                {group.items.map((item) => {
                  const style = levelStyle(item.level);
                  const delta = item.speed_delta;
                  const improving = delta !== null && delta >= 0;
                  return (
                    <div key={`${item.node_id}-${item.horizon_minutes}`} className={`rounded-xl border p-4 ${style.border} ${style.bg}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <Clock3 className={`h-4 w-4 ${style.text}`} />
                          <span className={`text-sm font-black ${style.text}`}>{item.horizon_minutes} 分钟后</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-black text-slate-700">
                          {delta === null ? null : improving ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownRight className="h-4 w-4 text-red-600" />}
                          {delta === null ? '--' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} km/h`}
                        </div>
                      </div>

                      <div className="mt-3 flex items-end justify-between gap-4">
                        <div>
                          <div className="text-3xl font-black text-slate-900">{item.predicted_speed.toFixed(1)} km/h</div>
                          <div className="mt-1 text-xs font-bold text-slate-500">预测目标：{formatTime(item.target_at)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.level === 'good' ? <CircleCheckBig className="h-5 w-5 text-emerald-600" /> : <CircleAlert className={`h-5 w-5 ${style.text}`} />}
                          <span className={`text-lg font-black ${style.text}`}>{item.score}</span>
                        </div>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                        <div className={`h-full ${style.bar}`} style={{ width: `${item.score}%` }} />
                      </div>
                      <div className="mt-3 text-xs font-bold leading-relaxed text-slate-600">{item.reason}</div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-1 text-xs font-bold text-slate-400">
                <Activity className="h-3.5 w-3.5" />
                预测生成：{formatTime(primary.generated_at)}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
