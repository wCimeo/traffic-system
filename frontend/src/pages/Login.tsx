import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertTriangle, ArrowRight, Brain, Lock, Mail, Map, Navigation, RefreshCw, User } from 'lucide-react';
import api from '../api';
import { useToast } from '../components/ToastProvider';
import trafficIcon from '../assets/traffic.png';

type LoginMode = 'password' | 'email' | 'register';
type CaptchaState = { captchaId: string; svg: string; expiresIn?: number };

export default function Login() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>('password');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaData, setCaptchaData] = useState<CaptchaState | null>(null);

  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [captchaCountdown, setCaptchaCountdown] = useState(60);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const captchaLoadingRef = useRef(false);
  const captchaRetryTimerRef = useRef<number | null>(null);

  const isRegisterWithEmail = mode === 'register' && email.trim().length > 0;
  const submitLabel = useMemo(() => {
    if (loading) return '正在验证...';
    if (mode === 'register') return '创建账号并登录';
    if (mode === 'email') return '邮箱验证码登录';
    return '账号密码登录';
  }, [loading, mode]);

  const persistLogin = (data: any) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    navigate(data.needSetPassword ? '/settings?section=password' : '/dashboard');
  };

  const loadCaptcha = useCallback(async (options: { silent?: boolean; retryOnRateLimit?: boolean } = {}) => {
    if (captchaLoadingRef.current) return;
    captchaLoadingRef.current = true;
    if (captchaRetryTimerRef.current) {
      window.clearTimeout(captchaRetryTimerRef.current);
      captchaRetryTimerRef.current = null;
    }

    try {
      const res = await api.get('/api/auth/captcha');
      setCaptchaData({ captchaId: res.data.captchaId, svg: res.data.svg, expiresIn: res.data.expiresIn });
      setCaptcha('');
      setCaptchaCountdown(60);
    } catch (err: any) {
      if (err?.response?.status === 429 && options.retryOnRateLimit !== false) {
        captchaRetryTimerRef.current = window.setTimeout(() => {
          loadCaptcha({ silent: options.silent, retryOnRateLimit: false }).catch(() => null);
        }, 1200);
        if (!options.silent) {
          setError(err.response?.data?.error || '验证码刷新过于频繁，请稍后再试');
        }
        return;
      }
      if (!options.silent) {
        setError(err?.response?.data?.error || '图形验证码加载失败，请检查后端服务');
      }
      throw err;
    } finally {
      captchaLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadCaptcha({ silent: true }).catch(() => setError('图形验证码加载失败，请检查后端服务'));
    return () => {
      if (captchaRetryTimerRef.current) {
        window.clearTimeout(captchaRetryTimerRef.current);
      }
    };
  }, [loadCaptcha]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (captchaCountdown <= 0) {
      loadCaptcha({ silent: true }).catch(() => null);
      return;
    }
    const t = window.setTimeout(() => setCaptchaCountdown((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [captchaCountdown]);

  const sendEmailCode = async () => {
    if (!email.trim()) return setError('请先填写邮箱地址');
    if (!captcha.trim()) return setError('请先填写图形验证码，再获取邮箱验证码');
    if (!captchaData) return;
    setSendingEmail(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('/api/auth/email/send', {
        email: email.trim(),
        captcha: captcha.trim(),
        captchaId: captchaData.captchaId,
      });
      setNotice(res.data.message || '验证码已发送');
      showToast(res.data.message || '验证码已发送', 'success');
      setCountdown(60);
    } catch (err: any) {
      const msg = err.response?.data?.error || '验证码发送失败';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleRegister = async () => {
    if (!username.trim() || !registerPassword || !registerConfirm || !captcha.trim()) {
      return setError('请填写用户名、密码、确认密码和图形验证码');
    }
    if (registerPassword !== registerConfirm) return setError('两次输入的密码不一致');
    if (isRegisterWithEmail && !emailCode.trim()) return setError('已填写邮箱，请先填写邮箱验证码');
    if (!captchaData) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('/api/auth/register', {
        username: username.trim(),
        password: registerPassword,
        confirmPassword: registerConfirm,
        email: email.trim(),
        emailCode: emailCode.trim(),
        captcha: captcha.trim(),
        captchaId: captchaData.captchaId,
      });
      persistLogin(res.data);
      showToast('注册并登录成功', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.error || '注册失败，请稍后重试';
      setError(msg);
      showToast(msg, 'error');
      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!username.trim() || !password || !captcha.trim()) return setError('请填写用户名、密码和图形验证码');
    if (!captchaData) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('/api/auth/login', {
        username: username.trim(),
        password,
        captcha: captcha.trim(),
        captchaId: captchaData.captchaId,
      });
      persistLogin(res.data);
      showToast('登录成功', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.error || '登录失败，请稍后重试';
      setError(msg);
      showToast(msg, 'error');
      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!email.trim() || !captcha.trim() || !emailCode.trim()) return setError('请填写邮箱、图形验证码和邮箱验证码');
    if (!captchaData) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('/api/auth/email-login', { email: email.trim(), emailCode: emailCode.trim() });
      persistLogin(res.data);
      showToast('登录成功', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.error || '登录失败，请稍后重试';
      setError(msg);
      showToast(msg, 'error');
      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const submit = () => (mode === 'register' ? handleRegister() : mode === 'email' ? handleEmailLogin() : handlePasswordLogin());

  return (
    <div className="flex min-h-screen w-screen overflow-hidden bg-slate-50 font-sans">
      <div className="relative hidden w-1/2 flex-col overflow-hidden bg-slate-900 p-20 lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute right-20 top-20 h-96 w-96 rounded-full bg-brand-500 blur-[120px]" />
          <div className="absolute bottom-20 left-20 h-64 w-64 rounded-full bg-emerald-400 opacity-40 blur-[100px]" />
        </div>
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} className="relative z-10">
          <div className="mb-16 flex items-center gap-3">
            <img src={trafficIcon} alt="Logo" className="h-10 w-10 rounded-xl shadow-lg" />
            <span className="text-3xl font-black uppercase tracking-tighter text-white">安全身份认证</span>
          </div>
          <h1 className="mb-55  text-5xl font-black leading-[0.95] tracking-tight text-white">智能交通流量监控与预测系统</h1>
          <div className="grid grid-cols-2 gap-8">
            {[{ icon: Brain, label: 'AI预测', desc: 'LST-GCN模型' }, { icon: Map, label: '实时路网', desc: '动态可视化' }, { icon: AlertTriangle, label: '事件预警', desc: '合作响应' }, { icon: Navigation, label: '智能路径', desc: '多策略推荐' }].map((item) => (
              <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="mb-2 flex items-center gap-2">
                  <item.icon className="h-3 w-3 text-white" />
                  <span className="text-sm font-black uppercase tracking-widest text-white">{item.label}</span>
                </div>
                <div className="text-xs font-medium text-slate-300">{item.desc}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-white p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-3xl font-black tracking-tight text-slate-900">登录控制台</h2>
          </div>

          {mode !== 'register' && (
            <div className="mb-8 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
              {[{ key: 'password' as LoginMode, label: '账号密码', icon: Lock }, { key: 'email' as LoginMode, label: '邮箱验证码', icon: Mail }].map((item) => {
                const active = mode === item.key;
                return (
                  <button key={item.key} type="button" onClick={() => { setMode(item.key); setError(''); setNotice(''); }} className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-black transition-all ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-5">
            {mode !== 'email' && (
              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">用户名</label>
                <div className="group relative">
                  <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500" />
                  <input className="input-base !h-14 border border-slate-100 bg-slate-50 pl-12" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="4-32 位字母、数字或下划线" />
                </div>
              </div>
            )}
            {(mode === 'register' || mode === 'email') && (
              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">邮箱{mode === 'register' ? '（选填）' : ''}</label>
                <div className="group relative">
                  <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500" />
                  <input className="input-base !h-14 border border-slate-100 bg-slate-50 pl-12" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="请输入邮箱地址" />
                </div>
              </div>
            )}
            {mode !== 'email' && (
              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">{mode === 'register' ? '密码' : '登录密码'}</label>
                <div className="group relative">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500" />
                  <input type="password" className="input-base !h-14 border border-slate-100 bg-slate-50 pl-12" value={mode === 'register' ? registerPassword : password} onChange={(e) => (mode === 'register' ? setRegisterPassword(e.target.value) : setPassword(e.target.value))} placeholder="至少 6 位密码" />
                </div>
              </div>
            )}
            {mode === 'register' && (
              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">确认密码</label>
                <input type="password" className="input-base !h-14 border border-slate-100 bg-slate-50" value={registerConfirm} onChange={(e) => setRegisterConfirm(e.target.value)} placeholder="再次输入密码" />
              </div>
            )}

            <div className="space-y-2">
              <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">图形验证码</label>
              <div className="flex gap-3">
                <input className="input-base !h-14 flex-1 border border-slate-100 bg-slate-50" value={captcha} onChange={(e) => setCaptcha(e.target.value)} placeholder="请输入图形验证码" />
                <button type="button" onClick={() => loadCaptcha().catch(() => null)} className="flex h-14 w-36 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" title="刷新验证码">
                  {captchaData ? <span dangerouslySetInnerHTML={{ __html: captchaData.svg }} /> : <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />}
                </button>
              </div>
              <p className="text-xs text-slate-400">图形验证码 {captchaCountdown}s 后自动刷新。</p>
            </div>

            {(mode === 'email' || isRegisterWithEmail) && (
              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">邮箱验证码</label>
                <div className="flex gap-3">
                  <input className="input-base !h-14 flex-1 border border-slate-100 bg-slate-50" value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="6 位验证码" />
                  <button type="button" onClick={sendEmailCode} disabled={sendingEmail || countdown > 0} className="btn-ghost h-14 w-32 shrink-0 disabled:pointer-events-none disabled:opacity-60">
                    {countdown > 0 ? `${countdown}s` : sendingEmail ? '发送中' : '获取验证码'}
                  </button>
                </div>
                <p className="text-xs text-slate-400">邮箱验证码 60 秒内有效。</p>
              </div>
            )}

            {error && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-600">{error}</div>}
            {notice && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{notice}</div>}

            <button onClick={submit} disabled={loading} className="btn-primary !h-14 w-full gap-3 shadow-2xl shadow-slate-900/20">
              <span className="font-black uppercase tracking-widest">{submitLabel}</span>
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>

            {mode === 'register' ? (
              <p className="text-center text-xs text-slate-500">
                已有密码？
                <button type="button" className="ml-1 font-black text-brand-600" onClick={() => setMode('password')}>
                  点击直接登录
                </button>
              </p>
            ) : (
              <p className="text-center text-xs text-slate-500">
                没有账号？
                <button type="button" className="ml-1 font-black text-brand-600" onClick={() => setMode('register')}>
                  点击注册账号
                </button>
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
