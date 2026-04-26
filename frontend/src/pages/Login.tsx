import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Login() {
  const [username, setUsername] = useState('admin_traffic');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!password) { setError('请输入密码'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/login', { username, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 50%, #e0f2f1 100%)' }}>
      <div className="flex w-[900px] gap-6">

        {/* 左侧介绍卡片 */}
        <div className="flex-1 bg-white rounded-2xl p-10 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600 text-sm mb-6">
            <span>🛡</span>
            <span>超级管理员登录入口</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 leading-tight mb-6">
            基于大数据分析的智能交通流量监控与预测系统
          </h1>
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: '实时监控', desc: '高德API每分钟采集成都10个核心路口真实流量数据' },
              { title: '智能预测', desc: 'LST-GCN时空图卷积网络，预测未来路口车速趋势' },
              { title: '事件管理', desc: '突发事件实时录入、跟踪与状态更新' },
              { title: '路线推荐', desc: '基于当前拥堵状态的智能路线优先级推荐' },
            ].map((item) => (
              <div key={item.title} className="bg-gray-50 rounded-xl p-4">
                <div className="font-semibold text-gray-700 mb-1">{item.title}</div>
                <div className="text-sm text-gray-400">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧登录卡片 */}
        <div className="w-[340px] bg-white rounded-2xl p-8 shadow-sm flex flex-col justify-center">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mb-6">
            <span className="text-white text-xl">🔒</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">登录系统</h2>
          <p className="text-sm text-gray-400 mb-8">请输入超级管理员账号信息后进入控制台。</p>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">用户名</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-400 transition"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm text-gray-600 mb-1">密码</label>
            <input
              type="password"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-400 transition"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          {error && (
            <div className="mb-4 text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg py-3 text-sm font-medium transition disabled:opacity-60"
          >
            {loading ? '登录中...' : '→ 进入系统'}
          </button>
        </div>
      </div>
    </div>
  );
}