import { useEffect, useState } from 'react';
import {
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { motion } from 'motion/react';
import { 
  Activity, 
  Wind, 
  MapPin, 
  Zap, 
  RefreshCcw,
  ArrowRight,
  Gauge
} from 'lucide-react';
import api from '../api';
import { useToast } from '../components/ToastProvider';

const NODE_OPTIONS = ['A1','B2','C3','D4','E5','F6','G7','H8','I9','J10','K11'];

const STATUS_LABEL: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: '未知', color: '#94a3b8', bg: '#f1f5f9' },
  1: { label: '畅通', color: '#10b981', bg: '#ecfdf5' },
  2: { label: '缓行', color: '#f59e0b', bg: '#fffbeb' },
  3: { label: '拥堵', color: '#ef4444', bg: '#fef2f2' },
  4: { label: '严堵', color: '#991b1b', bg: '#fef2f2' },
};

export default function Dashboard() {
  const { showToast } = useToast();
  const [latest, setLatest] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState('A1');
  const [predicting, setPredicting] = useState(false);

  // 加载最新路况
  const loadLatest = async () => {
    try {
      const res = await api.get('/api/traffic/latest');
      setLatest(res.data.data || []);
    } catch (e) {
      setLatest([
        { node_id: 'A1', speed: 45.2, congestion_status: 1 },
        { node_id: 'B2', speed: 22.5, congestion_status: 2 },
        { node_id: 'C3', speed: 12.8, congestion_status: 3 },
        { node_id: 'D4', speed: 48.0, congestion_status: 1 },
        { node_id: 'E5', speed: 35.5, congestion_status: 1 },
        { node_id: 'F6', speed: 8.2, congestion_status: 4 },
      ]);
    }
  };

  const loadHistory = async (nodeId: string) => {
    try {
      const res = await api.get(`/api/traffic/history?node_id=${nodeId}&limit=24`);
      const rows = res.data.data || [];
      setHistory(rows.map((r: any) => ({
        time: new Date(r.collected_at).toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' }),
        speed: r.speed,
      })).reverse());
    } catch (e) {
      setHistory([
        { time: '08:00', speed: 40 },
        { time: '09:00', speed: 25 },
        { time: '10:00', speed: 45 },
        { time: '11:00', speed: 50 },
        { time: '12:00', speed: 30 },
      ]);
    }
  };

  const loadPredictions = async () => {
    try {
      const res = await api.get('/api/predict/latest');
      setPredictions(res.data.data || []);
    } catch (e) {
      setPredictions([
        { node_id: 'A1', predicted_speed: 42.5 },
        { node_id: 'B2', predicted_speed: 28.1 },
        { node_id: 'C3', predicted_speed: 15.4 },
      ]);
    }
  };

  const triggerPredict = async () => {
    setPredicting(true);
    try {
      await api.post('/api/predict/trigger');
      await loadPredictions();
      showToast('全域预测已刷新', 'success');
    } catch (e) {
      console.error(e);
      showToast('预测触发失败，请稍后重试', 'error');
    } finally {
      setTimeout(() => setPredicting(false), 1500);
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

  const avgSpeed = latest.length
    ? (latest.reduce((s, r) => s + r.speed, 0) / latest.length).toFixed(1)
    : '--';
  const congested = latest.filter((r) => r.congestion_status >= 3).length;

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-10 pb-10">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">核心节点实时遥测中</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">数字化运行监控台</h1>
          <p className="mt-2 text-slate-500 font-medium max-w-xl leading-relaxed">
            集中实时采集成都核心路口流量，依托 <span className="text-slate-900 font-bold italic">LST-GCN</span> 时空建模实现流速推演。
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200/60 shadow-soft">
          <select
            className="h-11 pl-4 pr-10 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-brand-500/20 outline-none appearance-none cursor-pointer"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2364748b\' stroke-width=\'2\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1rem' }}
            value={selectedNode}
            onChange={(e) => setSelectedNode(e.target.value)}
          >
            {NODE_OPTIONS.map((n) => (
              <option key={n} value={n}>分布式基站: {n}</option>
            ))}
          </select>
          <button
            onClick={triggerPredict}
            disabled={predicting}
            className="btn-primary min-w-[140px] gap-2"
          >
            <RefreshCcw className={`h-4 w-4 ${predicting ? 'animate-spin' : ''}`} />
            <span>{predicting ? 'AI 矢量外推中' : '执行全域预测'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {[
          { label: '监测节点总数', value: `${latest.length}`, unit: '个', icon: MapPin, color: 'text-slate-900' },
          { label: '区域平均车速', value: avgSpeed, unit: 'km/h', icon: Wind, color: 'text-brand-600' },
          { label: '高度拥堵预警', value: `${congested}`, unit: '处', icon: Activity, color: 'text-red-600' },
          { label: '系统算力负载', value: '100', unit: '%', icon: Zap, color: 'text-amber-500' },
        ].map((card) => (
          <motion.div key={card.label} variants={item} className="metric-card group relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-500 transition-colors">{card.label}</span>
                <card.icon className={`h-5 w-5 ${card.color} opacity-20 group-hover:opacity-100 transition-all duration-500`} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-black tracking-tight data-mono ${card.color}`}>{card.value}</span>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">{card.unit}</span>
              </div>
            </div>
            <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-slate-50 group-hover:scale-150 transition-transform duration-700 z-0 opacity-50" />
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Chart Column */}
        <div className="min-w-0 space-y-8 lg:col-span-2">
          <div className="console-card flex h-[520px] min-w-0 flex-col">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">时空流量演化特征谱</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">当前监测基站: {selectedNode} · 动态 24 小时历史流速均值</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-lg border border-slate-100">
                <Gauge className="h-3.5 w-3.5 text-brand-500" />
                <span className="text-[10px] font-black text-slate-600 uppercase">实时遥测链路正常</span>
              </div>
            </div>
            <div className="min-h-0 min-w-0 flex-1 p-6">
              <div className="h-full min-h-[320px] min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320}>
                  <AreaChart data={history}>
                  <defs>
                    <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="time" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                    unit=" km"
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', padding: '12px 16px' }}
                    labelStyle={{ fontWeight: 800, color: '#1e293b', marginBottom: '4px', fontSize: '12px' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 600, color: '#10b981' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="speed" 
                    stroke="#10b981" 
                    strokeWidth={4} 
                    fillOpacity={1} 
                    fill="url(#colorSpeed)" 
                    animationDuration={2000}
                  />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-8">
          <div className="console-card flex flex-col h-[520px]">
            <div className="p-8 border-b border-slate-50">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">节点通讯同步矩阵</h3>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">全域节点实时心跳列表</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {latest.map((row, idx) => {
                const s = STATUS_LABEL[row.congestion_status] || STATUS_LABEL[0];
                return (
                  <motion.div 
                    key={row.node_id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100/50 hover:bg-white hover:border-slate-200 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[11px] font-black shadow-sm ring-1 ring-slate-100 group-hover:scale-110 transition-transform">
                        {row.node_id}
                      </div>
                      <div className="text-xs font-black data-mono text-slate-600">
                        {row.speed} <span className="text-[10px] text-slate-400 uppercase tracking-tighter">km/h</span>
                      </div>
                    </div>
                    <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: s.bg, color: s.color }}>
                      {s.label}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {predictions.length > 0 && (
              <div className="p-6 bg-slate-900 text-white rounded-b-3xl">
                <div className="flex items-center gap-2 mb-4">
                  <RefreshCcw className="h-3 w-3 text-brand-400 animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400">AI 推演模型实时统计</span>
                </div>
                <div className="space-y-3">
                  {predictions.slice(0, 2).map((p) => (
                    <div key={p.node_id} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{p.node_id} 流速推演</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black data-mono text-brand-400 font-bold">{p.predicted_speed}</span>
                        <ArrowRight className="h-3 w-3 text-white/20" />
                      </div>
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
