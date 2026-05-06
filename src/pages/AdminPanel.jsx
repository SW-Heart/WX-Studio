import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, Zap, ImageIcon, Plus, Search, RefreshCw, Loader2, X, Copy, Check, AlertCircle, Shield, ChevronLeft, ChevronRight } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// 仪表盘统计卡片
const StatCard = ({ icon, label, value, sub, gradient }) => (
  <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-5 group hover:border-white/20 transition-all`}>
    <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${gradient} opacity-10 group-hover:opacity-20 transition-opacity`} />
    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center mb-3`}>
      {icon}
    </div>
    <p className="text-2xl font-bold text-white">{value ?? '-'}</p>
    <p className="text-xs text-white/40 mt-1">{label}</p>
    {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
  </div>
);

// 创建用户弹窗
const CreateUserModal = ({ isOpen, onClose, token, lang, onCreated }) => {
  const [quota, setQuota] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ initial_quota: quota })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '创建失败');
      setResult(data);
      onCreated?.();
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  const copyInfo = () => {
    if (!result) return;
    navigator.clipboard.writeText(`账号: ${result.username}\n密码: ${result.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">{lang === 'zh' ? '创建用户' : 'Create User'}</h3>
          <button onClick={() => { onClose(); setResult(null); }} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
              <Check size={32} className="mx-auto mb-2 text-green-400" />
              <p className="text-green-400 font-bold mb-4">{lang === 'zh' ? '用户创建成功！' : 'User Created!'}</p>
              <div className="bg-black/40 rounded-lg p-4 text-left space-y-2">
                <div className="flex justify-between"><span className="text-white/40 text-sm">{lang === 'zh' ? '账号' : 'Username'}</span><span className="text-white font-mono text-sm">{result.username}</span></div>
                <div className="flex justify-between"><span className="text-white/40 text-sm">{lang === 'zh' ? '密码' : 'Password'}</span><span className="text-white font-mono text-sm">{result.password}</span></div>
                <div className="flex justify-between"><span className="text-white/40 text-sm">{lang === 'zh' ? '积分' : 'Credits'}</span><span className="text-[#FF8A3D] font-mono text-sm">{result.quota}</span></div>
              </div>
            </div>
            <button onClick={copyInfo} className="w-full py-3 rounded-xl bg-[#FF8A3D] text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
              {copied ? <><Check size={16} />{lang === 'zh' ? '已复制' : 'Copied'}</> : <><Copy size={16} />{lang === 'zh' ? '复制账号密码' : 'Copy Credentials'}</>}
            </button>
            <p className="text-[10px] text-red-400/60 text-center">⚠️ {lang === 'zh' ? '密码仅显示一次，请务必保存' : 'Password shown only once, save it now'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-white/40 mb-2 block">{lang === 'zh' ? '初始积分' : 'Initial Credits'}</label>
              <input type="number" value={quota} onChange={e => setQuota(parseInt(e.target.value) || 0)} min={0}
                className="w-full h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none"
              />
            </div>
            <p className="text-[10px] text-white/30">{lang === 'zh' ? '系统将自动生成随机账号和密码' : 'System will generate random username & password'}</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20">{lang === 'zh' ? '取消' : 'Cancel'}</button>
              <button onClick={handleCreate} disabled={loading} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {lang === 'zh' ? '创建' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 积分发放弹窗
const QuotaModal = ({ isOpen, onClose, token, lang, targetUser, onDone }) => {
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !targetUser) return null;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${targetUser}/quota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ amount, reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '操作失败');
      onDone?.();
      onClose();
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-1">{lang === 'zh' ? '积分管理' : 'Manage Credits'}</h3>
        <p className="text-xs text-white/40 mb-6">{lang === 'zh' ? '目标用户：' : 'User: '}<span className="text-[#FF8A3D]">{targetUser}</span></p>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/40 mb-2 block">{lang === 'zh' ? '积分数量（正数充值，负数扣除）' : 'Amount (positive=add, negative=deduct)'}</label>
            <input type="number" value={amount} onChange={e => setAmount(parseInt(e.target.value) || 0)}
              className="w-full h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 mb-2 block">{lang === 'zh' ? '备注原因' : 'Reason'}</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder={lang === 'zh' ? '选填' : 'Optional'}
              className="w-full h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none placeholder:text-white/20"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20">{lang === 'zh' ? '取消' : 'Cancel'}</button>
            <button onClick={handleSubmit} disabled={loading} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              {lang === 'zh' ? '确认' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 主管理后台
const AdminPanel = ({ token, lang }) => {
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [quotaTarget, setQuotaTarget] = useState(null);

  const pageSize = 15;

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/dashboard`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setDashboard(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page: page.toString(), page_size: pageSize.toString() });
      const res = await fetch(`${API_BASE_URL}/admin/users?${params}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setTotalUsers(data.total);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const refreshAll = () => { fetchDashboard(); fetchUsers(); };

  useEffect(() => { if (token) refreshAll(); }, [token]);
  useEffect(() => { if (token) fetchUsers(); }, [page, search]);

  const handleResetPwd = async (username) => {
    const pwd = prompt(lang === 'zh' ? `为 ${username} 设置新密码：` : `Set new password for ${username}:`);
    if (!pwd) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${username}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ new_password: pwd })
      });
      if (res.ok) { alert(lang === 'zh' ? '密码已重置' : 'Password reset'); }
      else { const d = await res.json(); alert(d.detail); }
    } catch (err) { alert(err.message); }
  };

  const handleToggleStatus = async (username) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${username}/status`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchUsers();
      else { const d = await res.json(); alert(d.detail); }
    } catch (err) { alert(err.message); }
  };

  const totalPages = Math.ceil(totalUsers / pageSize);
  const formatTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
      {/* 动态光晕 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-[#FF8A3D]/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-[#8B5CF6]/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF8A3D] to-[#E65100] flex items-center justify-center">
                <Shield size={22} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">{lang === 'zh' ? '管理后台' : 'Admin Panel'}</h1>
            </div>
            <p className="text-sm text-white/40 ml-[52px]">{lang === 'zh' ? '用户管理 · 积分运营 · 数据统计' : 'User Management · Credits · Analytics'}</p>
          </div>
          <button onClick={refreshAll} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/10">
            <RefreshCw size={18} />
          </button>
        </div>

        {/* 仪表盘 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<Users size={20} className="text-white" />} label={lang === 'zh' ? '总用户数' : 'Total Users'} value={dashboard?.total_users} sub={`${lang === 'zh' ? '今日新增' : 'Today'}: +${dashboard?.new_users_today ?? 0}`} gradient="from-blue-500 to-blue-700" />
          <StatCard icon={<ImageIcon size={20} className="text-white" />} label={lang === 'zh' ? '总创作数' : 'Total Creations'} value={dashboard?.total_creations} gradient="from-purple-500 to-purple-700" />
          <StatCard icon={<Zap size={20} className="text-white" />} label={lang === 'zh' ? '积分池总量' : 'Total Credits'} value={dashboard?.total_quota} gradient="from-orange-500 to-orange-700" />
          <StatCard icon={<TrendingUp size={20} className="text-white" />} label={lang === 'zh' ? '近7天充值' : '7d Added'} value={`+${dashboard?.recent_quota_added ?? 0}`} sub={`${lang === 'zh' ? '消耗' : 'Used'}: -${dashboard?.recent_quota_spent ?? 0}`} gradient="from-green-500 to-green-700" />
        </div>

        {/* 用户管理 */}
        <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
          {/* 工具栏 */}
          <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users size={18} className="text-[#FF8A3D]" />
              {lang === 'zh' ? '用户管理' : 'User Management'}
              <span className="text-xs text-white/30 font-normal ml-1">({totalUsers})</span>
            </h2>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder={lang === 'zh' ? '搜索用户...' : 'Search...'}
                  className="h-9 bg-[#0a0a0a] border border-white/10 rounded-lg pl-9 pr-4 text-xs text-white focus:border-[#FF8A3D] focus:outline-none w-full sm:w-48"
                />
              </div>
              <button onClick={() => setShowCreate(true)} className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90 whitespace-nowrap">
                <Plus size={14} /> {lang === 'zh' ? '创建用户' : 'New User'}
              </button>
            </div>
          </div>

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-xs border-b border-white/5">
                  <th className="text-left py-3 px-4 font-medium">{lang === 'zh' ? '用户名' : 'Username'}</th>
                  <th className="text-left py-3 px-4 font-medium">{lang === 'zh' ? '角色' : 'Role'}</th>
                  <th className="text-right py-3 px-4 font-medium">{lang === 'zh' ? '积分' : 'Credits'}</th>
                  <th className="text-right py-3 px-4 font-medium">{lang === 'zh' ? '创作' : 'Works'}</th>
                  <th className="text-left py-3 px-4 font-medium">{lang === 'zh' ? '创建时间' : 'Created'}</th>
                  <th className="text-left py-3 px-4 font-medium">{lang === 'zh' ? '状态' : 'Status'}</th>
                  <th className="text-right py-3 px-4 font-medium">{lang === 'zh' ? '操作' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12"><Loader2 size={24} className="mx-auto animate-spin text-[#FF8A3D]" /></td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-white/30">{lang === 'zh' ? '暂无数据' : 'No data'}</td></tr>
                ) : users.map((u, i) => (
                  <tr key={u.username} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#FF8A3D]/20 to-[#E65100]/20 border border-white/10 flex items-center justify-center">
                          <span className="text-[9px] font-bold text-[#FF8A3D]">{u.username?.slice(0, 2)}</span>
                        </div>
                        <div>
                          <p className="text-white text-xs font-medium">{u.username}</p>
                          {u.phone && <p className="text-white/30 text-[10px]">{u.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-white/40'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-[#FF8A3D] font-mono text-xs font-bold">{u.quota}</span>
                    </td>
                    <td className="py-3 px-4 text-right text-white/50 text-xs">{u.creation_count}</td>
                    <td className="py-3 px-4 text-white/40 text-xs">{formatTime(u.created_at)}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${u.disabled ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                        {u.disabled ? (lang === 'zh' ? '已禁用' : 'Disabled') : (lang === 'zh' ? '正常' : 'Active')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setQuotaTarget(u.username)} className="px-2 py-1 text-[10px] rounded bg-[#FF8A3D]/10 text-[#FF8A3D] hover:bg-[#FF8A3D]/20 transition-colors" title={lang === 'zh' ? '充值积分' : 'Add Credits'}>
                          <Zap size={12} />
                        </button>
                        <button onClick={() => handleResetPwd(u.username)} className="px-2 py-1 text-[10px] rounded bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-colors" title={lang === 'zh' ? '重置密码' : 'Reset Password'}>
                          {lang === 'zh' ? '密码' : 'Pwd'}
                        </button>
                        {u.role !== 'admin' && (
                          <button onClick={() => handleToggleStatus(u.username)} className={`px-2 py-1 text-[10px] rounded transition-colors ${u.disabled ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}>
                            {u.disabled ? (lang === 'zh' ? '启用' : 'Enable') : (lang === 'zh' ? '禁用' : 'Ban')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-white/5 flex items-center justify-between">
              <p className="text-xs text-white/30">{lang === 'zh' ? `共 ${totalUsers} 条` : `${totalUsers} total`}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 disabled:opacity-30"><ChevronLeft size={14} /></button>
                <span className="text-xs text-white/50 px-2">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 disabled:opacity-30"><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 弹窗 */}
      <CreateUserModal isOpen={showCreate} onClose={() => setShowCreate(false)} token={token} lang={lang} onCreated={refreshAll} />
      <QuotaModal isOpen={!!quotaTarget} onClose={() => setQuotaTarget(null)} token={token} lang={lang} targetUser={quotaTarget} onDone={refreshAll} />
    </div>
  );
};

export default AdminPanel;
