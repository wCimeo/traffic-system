import { useState } from 'react';
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
    // 直接跳转下载，带token写在query里（简单方案）
    window.open(
      `http://localhost:3001/api/report/export?${params.toString()}&token=${token}`
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">开始时间</label>
          <input type="datetime-local"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">结束时间</label>
          <input type="datetime-local"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">路口筛选</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}>
            <option value="all">全部路口</option>
            {NODE_OPTIONS.slice(1).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <button
        onClick={handleExport}
        className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-5 py-2 rounded-lg transition">
        导出 CSV
      </button>
    </div>
  );
}

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
    <div className="console-page console-page-narrow">
      <div className="page-head">
        <div>
          <h2 className="console-title">系统设置</h2>
          <p className="console-subtitle">管理当前账号、安全凭据与系统基础运行信息。</p>
        </div>
      </div>

      {/* 账号信息 */}
      <div className="console-card">
        <div className="console-card-header">
          <h3 className="console-card-title">账号信息</h3>
        </div>
        <div className="console-card-body">
          <div className="kv-list">
          {[
            { label: '显示名称', value: user.displayName },
            { label: '用户名', value: user.username },
            { label: '角色', value: '超级管理员' },
          ].map((item) => (
            <div key={item.label} className="kv-row">
              <span className="kv-label">{item.label}</span>
              <span className="kv-value">{item.value}</span>
            </div>
          ))}
          </div>
        </div>
      </div>

      {/* 修改密码 */}
      <div className="console-card">
        <div className="console-card-header">
          <h3 className="console-card-title">修改密码</h3>
        </div>
        <div className="console-card-body">
        <div className="form-grid">
          {[
            { label: '当前密码', key: 'oldPassword', type: 'password' },
            { label: '新密码', key: 'newPassword', type: 'password' },
            { label: '确认新密码', key: 'confirm', type: 'password' },
          ].map((field) => (
            <div key={field.key}>
              <label className="field-label">{field.label}</label>
              <input
                type={field.type}
                className="console-input"
                value={pwForm[field.key as keyof typeof pwForm]}
                onChange={(e) => setPwForm({ ...pwForm, [field.key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        {pwMsg && (
          <div className={`alert-msg ${pwMsg.ok ? 'alert-ok' : 'alert-error'}`}>
            {pwMsg.text}
          </div>
        )}

        <button
          onClick={handleChangePassword}
          disabled={pwLoading}
          className="primary-btn mt-4"
        >
          {pwLoading ? '提交中...' : '确认修改'}
        </button>
        </div>
      </div>

      {/* 系统信息 */}
      <div className="console-card">
        <div className="console-card-header">
          <h3 className="console-card-title">系统信息</h3>
        </div>
        <div className="console-card-body">
          <div className="kv-list">
          {[
            { label: '系统名称', value: '智能交通流量监控与预测系统' },
            { label: '数据来源', value: '高德地图交通API' },
            { label: '监控路口', value: '成都天府新区 10个核心路口' },
            { label: '采集频率', value: '每60秒采集一次' },
            { label: '预测模型', value: 'LST-GCN 时空图卷积网络' },
            { label: '后端服务', value: 'Express · localhost:3001' },
            { label: '推理服务', value: 'Flask · localhost:5001' },
          ].map((item) => (
            <div key={item.label} className="kv-row">
              <span className="kv-label">{item.label}</span>
              <span className="kv-value">{item.value}</span>
            </div>
          ))}
          </div>
        </div>
      </div>

      {/* 报表导出 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mt-6">
        <h2 className="font-semibold text-gray-700 mb-4">报表导出</h2>
        <ReportExport />
      </div>
    </div>
  );
}
