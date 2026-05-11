import React, { useEffect, useMemo, useState } from 'react';
import {
  Cpu, Plus, Trash2, Loader2, RefreshCw, X, CheckCircle2, XCircle,
  Settings2, Power, Save, Eye, EyeOff, AlertCircle,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const authHeaders = (token, extra = {}) => ({ 'Authorization': `Bearer ${token}`, ...extra });

const Badge = ({ tone = 'default', children }) => {
  const m = {
    default: 'bg-white/5 text-white/50 border-white/10',
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    warn: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    orange: 'bg-orange-500/10 text-[#FF8A3D] border-orange-500/20',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${m[tone]}`}>{children}</span>;
};

// ---------- Dynamic pricing editor ----------
const PricingEditor = ({ value, onChange }) => {
  const v = value || { mode: 'per_call', cost: 1 };
  const update = (patch) => onChange({ ...v, ...patch });

  const renderTiers = () => {
    const tiers = v.tiers || [{ max_pixels: 4500000, cost: 1 }, { max_pixels: 0, cost: 2 }];
    const setTier = (idx, patch) => {
      const next = tiers.map((t, i) => i === idx ? { ...t, ...patch } : t);
      update({ tiers: next });
    };
    const addTier = () => update({ tiers: [...tiers, { max_pixels: 0, cost: 1 }] });
    const rmTier = (i) => update({ tiers: tiers.filter((_, idx) => idx !== i) });
    return (
      <div className="space-y-2">
        {tiers.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="number" placeholder="max pixels (0 = fallback)" value={t.max_pixels ?? 0}
                   onChange={e => setTier(i, { max_pixels: parseInt(e.target.value || '0', 10) })}
                   className="flex-1 h-8 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
            <input type="number" placeholder="cost" value={t.cost ?? 1}
                   onChange={e => setTier(i, { cost: parseInt(e.target.value || '1', 10) })}
                   className="w-24 h-8 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
            <button onClick={() => rmTier(i)} className="text-white/30 hover:text-red-400"><X size={14} /></button>
          </div>
        ))}
        <button onClick={addTier} className="text-[11px] text-white/50 hover:text-white">+ add tier</button>
      </div>
    );
  };

  const renderByMode = () => {
    const modes = v.by_mode || { relax: 2, fast: 3, turbo: 5 };
    const set = (k, val) => update({ by_mode: { ...modes, [k]: parseInt(val || '0', 10) } });
    return (
      <div className="grid grid-cols-3 gap-2">
        {['relax', 'fast', 'turbo'].map(k => (
          <label key={k} className="text-[11px] text-white/50">
            {k}
            <input type="number" value={modes[k] ?? 0} onChange={e => set(k, e.target.value)}
                   className="w-full h-8 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white mt-1" />
          </label>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] text-white/40 mb-1 block">pricing mode</label>
        <select value={v.mode || 'per_call'} onChange={e => update({ mode: e.target.value })}
                className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white">
          <option value="per_call">per_call — 每次调用固定价</option>
          <option value="per_image">per_image — 按 n 计价</option>
          <option value="tiered_pixels">tiered_pixels — 按分辨率分级</option>
          <option value="by_mode">by_mode — 按 mode 分级（MJ）</option>
        </select>
      </div>

      {(v.mode === 'per_call' || v.mode === 'per_image' || !v.mode) && (
        <div>
          <label className="text-[11px] text-white/40 mb-1 block">cost (credits)</label>
          <input type="number" value={v.cost ?? 1} onChange={e => update({ cost: parseInt(e.target.value || '1', 10) })}
                 className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
        </div>
      )}
      {v.mode === 'tiered_pixels' && renderTiers()}
      {v.mode === 'by_mode' && renderByMode()}
    </div>
  );
};

// ---------- Config editor based on adapter schema ----------
const ConfigEditor = ({ schema, value, onChange }) => {
  const fields = (schema && schema.config_fields) || [];
  if (!fields.length) {
    return <p className="text-[11px] text-white/30">this adapter has no extra config</p>;
  }
  const setField = (k, val) => onChange({ ...(value || {}), [k]: val });
  return (
    <div className="space-y-3">
      {fields.map(f => {
        const v = (value || {})[f.key];
        const display = v === undefined || v === null ? '' : v;
        return (
          <div key={f.key}>
            <label className="text-[11px] text-white/50 mb-1 flex items-center gap-1.5">
              <code className="text-white/80">{f.key}</code>
              {f.required && <span className="text-red-400/80">*</span>}
              {f.help && <span className="text-white/30">— {f.help}</span>}
            </label>
            {f.type === 'enum' ? (
              <select value={display} onChange={e => setField(f.key, e.target.value)}
                      className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white">
                <option value="">— select —</option>
                {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'boolean' ? (
              <label className="flex items-center gap-2 text-xs text-white">
                <input type="checkbox" checked={Boolean(v ?? f.default)} onChange={e => setField(f.key, e.target.checked)} className="accent-[#FF8A3D]" />
                {f.key}
              </label>
            ) : f.type === 'number' ? (
              <input type="number" value={display} placeholder={String(f.default ?? '')}
                     onChange={e => setField(f.key, e.target.value === '' ? undefined : Number(e.target.value))}
                     className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
            ) : (
              <input type="text" value={display} placeholder={String(f.default ?? '')}
                     onChange={e => setField(f.key, e.target.value)}
                     className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white font-mono" />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------- Model edit modal ----------
const ModelModal = ({ isOpen, onClose, token, lang, adapters, initial, onSaved }) => {
  const [form, setForm] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(initial ? { ...initial } : {
      id: '',
      adapter_type: Object.keys(adapters || {})[0] || 'ttapi-image',
      upstream_api_key: '',
      description: '',
      enabled: true,
      supports: { image: true, video: false },
      pricing: { mode: 'per_call', cost: 1 },
      config: {},
    });
    setShowKey(false);
  }, [isOpen, initial, adapters]);

  if (!isOpen || !form) return null;

  const schema = adapters?.[form.adapter_type];
  const isEdit = Boolean(initial);

  const submit = async () => {
    if (!form.id) { alert(lang === 'zh' ? '请输入模型 ID' : 'Please enter model id'); return; }
    if (!form.adapter_type) { alert('adapter_type required'); return; }
    setSaving(true);
    try {
      const url = isEdit ? `${API_BASE_URL}/api/admin/models/${form.id}` : `${API_BASE_URL}/api/admin/models`;
      const method = isEdit ? 'PATCH' : 'POST';
      const body = isEdit ? { ...form, id: undefined } : form;
      const res = await fetch(url, {
        method,
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'save failed'); }
      onSaved?.();
      onClose();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Cpu size={18} className="text-[#FF8A3D]" />
            {isEdit ? (lang === 'zh' ? '编辑模型' : 'Edit model') : (lang === 'zh' ? '新增模型' : 'Add model')}
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-4">
            <div>
              <label className="text-[11px] text-white/50 mb-1 block">model id *</label>
              <input value={form.id || ''} disabled={isEdit}
                     onChange={e => setForm({ ...form, id: e.target.value })}
                     placeholder="gpt-image-2 / midjourney-fast / veo3.1-4k"
                     className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white font-mono disabled:opacity-50" />
              {!isEdit && <p className="text-[10px] text-white/30 mt-1">{lang === 'zh' ? '用户调用 API 时传这个 id；创建后不可改' : 'Users reference this id in /v1 requests; immutable once created'}</p>}
            </div>

            <div>
              <label className="text-[11px] text-white/50 mb-1 block">adapter type *</label>
              <select value={form.adapter_type} onChange={e => setForm({ ...form, adapter_type: e.target.value, config: {} })}
                      className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white">
                {Object.entries(adapters || {}).map(([k, meta]) => (
                  <option key={k} value={k}>{k} — {meta.display_name}</option>
                ))}
              </select>
              {schema?.supports && (
                <div className="flex gap-1 mt-1">
                  {schema.supports.image && <Badge tone="info">image</Badge>}
                  {schema.supports.video && <Badge tone="info">video</Badge>}
                  {schema.supports.async && <Badge tone="warn">async</Badge>}
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] text-white/50 mb-1 block">upstream api key</label>
              <div className="flex gap-1.5">
                <input type={showKey ? 'text' : 'password'} value={form.upstream_api_key || ''}
                       onChange={e => setForm({ ...form, upstream_api_key: e.target.value })}
                       placeholder="sk-... 或 TT-API-KEY"
                       className="flex-1 h-9 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white font-mono" />
                <button onClick={() => setShowKey(s => !s)} className="px-2 rounded border border-white/10 text-white/50 hover:text-white">
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-white/50 mb-1 block">description</label>
              <input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })}
                     placeholder={lang === 'zh' ? '简短说明' : 'short description'}
                     className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={Boolean(form.enabled)} onChange={e => setForm({ ...form, enabled: e.target.checked })} className="accent-[#FF8A3D]" /> enabled
              </label>
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={Boolean(form.supports?.image)} onChange={e => setForm({ ...form, supports: { ...(form.supports || {}), image: e.target.checked } })} className="accent-[#FF8A3D]" /> image
              </label>
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={Boolean(form.supports?.video)} onChange={e => setForm({ ...form, supports: { ...(form.supports || {}), video: e.target.checked } })} className="accent-[#FF8A3D]" /> video
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs text-white/70 mb-2 font-bold flex items-center gap-1">
                <Settings2 size={13} /> adapter config
              </div>
              <div className="border border-white/10 rounded-lg p-3 bg-black/20">
                <ConfigEditor schema={schema} value={form.config} onChange={config => setForm({ ...form, config })} />
              </div>
            </div>

            <div>
              <div className="text-xs text-white/70 mb-2 font-bold">pricing</div>
              <div className="border border-white/10 rounded-lg p-3 bg-black/20">
                <PricingEditor value={form.pricing} onChange={pricing => setForm({ ...form, pricing })} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-5 mt-4 border-t border-white/10">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 text-white text-sm hover:bg-white/10">
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button onClick={submit} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {lang === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------- Main ----------
const AdminModelsPage = ({ token, lang }) => {
  const [models, setModels] = useState([]);
  const [adapters, setAdapters] = useState({});
  const [loading, setLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [rm, ra] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/models`, { headers: authHeaders(token) }),
        fetch(`${API_BASE_URL}/api/admin/adapter-types`, { headers: authHeaders(token) }),
      ]);
      if (rm.ok) setModels((await rm.json()).models || []);
      if (ra.ok) setAdapters((await ra.json()).types || {});
    } finally { setLoading(false); }
  };

  useEffect(() => { if (token) fetchAll(); /* eslint-disable-next-line */ }, [token]);

  const toggleEnabled = async (m) => {
    const res = await fetch(`${API_BASE_URL}/api/admin/models/${m.id}`, {
      method: 'PATCH',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ enabled: !m.enabled }),
    });
    if (res.ok) fetchAll();
  };

  const remove = async (m) => {
    if (!confirm(lang === 'zh' ? `删除模型 ${m.id}？\n已用此模型的 Key 将不再能调用。` : `Delete model ${m.id}? Keys using it will lose access.`)) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/models/${m.id}`, { method: 'DELETE', headers: authHeaders(token) });
    if (res.ok) fetchAll();
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-[#8B5CF6]/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF8A3D] to-[#E65100] flex items-center justify-center">
                <Cpu size={20} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">{lang === 'zh' ? '模型管理' : 'Model Registry'}</h1>
            </div>
            <p className="text-sm text-white/40 ml-[52px]">
              {lang === 'zh' ? '配置对外开放的模型；协议一致的模型直接配置即可' : 'Register models exposed via /v1. Protocol-compatible providers need only config.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60"><RefreshCw size={15} /></button>
            <button onClick={() => { setEditing(null); setShowEdit(true); }}
                    className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90">
              <Plus size={14} /> {lang === 'zh' ? '新增模型' : 'Add model'}
            </button>
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/40 border-b border-white/5">
                  <th className="text-left px-4 py-2">model id</th>
                  <th className="text-left px-4 py-2">adapter</th>
                  <th className="text-left px-4 py-2">{lang === 'zh' ? '支持' : 'supports'}</th>
                  <th className="text-left px-4 py-2">pricing</th>
                  <th className="text-left px-4 py-2">status</th>
                  <th className="text-right px-4 py-2">{lang === 'zh' ? '操作' : 'actions'}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10"><Loader2 size={18} className="animate-spin text-[#FF8A3D] mx-auto" /></td></tr>
                ) : models.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-white/30">
                    {lang === 'zh' ? '尚未配置模型。点击「新增模型」开始。' : 'No models yet. Click "Add model" to create one.'}
                  </td></tr>
                ) : models.map(m => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <div className="text-white font-mono font-medium">{m.id}</div>
                      {m.description && <div className="text-[10px] text-white/40 mt-0.5">{m.description}</div>}
                    </td>
                    <td className="px-4 py-2.5"><Badge tone="info">{m.adapter_type}</Badge></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {m.supports?.image && <Badge>image</Badge>}
                        {m.supports?.video && <Badge>video</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-white/70 font-mono text-[11px]">
                        {m.pricing?.mode || 'per_call'}:{' '}
                        {m.pricing?.mode === 'by_mode'
                          ? Object.entries(m.pricing.by_mode || {}).map(([k, v]) => `${k}=${v}`).join(' / ')
                          : m.pricing?.mode === 'tiered_pixels'
                            ? (m.pricing.tiers || []).map(t => `${t.max_pixels || '∞'}→${t.cost}`).join(' / ')
                            : (m.pricing?.cost ?? '?')}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {m.enabled ? <Badge tone="success">enabled</Badge> : <Badge tone="danger">disabled</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => { setEditing(m); setShowEdit(true); }}
                                className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white" title="edit">
                          <Settings2 size={13} />
                        </button>
                        <button onClick={() => toggleEnabled(m)}
                                className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white" title={m.enabled ? 'disable' : 'enable'}>
                          {m.enabled ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                        </button>
                        <button onClick={() => remove(m)}
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

        <p className="mt-5 text-[11px] text-white/40 leading-relaxed max-w-3xl flex items-start gap-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {lang === 'zh'
            ? '协议一致的模型（比如 TTAPI 系列、Tuzi 系列、OpenAI 兼容）直接在这里配置即可启用；若上游协议结构不同（字段名/返回结构/轮询机制），需要在 backend/api_gateway/adapters/ 下新增一个 adapter 类并注册到 REGISTRY。'
            : 'Models with compatible protocols (TTAPI, Tuzi, OpenAI-compat) can be added here with no code change. Providers with a different shape (different fields / response / polling) require adding a new adapter class in backend/api_gateway/adapters/ and registering it.'}
        </p>
      </div>

      <ModelModal
        isOpen={showEdit}
        onClose={() => { setShowEdit(false); setEditing(null); }}
        token={token} lang={lang} adapters={adapters} initial={editing}
        onSaved={fetchAll}
      />
    </div>
  );
};

export default AdminModelsPage;
