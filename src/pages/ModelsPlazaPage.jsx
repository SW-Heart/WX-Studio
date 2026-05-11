import React, { useEffect, useMemo, useState } from 'react';
import {
  Cpu, ImageIcon, Film, Zap, Copy, Check, Search, RefreshCw, Loader2,
  Info, Sparkles, Key, X, Code2, Send, ArrowRight,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const authHeaders = (token) => ({ 'Authorization': `Bearer ${token}` });

// ---------- helpers ----------

const describePricing = (pricing, lang) => {
  if (!pricing) return [lang === 'zh' ? '未配置' : 'unset'];
  const mode = pricing.mode || 'per_call';
  const zh = lang === 'zh';
  if (mode === 'per_call') {
    return [zh ? `每次调用 ${pricing.cost ?? '?'} 积分` : `${pricing.cost ?? '?'} credits / call`];
  }
  if (mode === 'per_image') {
    return [zh ? `每张 ${pricing.cost ?? '?'} 积分（按 n 计算）` : `${pricing.cost ?? '?'} credits / image (× n)`];
  }
  if (mode === 'by_mode') {
    return Object.entries(pricing.by_mode || {})
      .map(([k, v]) => zh ? `${k} 模式 · ${v} 积分/次` : `${k} · ${v} credits`);
  }
  if (mode === 'tiered_pixels') {
    return (pricing.tiers || []).map(t => {
      const mp = Number(t.max_pixels || 0);
      if (mp === 0) return zh ? `其他尺寸 · ${t.cost} 积分/张` : `Other sizes · ${t.cost} credits`;
      const label = mp >= 1_000_000 ? `${(mp / 1_000_000).toFixed(1).replace('.0', '')}M px` : `${mp} px`;
      return zh ? `≤ ${label} · ${t.cost} 积分/张` : `≤ ${label} · ${t.cost} credits`;
    });
  }
  return [JSON.stringify(pricing)];
};

const ModalityIcon = ({ supports, size = 22 }) => {
  if (supports?.video) return <Film size={size} className="text-red-400" />;
  return <ImageIcon size={size} className="text-orange-400" />;
};

/** 根据 params_schema 生成一份最小可运行 example body */
const sampleBody = (model) => {
  const body = { model: model.id };
  for (const p of model.params_schema || []) {
    if (p.name === 'model') continue;
    if (p.required || p.example !== undefined || p.default !== undefined) {
      let v = p.example;
      if (v === undefined) v = p.default;
      if (v === undefined) {
        if (p.type === 'string') v = p.name === 'prompt' ? 'a cat sitting on a book, studio lighting' : '';
        else if (p.type === 'number') v = 1;
        else if (p.type === 'enum') v = p.values?.[0] || '';
        else v = '';
      }
      if (v !== '' && v !== undefined) body[p.name] = v;
    }
  }
  if (!body.prompt && (model.params_schema || []).some(p => p.name === 'prompt')) {
    body.prompt = 'a cat sitting on a book, studio lighting';
  }
  return body;
};

const endpointFor = (model) => {
  if (model.supports?.video) return '/v1/videos';
  return '/v1/images/generations';
};

// ---------- Details Modal ----------

const ModelDetailsModal = ({ model, lang, onClose }) => {
  if (!model) return null;
  const [copied, setCopied] = useState(null);
  const lines = describePricing(model.pricing, lang);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-host';
  const body = sampleBody(model);
  const ep = endpointFor(model);
  const curl = `curl -X POST ${origin}${ep} \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;

  const copy = (kind, text) => {
    navigator.clipboard?.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-start justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
              <ModalityIcon supports={model.supports} size={22} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">{model.display_name || model.id}</h3>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-[11px] text-white/50 font-mono bg-white/5 px-1.5 py-0.5 rounded">{model.id}</code>
                <button onClick={() => copy('id', model.id)}
                        className="text-white/30 hover:text-white p-1 rounded transition-colors">
                  {copied === 'id' ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
                {model.supports?.image && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">image</span>}
                {model.supports?.video && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">video</span>}
              </div>
              {model.description && (
                <p className="text-xs text-white/50 mt-2 leading-relaxed">{model.description}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1.5 rounded hover:bg-white/10 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Endpoint */}
          <section>
            <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-2 flex items-center gap-1.5">
              <Send size={11} /> {lang === 'zh' ? '调用端点' : 'Endpoint'}
            </h4>
            <div className="bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 font-mono text-xs text-white flex items-center gap-2">
              <span className="text-green-400 font-bold">POST</span>
              <span className="text-white/90 flex-1 truncate">{ep}</span>
            </div>
          </section>

          {/* Pricing */}
          <section>
            <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-2 flex items-center gap-1.5">
              <Zap size={11} className="text-[#FF8A3D]" /> {lang === 'zh' ? '计费' : 'Pricing'}
            </h4>
            <ul className="space-y-1.5">
              {lines.map((line, i) => (
                <li key={i} className="text-xs text-white/80 font-mono flex items-start gap-2">
                  <span className="text-[#FF8A3D] mt-0.5">›</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Params */}
          <section>
            <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-2 flex items-center gap-1.5">
              <Code2 size={11} /> {lang === 'zh' ? '请求参数' : 'Request parameters'}
            </h4>
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.03] text-white/40 text-[10px] uppercase tracking-wider">
                    <th className="text-left px-3 py-2 font-medium">{lang === 'zh' ? '参数' : 'Name'}</th>
                    <th className="text-left px-3 py-2 font-medium">{lang === 'zh' ? '类型' : 'Type'}</th>
                    <th className="text-left px-3 py-2 font-medium">{lang === 'zh' ? '必填' : 'Required'}</th>
                    <th className="text-left px-3 py-2 font-medium">{lang === 'zh' ? '说明' : 'Description'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(model.params_schema || []).length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-6 text-white/30">
                      {lang === 'zh' ? '仅需 model + prompt' : 'Only requires model + prompt'}
                    </td></tr>
                  ) : model.params_schema.map((p) => (
                    <tr key={p.name} className="border-t border-white/5">
                      <td className="px-3 py-2 align-top">
                        <code className="text-white font-mono">{p.name}</code>
                        {p.values && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {p.values.map(v => (
                              <span key={v} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/60 font-mono">{v}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-white/70 font-mono text-[11px]">{p.type}</td>
                      <td className="px-3 py-2 align-top">
                        {p.required
                          ? <span className="text-[10px] text-red-400 font-bold">✓</span>
                          : <span className="text-[10px] text-white/30">—</span>}
                      </td>
                      <td className="px-3 py-2 align-top text-white/60 leading-relaxed">
                        {p.description}
                        {p.default !== undefined && (
                          <div className="text-[10px] text-white/40 mt-1">
                            default: <code className="text-white/60 font-mono">{String(p.default)}</code>
                          </div>
                        )}
                        {p.example !== undefined && (
                          <div className="text-[10px] text-white/40 mt-1">
                            example: <code className="text-white/60 font-mono">{String(p.example)}</code>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* cURL example */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-1.5">
                <Code2 size={11} /> {lang === 'zh' ? '调用示例' : 'Example request'}
              </h4>
              <button onClick={() => copy('curl', curl)}
                      className="text-[11px] text-white/50 hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5">
                {copied === 'curl' ? <><Check size={11} className="text-green-400" /> copied</> : <><Copy size={11} /> copy</>}
              </button>
            </div>
            <pre className="bg-[#0a0a0a] border border-white/10 rounded-lg p-3 text-[11px] text-white/80 font-mono overflow-x-auto leading-relaxed whitespace-pre">{curl}</pre>
          </section>

          {/* Response shape */}
          <section>
            <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-2 flex items-center gap-1.5">
              <ArrowRight size={11} /> {lang === 'zh' ? '返回格式' : 'Response shape'}
            </h4>
            <pre className="bg-[#0a0a0a] border border-white/10 rounded-lg p-3 text-[11px] text-white/70 font-mono overflow-x-auto leading-relaxed whitespace-pre">{`{
  "created": 1710000000,
  "model": "${model.id}",
  "data": [ { "url": "https://..." } ],
  "usage": { "quota_cost": 1, "quota_remaining": 99 }
}`}</pre>
          </section>
        </div>
      </div>
    </div>
  );
};

// ---------- Card ----------

const ModelCard = ({ model, lang, onOpen }) => {
  const lines = describePricing(model.pricing, lang);
  const isVideo = model.supports?.video;

  const gradient = isVideo
    ? 'from-red-500/10 to-rose-600/5 border-red-500/20 hover:border-red-500/40'
    : 'from-orange-500/10 to-amber-600/5 border-orange-500/20 hover:border-orange-500/40';

  return (
    <button
      onClick={() => onOpen(model)}
      className={`group relative text-left rounded-2xl border bg-gradient-to-br ${gradient}
                  p-5 transition-all hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/30 focus:outline-none focus:ring-2 focus:ring-[#FF8A3D]/60`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <ModalityIcon supports={model.supports} size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white truncate">{model.display_name || model.id}</h3>
          <code className="text-[10px] text-white/40 font-mono block truncate mt-0.5">{model.id}</code>
        </div>
        <div className="flex gap-1 shrink-0">
          {model.supports?.image && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">image</span>}
          {model.supports?.video && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">video</span>}
        </div>
      </div>

      {model.description && (
        <p className="text-xs text-white/60 mt-3 leading-relaxed line-clamp-2">{model.description}</p>
      )}

      <div className="mt-4 pt-3 border-t border-white/10">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap size={11} className="text-[#FF8A3D]" />
          <span className="text-[10px] text-white/50 uppercase tracking-wider font-bold">
            {lang === 'zh' ? '计费' : 'Pricing'}
          </span>
        </div>
        <ul className="space-y-1">
          {lines.slice(0, 3).map((line, i) => (
            <li key={i} className="text-[11px] text-white/70 font-mono flex items-start gap-1.5">
              <span className="text-white/30 mt-0.5">•</span>
              <span className="truncate">{line}</span>
            </li>
          ))}
          {lines.length > 3 && (
            <li className="text-[10px] text-white/40">+{lines.length - 3} more</li>
          )}
        </ul>
      </div>

      <div className="absolute bottom-3 right-4 text-[10px] text-white/30 group-hover:text-white/80 transition-colors flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        {lang === 'zh' ? '详情' : 'details'} <ArrowRight size={11} />
      </div>
    </button>
  );
};

// ---------- Main ----------

const ModelsPlazaPage = ({ token, lang }) => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [active, setActive] = useState(null); // clicked model

  const fetchModels = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/models/public`, { headers: authHeaders(token) });
      if (r.ok) setModels((await r.json()).models || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (token) fetchModels(); /* eslint-disable-next-line */ }, [token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter(m => {
      if (filter === 'image' && !m.supports?.image) return false;
      if (filter === 'video' && !m.supports?.video) return false;
      if (!q) return true;
      return (m.id + ' ' + (m.display_name || '') + ' ' + (m.description || ''))
        .toLowerCase().includes(q);
    });
  }, [models, search, filter]);

  const stats = useMemo(() => ({
    total: models.length,
    image: models.filter(m => m.supports?.image).length,
    video: models.filter(m => m.supports?.video).length,
  }), [models]);

  const filterBtn = (key, label) => (
    <button
      onClick={() => setFilter(key)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        filter === key
          ? 'bg-[#FF8A3D] text-white'
          : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
      }`}
    >{label}</button>
  );

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-[#FF8A3D]/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF8A3D] to-[#E65100] flex items-center justify-center">
                <Sparkles size={20} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">{lang === 'zh' ? '模型广场' : 'Model Plaza'}</h1>
            </div>
            <p className="text-sm text-white/40 ml-[52px]">
              {lang === 'zh'
                ? '平台开放的 AI 模型，点击卡片查看参数与调用示例'
                : 'Browse available models; click any card for parameters and example'}
            </p>
          </div>
          <button onClick={fetchModels} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60">
            <RefreshCw size={15} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6 mt-6">
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">{lang === 'zh' ? '可用模型' : 'Available'}</p>
            <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1">
              <ImageIcon size={10} className="text-orange-400" /> {lang === 'zh' ? '图像' : 'Image'}
            </p>
            <p className="text-2xl font-bold text-white mt-1">{stats.image}</p>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1">
              <Film size={10} className="text-red-400" /> {lang === 'zh' ? '视频' : 'Video'}
            </p>
            <p className="text-2xl font-bold text-white mt-1">{stats.video}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2">
            {filterBtn('all', lang === 'zh' ? '全部' : 'All')}
            {filterBtn('image', lang === 'zh' ? '图像' : 'Image')}
            {filterBtn('video', lang === 'zh' ? '视频' : 'Video')}
          </div>
          <div className="relative flex-1 sm:flex-initial min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={lang === 'zh' ? '搜索模型...' : 'Search models...'}
              className="h-9 w-full sm:w-64 bg-[#0a0a0a] border border-white/10 rounded-lg pl-9 pr-3 text-xs text-white placeholder:text-white/25 focus:border-[#FF8A3D] focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-24 text-center"><Loader2 size={22} className="animate-spin text-[#FF8A3D] mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center text-white/30">
            <Cpu size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              {search ? (lang === 'zh' ? '没有匹配的模型' : 'No models match your search')
                      : (lang === 'zh' ? '暂无可用模型' : 'No models available')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(m => <ModelCard key={m.id} model={m} lang={lang} onOpen={setActive} />)}
          </div>
        )}

        <div className="mt-8 p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-start gap-3">
          <Info size={15} className="text-white/40 shrink-0 mt-0.5" />
          <p className="text-[11px] text-white/50 leading-relaxed">
            {lang === 'zh' ? (
              <>点击卡片查看该模型的参数、调用示例与返回格式。去 <Key size={11} className="inline -mt-0.5" /> API 管理 创建 Key 后即可使用。</>
            ) : (
              <>Click any card for parameters, example request and response format. Create a key in <Key size={11} className="inline -mt-0.5" /> API Management.</>
            )}
          </p>
        </div>
      </div>

      <ModelDetailsModal model={active} lang={lang} onClose={() => setActive(null)} />
    </div>
  );
};

export default ModelsPlazaPage;
