import { useState } from 'react';
import api from '../api';

export default function Settings() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
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
    if (pwForm.newPassword.length < 6) {
      setPwMsg({ text: '新密码不能少于6位', ok: false }); return;
    }
    setPwLoading(true);
    try {
      await api.post('/api/auth/change-password', {
        oldPassword: pwForm.oldPassword,
        newPassword: pwForm.newPassword,
      });
      setPwMsg({ text: '密码修改成功', ok: true });
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (err: any) {
      setPwMsg({ text: err.response?.data?.error || '修改失败', ok: false });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-800 mb-6">系统设置</h1>

      {/* 账号信息 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-gray-700 mb-4">账号信息</h2>
        <div className="space-y-3">
          {[
            { label: '显示名称', value: user.displayName },
            { label: '用户名', value: user.username },
            { label: '角色', value: '超级管理员' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-400">{item.label}</span>
              <span className="text-sm font-medium text-gray-700">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 修改密码 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold text-gray-700 mb-4">修改密码</h2>
        <div className="space-y-3">
          {[
            { label: '当前密码', key: 'oldPassword', type: 'password' },
            { label: '新密码', key: 'newPassword', type: 'password' },
            { label: '确认新密码', key: 'confirm', type: 'password' },
          ].map((field) => (
            <div key={field.key}>
              <label className="block text-sm text-gray-400 mb-1">{field.label}</label>
              <input
                type={field.type}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 transition"
                value={pwForm[field.key as keyof typeof pwForm]}
                onChange={(e) => setPwForm({ ...pwForm, [field.key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        {pwMsg && (
          <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${
            pwMsg.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
          }`}>
            {pwMsg.text}
          </div>
        )}

        <button
          onClick={handleChangePassword}
          disabled={pwLoading}
          className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-5 py-2 rounded-lg transition disabled:opacity-60"
        >
          {pwLoading ? '提交中...' : '确认修改'}
        </button>
      </div>

      {/* 系统信息 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">系统信息</h2>
        <div className="space-y-2">
          {[
            { label: '系统名称', value: '智能交通流量监控与预测系统' },
            { label: '数据来源', value: '高德地图交通API' },
            { label: '监控路口', value: '成都天府新区 10个核心路口' },
            { label: '采集频率', value: '每60秒采集一次' },
            { label: '预测模型', value: 'LST-GCN 时空图卷积网络' },
            { label: '后端服务', value: 'Express · localhost:3001' },
            { label: '推理服务', value: 'Flask · localhost:5001' },
          ].map((item) => (
            <div key={item.label}
              className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-400">{item.label}</span>
              <span className="text-sm text-gray-600">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}