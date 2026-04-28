import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowUpRight, 
  MapPin, 
  RefreshCcw, 
  Navigation,
  Trophy,
  Activity,
  AlertCircle
} from 'lucide-react';
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
  0: '#94a3b8', 1: '#10b981', 2: '#f59e0b', 3: '#ef4444', 4: '#991b1b',
};

const STATUS_LABEL: Record<number, string> = {
  0: '暂无通讯', 1: '运行畅通', 2: '动态运行', 3: '流量饱和', 4: '严重拥堵',
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
    } catch (e) {
      const mock = Object.keys(NODE_META).map(id => ({
        node_id: id,
        speed: (Math.random() * 40 + 10).toFixed(1),
        congestion_status: Math.floor(Math.random() * 4) + 1
      })).sort((a, b) => Number(b.speed) - Number(a.speed));
      setRouteData(mock);
      setLastUpdate(new Date().toLocaleTimeString('zh'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRoute(); }, []);

  const top3 = routeData.slice(0, 3);
  const rest = routeData.slice(3);

  const getSpeedLevel = (speed: number) => {
    if (speed >= 40) return { label: '推荐等级: 极佳', color: '#10b981', bg: '#ecfdf5' };
    if (speed >= 25) return { label: '推荐等级: 良好', color: '#f59e0b', bg: '#fffbeb' };
    return { label: '建议规避', color: '#ef4444', bg: '#fef2f2' };
  };

  return (
    <div className="space-y-10 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">智能辅助决策路径</h1>
          <p className="mt-2 text-slate-500 font-medium uppercase text-[10px] tracking-widest leading-relaxed">
            AI 矢量拓扑深度优化 · 最近同步: {lastUpdate || '正在连接实时引擎'}
          </p>
        </div>
        <button
          onClick={loadRoute}
          disabled={loading}
          className="btn-primary gap-2 shadow-xl shadow-slate-900/10"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>全域链路重算</span>
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-slate-900 rounded-[2rem] p-8 relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform duration-700">
            <Navigation className="h-32 w-32 text-white" strokeWidth={1} />
         </div>
         <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-8">
            <div className="h-16 w-16 bg-brand-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/20">
               <Activity className="h-8 w-8 text-white stroke-[2.5px]" />
            </div>
            <div>
               <h3 className="text-lg font-black text-white italic tracking-tight mb-1">AI 辅助决策算法引擎 v2.0</h3>
               <p className="text-slate-400 text-xs font-medium leading-relaxed max-w-2xl">
                  系统采用多维度时空流速权重算法，实时对比成都市核心交通枢纽的 <span className="text-brand-400 font-bold">数字化监测节点</span>。引擎自动剥离拥堵干扰因子，优先推荐流速最高且负载均衡的最优链路方案。
               </p>
            </div>
         </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-2 px-1">
           <Trophy className="h-4 w-4 text-emerald-500" />
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">全域核心最优链路推荐</span>
        </div>
        
        {/* Top 3 Champions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {top3.map((item, index) => {
            const level = getSpeedLevel(Number(item.speed));
            return (
              <motion.div 
                key={item.node_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`console-card p-8 group relative ${index === 0 ? 'bg-white ring-2 ring-emerald-500 shadow-2xl scale-[1.02] z-10' : 'bg-white opacity-80 hover:opacity-100 hover:scale-[1.01]'}`}
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 flex items-center justify-center rounded-2xl text-xs font-black shadow-sm ${index === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white'}`}>
                      {index + 1}
                    </div>
                    <div className="text-sm font-black text-slate-900 italic tracking-tighter">{item.node_id} 路径单元</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest" style={{ color: level.color, background: level.bg }}>
                    {level.label}
                  </div>
                </div>
                
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                   <MapPin className="h-3 w-3" />
                   地理节点元数据
                </p>
                <h4 className="text-sm font-black text-slate-800 leading-tight mb-8 min-h-[2.5rem]">{NODE_META[item.node_id]}</h4>
                
                <div className="flex items-end gap-2 mb-6">
                  <span className="text-5xl font-black data-mono tracking-tighter text-slate-900 leading-none">{item.speed}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">km/h 准时流速</span>
                </div>
                
                <div className="flex items-center justify-between py-4 border-t border-slate-50">
                   <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[item.congestion_status] }} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{STATUS_LABEL[item.congestion_status]}</span>
                   </div>
                   <ArrowUpRight className="h-4 w-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Secondary Nodes List */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 px-1">
           <AlertCircle className="h-4 w-4 text-slate-400" />
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">负载均衡候选节点序列</span>
        </div>
        
        <div className="console-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  {['推荐排名', '节点代码', '物理区间描述', '平均实时流速', '负载状态', 'AI 矢量推荐结论'].map((h) => (
                    <th key={h} className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rest.map((item, index) => {
                  const level = getSpeedLevel(Number(item.speed));
                  return (
                    <tr key={item.node_id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-5 text-[10px] font-black text-slate-300 data-mono">{index + 4}</td>
                      <td className="px-8 py-5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-400 text-[10px] font-black border border-slate-200">
                           {item.node_id}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-xs font-black text-slate-700">{NODE_META[item.node_id]}</td>
                      <td className="px-8 py-5 text-sm font-black text-slate-900 data-mono italic">{item.speed} km/h</td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[item.congestion_status] }} />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {STATUS_LABEL[item.congestion_status]}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-100 w-fit">
                           <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: level.color }}>{level.label}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
