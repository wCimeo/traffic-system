import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  KeyRound,
  Lock,
  MessageSquareText,
  Phone,
  Radio,
  RefreshCw,
  ShieldCheck,
  User,
  Zap,
} from 'lucide-react';
import api from '../api';

type LoginMode = 'password' | 'phone' | 'register';

type CaptchaState = {
  captchaId: string;
  svg: string;
};

export default function Login() {
  const [mode, setMode] = useState<LoginMode>('password');
  const [username, setUsername] = useState('admin_traffic');
  const [password, setPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaData, setCaptchaData] = useState<CaptchaState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const navigate = useNavigate();

  const loadCaptcha = async () => {
    const res = await api.get('/api/auth/captcha');
    setCaptchaData({ captchaId: res.data.captchaId, svg: res.data.svg });
    setCaptcha('');
  };

  useEffect(() => {
    loadCaptcha().catch(() => setError('图形验证码加载失败，请检查后端服务'));
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const persistLogin = (data: any) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    navigate(data.needSetPassword ? '/settings?section=password' : '/dashboard');
  };

  const handlePasswordLogin = async () => {
    if (!username || !password || !captcha) {
      setError('请填写账号、密码和图形验证码');
      return;
    }
    if (!captchaData) return;

    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('/api/auth/login', {
        username,
        password,
        captcha,
        captchaId: captchaData.captchaId,
      });
      persistLogin(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败，请稍后重试');
      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleSendSms = async () => {
    if (!phone || !captcha) {
      setError('请先填写手机号和图形验证码');
      return;
    }
    if (!captchaData) return;

    setSendingSms(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('/api/auth/sms/send', {
        phone,
        captcha,
        captchaId: captchaData.captchaId,
      });
      setNotice(res.data.message || '验证码已发送');
      setCountdown(60);
      await loadCaptcha();
    } catch (err: any) {
      setError(err.response?.data?.error || '验证码发送失败');
      await loadCaptcha();
    } finally {
      setSendingSms(false);
    }
  };

  const handlePhoneLogin = async () => {
    if (!phone || !smsCode) {
      setError('请填写手机号和短信验证码');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('/api/auth/phone-login', { phone, smsCode });
      persistLogin(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerUsername || !registerPassword || !registerConfirm || !captcha) {
      setError('请填写用户名、密码、确认密码和图形验证码');
      return;
    }
    if (registerPassword !== registerConfirm) {
      setError('两次输入的密码不一致');
      return;
    }
    if (!captchaData) return;

    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('/api/auth/register', {
        username: registerUsername,
        password: registerPassword,
        confirmPassword: registerConfirm,
        phone: registerPhone,
        captcha,
        captchaId: captchaData.captchaId,
      });
      persistLogin(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '注册失败，请稍后重试');
      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    if (mode === 'password') {
      handlePasswordLogin();
    } else if (mode === 'phone') {
      handlePhoneLogin();
    } else {
      handleRegister();
    }
  };

  return (
    <div className="flex min-h-screen w-screen overflow-hidden bg-slate-50 font-sans">
      <div className="relative hidden w-1/2 flex-col overflow-hidden bg-slate-900 p-20 lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute right-20 top-20 h-96 w-96 rounded-full bg-brand-500 blur-[120px]" />
          <div className="absolute bottom-20 left-20 h-64 w-64 rounded-full bg-emerald-400 opacity-40 blur-[100px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10"
        >
          <div className="mb-16 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/20">
              <Radio className="h-6 w-6 stroke-[2.5px]" />
            </div>
            <span className="text-xl font-black uppercase tracking-tighter text-white">Traffic Matrix</span>
          </div>

          <h1 className="mb-8 text-6xl font-black leading-[0.95] tracking-tight text-white">
            安全身份认证
            <br />
            <span className="text-brand-500">统一入口</span>
          </h1>

          <p className="mb-12 max-w-md text-lg font-medium leading-relaxed text-slate-400">
            支持账号密码与手机验证码登录，图形验证码和 7 天免密凭证共同保护后台控制台。
          </p>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: ShieldCheck, label: '图形校验', desc: 'Captcha' },
              { icon: MessageSquareText, label: '短信模拟', desc: 'Dev SMS' },
              { icon: KeyRound, label: 'BCrypt', desc: 'Password Hash' },
              { icon: Zap, label: '7 天免密', desc: 'Session Token' },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="mb-2 flex items-center gap-2">
                  <item.icon className="h-3 w-3 text-brand-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.label}</span>
                </div>
                <div className="text-sm font-black uppercase tracking-tight text-white">{item.desc}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-white p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-3xl font-black tracking-tight text-slate-900">登录控制台</h2>
            <p className="mt-2 text-sm font-medium text-slate-400">请选择一种身份验证方式</p>
          </div>

          <div className="mb-8 grid grid-cols-3 rounded-2xl bg-slate-100 p-1">
            {[
              { key: 'password' as LoginMode, label: '账号密码', icon: Lock },
              { key: 'phone' as LoginMode, label: '手机验证码', icon: Phone },
              { key: 'register' as LoginMode, label: '注册账号', icon: User },
            ].map((item) => {
              const active = mode === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setMode(item.key);
                    setError('');
                    setNotice('');
                  }}
                  className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-black transition-all ${
                    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-5">
            {mode === 'password' ? (
              <>
                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">用户名 / 手机号</label>
                  <div className="group relative">
                    <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500" />
                    <input
                      className="input-base !h-14 border border-slate-100 bg-slate-50 pl-12"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="请输入用户名或手机号"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">登录密码</label>
                  <div className="group relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500" />
                    <input
                      type="password"
                      className="input-base !h-14 border border-slate-100 bg-slate-50 pl-12"
                      placeholder="请输入密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                    />
                  </div>
                </div>
              </>
            ) : mode === 'phone' ? (
              <>
                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">手机号</label>
                  <div className="group relative">
                    <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500" />
                    <input
                      className="input-base !h-14 border border-slate-100 bg-slate-50 pl-12"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="请输入 11 位手机号"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">用户名</label>
                  <div className="group relative">
                    <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500" />
                    <input
                      className="input-base !h-14 border border-slate-100 bg-slate-50 pl-12"
                      value={registerUsername}
                      onChange={(e) => setRegisterUsername(e.target.value)}
                      placeholder="4-32 位字母、数字或下划线"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">手机号（可选）</label>
                  <div className="group relative">
                    <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500" />
                    <input
                      className="input-base !h-14 border border-slate-100 bg-slate-50 pl-12"
                      value={registerPhone}
                      onChange={(e) => setRegisterPhone(e.target.value)}
                      placeholder="用于后续验证码登录，可稍后绑定"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">密码</label>
                    <div className="group relative">
                      <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500" />
                      <input
                        type="password"
                        className="input-base !h-14 border border-slate-100 bg-slate-50 pl-12"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        placeholder="至少 6 位"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">确认密码</label>
                    <input
                      type="password"
                      className="input-base !h-14 border border-slate-100 bg-slate-50"
                      value={registerConfirm}
                      onChange={(e) => setRegisterConfirm(e.target.value)}
                      placeholder="再次输入"
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">图形验证码</label>
              <div className="flex gap-3">
                <input
                  className="input-base !h-14 flex-1 border border-slate-100 bg-slate-50"
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                  placeholder="请输入验证码"
                />
                <button
                  type="button"
                  onClick={() => loadCaptcha()}
                  className="flex h-14 w-36 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                  title="刷新验证码"
                >
                  {captchaData ? (
                    <span dangerouslySetInnerHTML={{ __html: captchaData.svg }} />
                  ) : (
                    <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
                  )}
                </button>
              </div>
            </div>

            {mode === 'phone' && (
              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">短信验证码</label>
                <div className="flex gap-3">
                  <input
                    className="input-base !h-14 flex-1 border border-slate-100 bg-slate-50"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                    placeholder="6 位验证码"
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                  />
                  <button
                    type="button"
                    onClick={handleSendSms}
                    disabled={sendingSms || countdown > 0}
                    className="btn-ghost h-14 w-32 shrink-0 disabled:pointer-events-none disabled:opacity-60"
                  >
                    {countdown > 0 ? `${countdown}s` : sendingSms ? '发送中' : '获取验证码'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-600">{error}</div>
            )}
            {notice && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                {notice}
              </div>
            )}

            <button
              onClick={submit}
              disabled={loading}
              className="btn-primary !h-14 w-full gap-3 shadow-2xl shadow-slate-900/20"
            >
              <span className="font-black uppercase tracking-widest">
                {loading ? '正在验证...' : mode === 'password' ? '账号密码登录' : mode === 'phone' ? '手机验证码登录 / 注册' : '创建账号并登录'}
              </span>
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
