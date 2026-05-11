import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Key, Plus, Copy, Check, Loader2, Trash2, EyeOff, Eye,
  RefreshCw, X, AlertCircle, Activity, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const authHeaders = (token, extra = {}) => ({ 'Authorization': `Bearer ${token}`, ...extra });
const fmtTime = (ts) => (ts ? new Date(ts * 1000).toLocaleString() : '—');

const Badge = ({ tone = 'default', children }) => {
  const m = {
    default: 'bg-white/5 text-white/50 border-white/10',
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    warn: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${m[tone]}`}>{children}</span>;
};

// ---------- Create Key Modal (Portal) ----------
const CreateKeyModal = ({ isOpen, onClose, token, models, onCreated }) => {
  const [name, setName] = useState('');
  const [allowAll, setAllowAll] = useState(true);
  const [allowed, setAllowed] = useState([]);
  const [quotaLimit, setQuotaLimit] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(true);

  useEffect(() => { if (!isOpen) { setName(''); setAllowAll(true); setAllowed([]); setQuotaLimit(''); setResult(null); setCopied(false); setShow(true); } }, [isOpen]);
  if (!isOpen) return null;

  const submit = async () => {
    setLoading(true);
    try {
      const body = { name: name.trim() || 'unnamed', allowed_models: allowAll ? [] : allowed, quota_limit: quotaLimit.trim() === '' ? null : parseInt(quotaLimit, 10) };
      const res = await fetch(`${API_BASE_URL}/api/keys`, { method: 'POST', headers: authHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '创建失败');
      setResult(data); onCreated?.();
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };
  const copy = () => { navigator.clipboard?.writeText(result?.key || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const toggleModel = (id) => setAllowed(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><Key size={18} className="text-[#FF8A3D]" /> 创建 API Key</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        {result ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3"><CheckCircle2 size={20} className="text-green-400" /><p className="text-green-400 font-bold">API Key 已生成</p></div>
              <div className="bg-black/40 rounded-lg p-3 font-mono text-xs text-white flex items-center gap-2">
                <code className="flex-1 break-all">{show ? result.key : '•'.repeat(48)}</code>
                <button onClick={() => setShow(s => !s)} className="text-white/40 hover:text-white p-1">{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                <button onClick={copy} className="text-white/40 hover:text-white p-1">{copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}</button>
              </div>
            </div>
            <p className="text-[11px] text-red-400/80 flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" />完整 Key 只显示这一次，请立即复制保存。关闭后无法再次查看。</p>
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-[#FF8A3D] text-white text-sm font-bold hover:opacity-90">我已保存</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div><label className="text-xs text-white/50 mb-1.5 block">名称</label><input value={name} onChange={e => setName(e.target.value)} placeholder="例如：个人项目 / SDK 测试" className="w-full h-10 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 text-sm text-white placeholder:text-white/25 focus:border-[#FF8A3D] focus:outline-none" /></div>
            <div>
              <div className="flex items-center justify-between mb-2"><label className="text-xs text-white/50">可用模型</label><label className="flex items-center gap-1.5 text-[11px] text-white/50"><input type="checkbox" checked={allowAll} onChange={e => setAllowAll(e.target.checked)} className="accent-[#FF8A3D]" />允许全部</label></div>
              {!allowAll && <div className="max-h-44 overflow-auto space-y-1.5 border border-white/10 rounded-lg p-2 bg-[#0a0a0a]">{models.map(m => <label key={m.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer"><input type="checkbox" checked={allowed.includes(m.id)} onChange={() => toggleModel(m.id)} className="accent-[#FF8A3D]" /><span className="text-xs text-white flex-1">{m.display_name || m.id}</span></label>)}</div>}
            </div>
            <div><label className="text-xs text-white/50 mb-1.5 block">积分上限（留空=不限）</label><input type="number" min={0} value={quotaLimit} onChange={e => setQuotaLimit(e.target.value)} placeholder="不限" className="w-full h-10 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 text-sm text-white focus:border-[#FF8A3D] focus:outline-none" /></div>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 text-white text-sm hover:bg-white/10">取消</button>
              <button onClick={submit} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2">{loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}生成</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// ---------- Logs Panel (Portal + Pagination) ----------
const PAGE_SIZE = 20;

const LogsPanel = ({ token, keyId, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '500', ...(keyId ? { key_id: keyId } : {}) });
      const r = await fetch(`${API_BASE_URL}/api/keys/logs?${qs}`, { headers: authHeaders(token) });
      if (r.ok) { const d = await r.json(); setLogs(d.logs || []); }
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); setPage(1); }, [keyId]);

  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const paged = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8" onClick={onClose}>
      <div className="w-full max-w-5xl h-[80vh] bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Activity size={16} className="text-[#FF8A3D]" /> 调用日志
            {keyId && <span className="text-[10px] text-white/40 font-normal ml-2">key: {keyId.slice(0, 8)}...</span>}
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={fetchLogs} className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/10"><RefreshCw size={14} /></button>
            <button onClick={onClose} className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/10"><X size={16} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="p-12 text-center"><Loader2 size={20} className="animate-spin text-[#FF8A3D] mx-auto" /></div>
          ) : logs.length === 0 ? (
            <p className="p-12 text-center text-white/30 text-sm">暂无调用记录</p>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-white/40 border-b border-white/10 sticky top-0 bg-[#111] z-10">
                <th className="text-left px-4 py-2.5 font-medium">时间</th>
                <th className="text-left px-4 py-2.5 font-medium">模型</th>
                <th className="text-left px-4 py-2.5 font-medium">来源</th>
                <th className="text-right px-4 py-2.5 font-medium">积分</th>
                <th className="text-right px-4 py-2.5 font-medium">耗时</th>
                <th className="text-left px-4 py-2.5 font-medium">状态</th>
                <th className="text-left px-4 py-2.5 font-medium">Prompt</th>
              </tr></thead>
              <tbody>
                {paged.map(log => (
                  <tr key={log.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-white/60 whitespace-nowrap">{fmtTime(log.started_at)}</td>
                    <td className="px-4 py-2.5 text-white/80">{log.model}</td>
                    <td className="px-4 py-2.5"><Badge tone={log.source === 'api' ? 'info' : 'default'}>{log.source || 'api'}</Badge></td>
                    <td className="px-4 py-2.5 text-right text-[#FF8A3D] font-mono">{log.quota_cost ?? 0}</td>
                    <td className="px-4 py-2.5 text-right text-white/40">{log.latency ? `${log.latency}s` : '—'}</td>
                    <td className="px-4 py-2.5">{log.status === 'success' ? <Badge tone="success">success</Badge> : log.status === 'pending' ? <Badge tone="warn">pending</Badge> : <Badge tone="danger">{log.status}</Badge>}</td>
                    <td className="px-4 py-2.5 text-white/50 max-w-[200px] truncate" title={log.prompt_preview}>{log.prompt_preview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between shrink-0">
            <p className="text-xs text-white/30">共 {logs.length} 条</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 disabled:opacity-30"><ChevronLeft size={14} /></button>
              <span className="text-xs text-white/50 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// ---------- Main ----------
const ApiKeysPage = ({ token, lang }) => {
  const [keys, setKeys] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [logsFor, setLogsFor] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [rk, rm] = await Promise.all([
        fetch(`${API_BASE_URL}/api/keys`, { headers: authHeaders(token) }),
        fetch(`${API_BASE_URL}/api/models/public`, { headers: authHeaders(token) }),
      ]);
      if (rk.ok) setKeys((await rk.json()).keys || []);
      if (rm.ok) setModels((await rm.json()).models || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (token) fetchAll(); }, [token]);

  const toggleDisabled = async (k) => {
    await fetch(`${API_BASE_URL}/api/keys/${k.id}`, { method: 'PATCH', headers: authHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ disabled: !k.disabled }) });
    fetchAll();
  };
  const remove = async (k) => {
    if (!confirm(`确认删除 Key "${k.name}"？此操作不可撤销。`)) return;
    await fetch(`${API_BASE_URL}/api/keys/${k.id}`, { method: 'DELETE', headers: authHeaders(token) });
    fetchAll();
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-[#FF8A3D]/5 rounded-full blur-[150px]" />
      </div>
      <div className="relative z-10 max-w-6xl mx-auto">
        {/* header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF8A3D] to-[#E65100] flex items-center justify-center"><Key size={20} className="text-white" /></div>
              <h1 className="text-2xl font-bold text-white">API 管理</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60"><RefreshCw size={15} /></button>
            <button onClick={() => setShowCreate(true)} className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90"><Plus size={14} /> 创建 Key</button>
          </div>
        </div>

        {/* Keys table */}
        <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2"><Key size={14} className="text-[#FF8A3D]" /> My Keys <span className="text-white/30 font-normal text-xs">({keys.length})</span></h2>
            <button onClick={() => setLogsFor({})} className="text-[11px] text-white/50 hover:text-white flex items-center gap-1"><Activity size={12} /> 全部日志</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-white/40 border-b border-white/5">
                <th className="text-left px-4 py-2">名称 / Prefix</th>
                <th className="text-left px-4 py-2">模型</th>
                <th className="text-right px-4 py-2">已用 / 上限</th>
                <th className="text-right px-4 py-2">调用</th>
                <th className="text-left px-4 py-2">状态</th>
                <th className="text-right px-4 py-2">操作</th>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10"><Loader2 size={18} className="animate-spin text-[#FF8A3D] mx-auto" /></td></tr>
                ) : keys.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-white/30">还没有 Key，点右上角「创建 Key」开始使用 API。</td></tr>
                ) : keys.map(k => (
                  <tr key={k.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5"><div className="text-white font-medium">{k.name || '—'}</div><div className="text-[10px] text-white/30 font-mono">{k.prefix}…</div></td>
                    <td className="px-4 py-2.5">{!k.allowed_models || k.allowed_models.length === 0 ? <Badge>all enabled</Badge> : <div className="flex flex-wrap gap-1">{k.allowed_models.slice(0, 3).map(m => <Badge key={m} tone="info">{m}</Badge>)}{k.allowed_models.length > 3 && <Badge>+{k.allowed_models.length - 3}</Badge>}</div>}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-white/80">{k.quota_used ?? 0} / {k.quota_limit ?? '∞'}</td>
                    <td className="px-4 py-2.5 text-right text-white/60 font-mono">{k.total_calls ?? 0}</td>
                    <td className="px-4 py-2.5">{k.disabled ? <Badge tone="danger">disabled</Badge> : <Badge tone="success">active</Badge>}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => setLogsFor({ keyId: k.id })} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white" title="日志"><Activity size={13} /></button>
                        <button onClick={() => toggleDisabled(k)} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white" title={k.disabled ? '启用' : '禁用'}>{k.disabled ? <CheckCircle2 size={13} /> : <XCircle size={13} />}</button>
                        <button onClick={() => remove(k)} className="p-1.5 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400" title="删除"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreate && <CreateKeyModal isOpen={showCreate} onClose={() => setShowCreate(false)} token={token} models={models} onCreated={fetchAll} />}
      {logsFor && <LogsPanel token={token} keyId={logsFor.keyId} onClose={() => setLogsFor(null)} />}
    </div>
  );
};

export default ApiKeysPage;
