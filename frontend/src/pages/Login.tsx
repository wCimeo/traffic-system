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
    <div className="login-page">
      <div className="login-grid">

        {/* 左侧介绍卡片 */}
        <div className="login-card login-intro">
          <div className="mb-7 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            <span>◆</span>
            <span>超级管理员登录入口</span>
          </div>
          <h1 className="mb-5 max-w-xl text-3xl font-black leading-tight tracking-tight text-slate-950 lg:text-4xl">
            基于大数据分析的智能交通流量监控与预测系统
          </h1>
          <p className="mb-8 max-w-xl text-sm leading-7 text-slate-500">
            面向城市路网运行态势监控、交通流量预测、突发事件管理与智能路线推荐的综合控制台。
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { title: '实时监控', desc: '高德API每分钟采集成都10个核心路口真实流量数据' },
              { title: '智能预测', desc: 'LST-GCN时空图卷积网络，预测未来路口车速趋势' },
              { title: '事件管理', desc: '突发事件实时录入、跟踪与状态更新' },
              { title: '路线推荐', desc: '基于当前拥堵状态的智能路线优先级推荐' },
            ].map((item) => (
              <div key={item.title} className="console-card p-4 shadow-none">
                <div className="mb-2 text-sm font-bold text-slate-800">{item.title}</div>
                <div className="text-sm leading-6 text-slate-500">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧登录卡片 */}
        <div className="login-card login-form">
          <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-200">
            <span className="text-base">◆</span>
          </div>
          <h2 className="mb-2 text-2xl font-black text-slate-950">登录系统</h2>
          <p className="mb-8 text-sm text-slate-400">请输入超级管理员账号信息后进入控制台。</p>

          <div className="mb-4">
            <label className="field-label">用户名</label>
            <input
              className="console-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="mb-5">
            <label className="field-label">密码</label>
            <input
              type="password"
              className="console-input"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          {error && (
            <div className="alert-msg alert-error mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="primary-btn w-full"
          >
            {loading ? '登录中...' : '→ 进入系统'}
          </button>
        </div>
      </div>
    </div>
  );
}
