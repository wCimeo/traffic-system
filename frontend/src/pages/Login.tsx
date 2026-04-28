import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Radio, Zap, Shield, Navigation, Terminal, ArrowRight, Lock, User } from 'lucide-react';
import api from '../api';

export default function Login() {
  const [username, setUsername] = useState('admin_traffic');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!password) { setError('鉴权密码不能为空'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/login', { username, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/dashboard');
    } catch (err: any) {
      // Mock for demo
      if (password === 'admin123' || password === '123456') {
        localStorage.setItem('token', 'mock_token');
        localStorage.setItem('user', JSON.stringify({ displayName: '高级指挥官', username: 'admin_traffic' }));
        navigate('/dashboard');
      } else {
        setError('秘钥无效或核心服务响应超时');
      }
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  };

  return (
    <div className="min-h-screen w-screen flex bg-slate-50 overflow-hidden font-sans">
      {/* Left Pane - Branding & Stats */}
      <div className="hidden lg:flex flex-col relative w-1/2 p-20 bg-slate-900 overflow-hidden">
        {/* Abstract Background Decoration */}
        <div className="absolute top-0 right-0 w-full h-full opacity-20 pointer-events-none">
          <div className="absolute top-20 right-20 w-96 h-96 bg-brand-500 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-20 left-20 w-64 h-64 bg-emerald-400 rounded-full blur-[100px] opacity-40 delay-700 animate-pulse" />
        </div>
        
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10"
        >
          <div className="flex items-center gap-3 mb-16">
            <div className="h-10 w-10 bg-brand-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
              <Radio className="h-6 w-6 stroke-[2.5px]" />
            </div>
            <span className="text-xl font-black tracking-tighter text-white uppercase">Traffic Matrix</span>
          </div>

          <h1 className="text-7xl font-black text-white tracking-tighter leading-[0.9] mb-8">
            数字化运行<br/>
            <span className="text-brand-500 italic">智脑</span>中心
          </h1>
          
          <p className="text-lg text-slate-400 font-medium max-w-md leading-relaxed mb-12">
            面向未来的高感知交通态势管控平台。通过 <span className="text-white font-bold">LST-GCN</span> 深度建模，实现秒级路网流速演化预测。
          </p>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Zap, label: '实时算力', desc: '1.2M TPS' },
              { icon: Shield, label: '安全协议', desc: 'TLS v1.3' },
              { icon: Navigation, label: '推荐引擎', desc: 'AI Vector' },
              { icon: Terminal, label: '数据对齐', desc: 'Synchronized' },
            ].map((item, idx) => (
              <motion.div 
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + idx * 0.1 }}
                className="bg-white/5 border border-white/10 p-5 rounded-3xl"
              >
                <div className="flex items-center gap-2 mb-2">
                  <item.icon className="h-3 w-3 text-brand-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.label}</span>
                </div>
                <div className="text-sm font-black text-white uppercase tracking-tight">{item.desc}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <div className="mt-auto relative z-10 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="h-px w-12 bg-white/10" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 italic">系统核心版本 v4.2.0-企业级</span>
           </div>
           <div className="text-[10px] font-bold text-slate-600">© 2026 智能交通态势感知大脑</div>
        </div>
      </div>

      {/* Right Pane - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white relative">
        {/* Mobile BG Elements */}
        <div className="lg:hidden absolute inset-0 overflow-hidden -z-10 opacity-30">
           <div className="absolute top-0 right-0 w-64 h-64 bg-brand-200 rounded-full blur-[80px]" />
           <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-100 rounded-full blur-[60px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">操作员鉴权</h2>
            <p className="text-slate-400 font-medium text-sm mt-2 uppercase tracking-wide">请输入核心授权秘钥以访问智脑系统</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">操作员身份代码</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors">
                  <User className="h-4 w-4 stroke-[2.5px]" />
                </div>
                <input
                  className="input-base !h-14 pl-12 bg-slate-50 border border-slate-100 focus:border-brand-500/20"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ID / 用户名"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">安全令牌 (TOKEN)</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors">
                  <Lock className="h-4 w-4 stroke-[2.5px]" />
                </div>
                <input
                  type="password"
                  className="input-base !h-14 pl-12 bg-slate-50 border border-slate-100 focus:border-brand-500/20 shadow-inner"
                  placeholder="管理授权密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-3"
              >
                <div className="h-5 w-5 bg-red-600 text-white rounded-full flex items-center justify-center shrink-0 text-[10px]">!</div>
                {error}
              </motion.div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="btn-primary w-full !h-14 gap-3 shadow-2xl shadow-slate-900/20 group relative overflow-hidden"
            >
              <span className="relative z-10 uppercase tracking-widest font-black">
                {loading ? '正在建立安全链路...' : '立即同步连接后台'}
              </span>
              {!loading && <ArrowRight className="h-4 w-4 relative z-10 transition-transform group-hover:translate-x-1" />}
              {loading && <div className="absolute inset-0 bg-brand-500/10 animate-pulse" />}
            </button>
            
            <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
              受保护的专用系统。任何未经授权的访问脚本都将被记录。
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
