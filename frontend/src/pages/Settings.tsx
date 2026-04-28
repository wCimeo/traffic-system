import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  User, 
  Settings2, 
  Database, 
  Download, 
  Calendar, 
  Lock,
  ChevronRight,
  Monitor,
  CloudLightning,
  Check
} from 'lucide-react';
import api from '../api';

function ReportExport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [nodeId, setNodeId]       = useState('all');

  const NODE_OPTIONS = ['all','A1','B2','C3','D4','E5','F6','G7','H8','I9','J10'];

  const handleExport = () => {
    const params = new URLSearchParams();
    if (startDate) params.append('start', startDate);
    if (endDate)   params.append('end',   endDate);
    if (nodeId)    params.append('node_id', nodeId);
    const token = localStorage.getItem('token');
    window.open(`http://localhost:3001/api/report/export?${params.toString()}&token=${token}`);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">起始时间范围</label>
          <div className="relative">
             <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
             <input type="date" className="input-base pl-10 font-bold" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">结束时间范围</label>
          <div className="relative">
             <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
             <input type="date" className="input-base pl-10 font-bold" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">目标监测簇</label>
          <select className="input-base px-5 font-bold" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
            <option value="all">全量监控节点</option>
            {NODE_OPTIONS.slice(1).map(n => <option key={n} value={n}>节点单元: {n}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 pt-2">
        <button onClick={handleExport} className="btn-primary gap-2 shadow-lg shadow-slate-900/10">
          <Download className="h-4 w-4" />
          <span>导出历史 CSV 档案</span>
        </button>
        <button onClick={() => {}} className="btn-ghost gap-2 border border-slate-200">
          <Database className="h-4 w-4" />
          <span>导出 AI 训练集 (GCN)</span>
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const user = JSON.parse(localStorage.getItem('user') || '{"displayName": "管理员", "username": "admin_traffic"}');
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!pwForm.oldPassword || !pwForm.newPassword) {
      setPwMsg({ text: '请填写完整', ok: false }); return;
    }
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwMsg({ text: '两次密码不一致', ok: false }); return;
    }
    setPwLoading(true);
    try {
      await api.post('/api/auth/change-password', {
        oldPassword: pwForm.oldPassword,
        newPassword: pwForm.newPassword,
      });
      setPwMsg({ text: '安全授权凭证更新成功', ok: true });
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPwMsg({ text: '安全协议拦截：原凭证验证失败', ok: false });
    } finally {
      setTimeout(() => setPwLoading(false), 800);
    }
  };

  return (
    <div className="space-y-10 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">系统核心配置</h1>
          <p className="mt-2 text-slate-500 font-medium uppercase text-[10px] tracking-widest leading-relaxed">
            基础设施运行参数与安全授权体系管理
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Account & Details */}
        <div className="space-y-8">
           <div className="console-card bg-white p-8">
              <div className="flex items-center gap-3 mb-8">
                 <div className="h-10 w-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                    <User className="h-5 w-5" />
                 </div>
                 <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 italic">操作员授权凭证</h3>
              </div>
              <div className="space-y-4">
                 {[
                   { label: '账户识别名称', value: user.displayName, icon: Monitor },
                   { label: '系统唯一登录标识', value: user.username, icon: ShieldCheck },
                   { label: '安全协议分级', value: '全系统超级管理员 (ROOT)', icon: CloudLightning },
                 ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100 group transition-all hover:bg-white hover:border-slate-200">
                       <div className="flex items-center gap-4">
                          <item.icon className="h-4 w-4 text-slate-400 group-hover:text-brand-500" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</span>
                       </div>
                       <span className="text-sm font-black text-slate-900 italic">{item.value}</span>
                    </div>
                 ))}
              </div>
           </div>

           <div className="console-card bg-white p-8">
              <div className="flex items-center gap-3 mb-8">
                 <div className="h-10 w-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                    <Settings2 className="h-5 w-5" />
                 </div>
                 <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 italic">核心环境运行参数</h3>
              </div>
              <div className="space-y-0.5">
                 {[
                   { label: '系统内核版本', value: 'Traffic Matrix Engine v4.2' },
                   { label: '地理服务商 (API)', value: '高德地图企业级授权接口' },
                   { label: '地理覆盖核心区', value: '成都市高新核心区' },
                   { label: '系统同步频率', value: '300s / 混合标准周期' },
                   { label: '算法推理算力', value: 'LST-GCN / ResNet-Hybrid' },
                   { label: '链路加密标准', value: 'AES-256 GCM 硬件级加密' },
                 ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-4 border-b border-slate-50 last:border-none">
                       <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{item.label}</span>
                       <span className="text-[11px] font-bold text-slate-700 italic">{item.value}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Security & Reports */}
        <div className="space-y-8">
           <div className="console-card bg-white p-8">
              <div className="flex items-center gap-3 mb-8">
                 <div className="h-10 w-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                    <Lock className="h-5 w-5" />
                 </div>
                 <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 italic">安全授权协议更新</h3>
              </div>
              <div className="space-y-5">
                 {[
                   { label: '当前安全密钥', key: 'oldPassword', type: 'password', placeholder: '输入当前管理密钥' },
                   { label: '新授权矢量', key: 'newPassword', type: 'password', placeholder: '输入新管理密钥' },
                   { label: '矢量验证', key: 'confirm', type: 'password', placeholder: '再次确认新密钥' },
                 ].map((field) => (
                    <div key={field.key} className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{field.label}</label>
                       <input
                         type={field.type}
                         className="input-base"
                         placeholder={field.placeholder}
                         value={pwForm[field.key as keyof typeof pwForm]}
                         onChange={(e) => setPwForm({ ...pwForm, [field.key]: e.target.value })}
                       />
                    </div>
                 ))}
                 
                 <AnimatePresence>
                    {pwMsg && (
                       <motion.div 
                         initial={{ opacity: 0, x: -10 }} 
                         animate={{ opacity: 1, x: 0 }}
                         className={`p-4 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-3 ${pwMsg.ok ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}
                       >
                         {pwMsg.ok ? <Check className="h-4 w-4" /> : <div className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />}
                         {pwMsg.text}
                       </motion.div>
                    )}
                 </AnimatePresence>

                 <button
                   onClick={handleChangePassword}
                   disabled={pwLoading}
                   className="btn-primary w-full gap-2 !h-14 uppercase tracking-[0.2em] font-black shadow-xl shadow-slate-900/20"
                 >
                   {pwLoading ? '正在验证安全协议...' : '确认更新授权凭证'}
                   <ChevronRight className="h-4 w-4" />
                 </button>
              </div>
           </div>

           <div className="console-card bg-white p-8">
              <div className="flex items-center gap-3 mb-8">
                 <div className="h-10 w-10 rounded-2xl bg-brand-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
                    <Download className="h-5 w-5" />
                 </div>
                 <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 italic">历史档案数据导出</h3>
              </div>
              <ReportExport />
           </div>
        </div>
      </div>
    </div>
  );
}
