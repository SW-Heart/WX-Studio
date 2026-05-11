import React, { useEffect, useMemo, useState } from 'react';
import {
  Key, Plus, Copy, Check, Loader2, Trash2, Shield, EyeOff, Eye,
  RefreshCw, X, AlertCircle, Code2, Activity, CheckCircle2, XCircle,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const authHeaders = (token, extra = {}) => ({
  'Authorization': `Bearer ${token}`,
  ...extra,
});

const fmtTime = (ts) => (ts ? new Date(ts * 1000).toLocaleString() : '—');

const Badge = ({ tone = 'default', children }) => {
  const map = {
    default: 'bg-white/5 text-white/50 border-white/10',
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    warn: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    orange: 'bg-orange-500/10 text-[#FF8A3D] border-orange-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${map[tone]}`}>
      {children}
    </span>
  );
};

// ---------- Create Key Modal ----------
const CreateKeyModal = ({ isOpen, onClose, token, lang, models, onCreated }) => {
  const [name, setName] = useState('');
  const [allowAll, setAllowAll] = useState(true);
  const [allowed, setAllowed] = useState([]);
  const [quotaLimit, setQuotaLimit] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setName(''); setAllowAll(true); setAllowed([]); setQuotaLimit('');
      setResult(null); setCopied(false); setShow(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async () => {
    setLoading(true);
    try {
      const body = {
        name: name.trim() || 'unnamed',
        allowed_models: allowAll ? [] : allowed,
        quota_limit: quotaLimit.trim() === '' ? null : parseInt(quotaLimit, 10),
      };
      const res = await fetch(`${API_BASE_URL}/api/keys`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'create failed');
      setResult(data);
      onCreated?.();
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  const copy = () => {
    if (!result?.key) return;
    navigator.clipboard?.writeText(result.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleModel = (id) => {
    setAllowed((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Key size={18} className="text-[#FF8A3D]" /> {lang === 'zh' ? '创建 API Key' : 'Create API Key'}
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={20} className="text-green-400" />
                <p className="text-green-400 font-bold">{lang === 'zh' ? 'API Key 已生成' : 'API Key created'}</p>
              </div>
              <div className="bg-black/40 rounded-lg p-3 font-mono text-xs text-white flex items-center gap-2">
                <code className="flex-1 break-all">{show ? result.key : '•'.repeat(Math.min(48, result.key.length))}</code>
                <button onClick={() => setShow(s => !s)} className="text-white/40 hover:text-white p-1">
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={copy} className="text-white/40 hover:text-white p-1">
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-red-400/80 flex items-start gap-1.5">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {lang === 'zh'
                ? '完整 Key 只显示这一次，请立即复制保存。关闭后无法再次查看。'
                : 'The full key is shown only once. Copy and save it now — you will not see it again.'}
            </p>
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-[#FF8A3D] text-white text-sm font-bold hover:opacity-90">
              {lang === 'zh' ? '我已保存' : 'I\'ve saved it'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">{lang === 'zh' ? '名称' : 'Name'}</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder={lang === 'zh' ? '例如：个人项目 / SDK 测试' : 'e.g., My project'}
                className="w-full h-10 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 text-sm text-white placeholder:text-white/25 focus:border-[#FF8A3D] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-white/50">{lang === 'zh' ? '可用模型' : 'Allowed models'}</label>
                <label className="flex items-center gap-1.5 text-[11px] text-white/50">
                  <input type="checkbox" checked={allowAll} onChange={e => setAllowAll(e.target.checked)}
                         className="accent-[#FF8A3D]" />
                  {lang === 'zh' ? '允许全部启用的模型' : 'Allow all enabled'}
                </label>
              </div>
              {!allowAll && (
                <div className="max-h-44 overflow-auto space-y-1.5 border border-white/10 rounded-lg p-2 bg-[#0a0a0a]">
                  {models.length === 0 ? (
                    <p className="text-white/30 text-xs text-center py-3">
                      {lang === 'zh' ? '尚无可用模型' : 'No models available'}
                    </p>
                  ) : models.map(m => (
                    <label key={m.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer">
                      <input type="checkbox" checked={allowed.includes(m.id)}
                             onChange={() => toggleModel(m.id)} className="accent-[#FF8A3D]" />
                      <span className="text-xs text-white flex-1">{m.id}</span>
                      <span className="text-[10px] text-white/30">{m.adapter_type}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-white/50 mb-1.5 block">
                {lang === 'zh' ? '积分上限 (留空=不限，仅受账户总余额限制)' : 'Quota cap (leave empty = no limit)'}
              </label>
              <input
                type="number" min={0} value={quotaLimit} onChange={e => setQuotaLimit(e.target.value)}
                placeholder={lang === 'zh' ? '不限' : 'unlimited'}
                className="w-full h-10 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 text-sm text-white focus:border-[#FF8A3D] focus:outline-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 text-white text-sm hover:bg-white/10">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button onClick={submit} disabled={loading}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {lang === 'zh' ? '生成' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- Logs Panel ----------
const LogsPanel = ({ token, lang, keyId, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '200', ...(keyId ? { key_id: keyId } : {}) });
      const r = await fetch(`${API_BASE_URL}/api/keys/logs?${qs}`, { headers: authHeaders(token) });
      if (r.ok) { const d = await r.json(); setLogs(d.logs || []); }
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); /* eslint-disable-next-line */ }, [keyId]);

  return (
    <div className="fixed inset-0 z-[1000] bg-black/80 flex flex-col p-4 md:p-8">
      <div className="max-w-5xl mx-auto w-full bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden flex-1">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Activity size={16} className="text-[#FF8A3D]" />
            {lang === 'zh' ? '调用日志' : 'Request Logs'}
            {keyId && <span className="text-[10px] text-white/40 font-normal">key: {keyId.slice(0, 8)}...</span>}
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={fetchLogs} className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/10">
              <RefreshCw size={14} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/10">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-12 text-center"><Loader2 size={20} className="animate-spin text-[#FF8A3D] mx-auto" /></div>
          ) : logs.length === 0 ? (
            <p className="p-12 text-center text-white/30 text-sm">{lang === 'zh' ? '暂无调用记录' : 'No requests yet'}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/40 border-b border-white/10">
                  <th className="text-left px-4 py-2">{lang === 'zh' ? '时间' : 'Time'}</th>
                  <th className="text-left px-4 py-2">{lang === 'zh' ? '模型' : 'Model'}</th>
                  <th className="text-left px-4 py-2">{lang === 'zh' ? '来源' : 'Source'}</th>
                  <th className="text-right px-4 py-2">{lang === 'zh' ? '积分' : 'Cost'}</th>
                  <th className="text-right px-4 py-2">{lang === 'zh' ? '耗时' : 'Latency'}</th>
                  <th className="text-left px-4 py-2">{lang === 'zh' ? '状态' : 'Status'}</th>
                  <th className="text-left px-4 py-2">{lang === 'zh' ? 'Prompt' : 'Prompt'}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2 text-white/60">{fmtTime(log.started_at)}</td>
                    <td className="px-4 py-2 text-white/80">{log.model}</td>
                    <td className="px-4 py-2">
                      <Badge tone={log.source === 'api' ? 'info' : 'default'}>{log.source || 'api'}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right text-[#FF8A3D] font-mono">{log.quota_cost ?? 0}</td>
                    <td className="px-4 py-2 text-right text-white/40">{log.latency ? `${log.latency}s` : '—'}</td>
                    <td className="px-4 py-2">
                      {log.status === 'success' ? <Badge tone="success">success</Badge>
                        : log.status === 'pending' ? <Badge tone="warn">pending</Badge>
                        : <Badge tone="danger">{log.status}</Badge>}
                    </td>
                    <td className="px-4 py-2 text-white/50 max-w-xs truncate" title={log.prompt_preview}>
                      {log.prompt_preview}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- Curl Sample ----------
const SampleCard = ({ lang }) => {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-host';
  const sample = `curl -X POST ${origin}/v1/images/generations \\
  -H "Authorization: Bearer sk-YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "a cat sitting on a book, studio lighting",
    "n": 1
  }'`;

  const copy = () => {
    navigator.clipboard?.writeText(sample);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold text-white/80 flex items-center gap-1.5">
          <Code2 size={13} className="text-[#FF8A3D]" /> {lang === 'zh' ? '调用示例' : 'Usage example'}
        </h4>
        <button onClick={copy} className="text-white/40 hover:text-white text-[11px] flex items-center gap-1">
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />} {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="text-[11px] text-white/70 font-mono overflow-auto leading-relaxed">
        {sample}
      </pre>
    </div>
  );
};

// ---------- Main ----------
const ApiKeysPage = ({ token, lang }) => {
  const [keys, setKeys] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [logsFor, setLogsFor] = useState(null);      // null | { keyId? }

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

  useEffect(() => { if (token) fetchAll(); /* eslint-disable-next-line */ }, [token]);

  const toggleDisabled = async (k) => {
    const res = await fetch(`${API_BASE_URL}/api/keys/${k.id}`, {
      method: 'PATCH',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ disabled: !k.disabled }),
    });
    if (res.ok) fetchAll();
  };

  const remove = async (k) => {
    if (!confirm(lang === 'zh' ? `确认删除 Key "${k.name}"？此操作不可撤销。` : `Delete key "${k.name}"? This cannot be undone.`)) return;
    const res = await fetch(`${API_BASE_URL}/api/keys/${k.id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    if (res.ok) fetchAll();
  };

  const headerRight = (
    <div className="flex items-center gap-2">
      <button onClick={fetchAll} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60" title="refresh">
        <RefreshCw size={15} />
      </button>
      <button onClick={() => setShowCreate(true)}
              className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90">
        <Plus size={14} /> {lang === 'zh' ? '创建 Key' : 'New Key'}
      </button>
    </div>
  );

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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF8A3D] to-[#E65100] flex items-center justify-center">
                <Key size={20} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">{lang === 'zh' ? 'API 管理' : 'API Management'}</h1>
            </div>
            <p className="text-sm text-white/40 ml-[52px]">
              {lang === 'zh' ? '生成 API Key，把平台积分用到自己的应用里' : 'Generate API keys and use platform credits in your own apps'}
            </p>
          </div>
          {headerRight}
        </div>

        <div className="grid lg:grid-cols-3 gap-5 mb-6">
          <div className="lg:col-span-2 bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Key size={14} className="text-[#FF8A3D]" /> {lang === 'zh' ? 'My Keys' : 'My Keys'}
                <span className="text-white/30 font-normal text-xs">({keys.length})</span>
              </h2>
              <button onClick={() => setLogsFor({})} className="text-[11px] text-white/50 hover:text-white flex items-center gap-1">
                <Activity size={12} /> {lang === 'zh' ? '全部日志' : 'All logs'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/40 border-b border-white/5">
                    <th className="text-left px-4 py-2">Name / Prefix</th>
                    <th className="text-left px-4 py-2">{lang === 'zh' ? '模型' : 'Models'}</th>
                    <th className="text-right px-4 py-2">{lang === 'zh' ? '已用 / 上限' : 'Used / Cap'}</th>
                    <th className="text-right px-4 py-2">{lang === 'zh' ? '调用' : 'Calls'}</th>
                    <th className="text-left px-4 py-2">{lang === 'zh' ? '状态' : 'Status'}</th>
                    <th className="text-right px-4 py-2">{lang === 'zh' ? '操作' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-10"><Loader2 size={18} className="animate-spin text-[#FF8A3D] mx-auto" /></td></tr>
                  ) : keys.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-white/30">
                      {lang === 'zh' ? '还没有 Key，点右上角「创建 Key」开始使用 API。' : 'No keys yet. Click "New Key" above to create one.'}
                    </td></tr>
                  ) : keys.map(k => (
                    <tr key={k.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5">
                        <div className="text-white font-medium">{k.name || '—'}</div>
                        <div className="text-[10px] text-white/30 font-mono">{k.prefix}…</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {!k.allowed_models || k.allowed_models.length === 0
                          ? <Badge>all enabled</Badge>
                          : <div className="flex flex-wrap gap-1">{k.allowed_models.slice(0,4).map(m => <Badge key={m} tone="info">{m}</Badge>)}{k.allowed_models.length>4 && <Badge>+{k.allowed_models.length-4}</Badge>}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-white/80">
                        {k.quota_used ?? 0} / {k.quota_limit ?? '∞'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/60 font-mono">{k.total_calls ?? 0}</td>
                      <td className="px-4 py-2.5">
                        {k.disabled ? <Badge tone="danger">disabled</Badge> : <Badge tone="success">active</Badge>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => setLogsFor({ keyId: k.id })}
                                  className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white" title="logs">
                            <Activity size={13} />
                          </button>
                          <button onClick={() => toggleDisabled(k)}
                                  className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white" title={k.disabled ? 'enable' : 'disable'}>
                            {k.disabled ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                          </button>
                          <button onClick={() => remove(k)}
                                  className="p-1.5 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400" title="delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-5">
            <SampleCard lang={lang} />
            <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-4">
              <h4 className="text-xs font-bold text-white/80 mb-2 flex items-center gap-1.5">
                <Shield size={13} className="text-[#FF8A3D]" /> {lang === 'zh' ? '计费规则' : 'Billing'}
              </h4>
              <ul className="text-[11px] text-white/50 space-y-1.5 leading-relaxed">
                <li>• {lang === 'zh' ? 'API 调用与网页创作共享同一积分池' : 'API calls share the same credit pool as in-app creation'}</li>
                <li>• {lang === 'zh' ? '每次调用先扣积分，上游失败自动退回' : 'Credits are deducted up-front and refunded on upstream failure'}</li>
                <li>• {lang === 'zh' ? '同一 Key 可设积分上限，超过自动拒绝' : 'Set a per-key cap; requests are rejected once reached'}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateKeyModal
          isOpen={showCreate} onClose={() => setShowCreate(false)}
          token={token} lang={lang} models={models} onCreated={fetchAll}
        />
      )}
      {logsFor && (
        <LogsPanel
          token={token} lang={lang} keyId={logsFor.keyId}
          onClose={() => setLogsFor(null)}
        />
      )}
    </div>
  );
};

export default ApiKeysPage;
