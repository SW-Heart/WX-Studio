import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Cpu, ImageIcon, Film, Zap, Copy, Check, Search, RefreshCw, Loader2,
  Info, Sparkles, Key, X, Code2, Send, ArrowRight,
} from 'lucide-react';
import ChatGptIcon from '../assets/ChatGPT.svg';
import MidjourneyIcon from '../assets/midjourney.svg';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const authHeaders = (token) => ({ 'Authorization': `Bearer ${token}` });

// ---------- helpers ----------

const describePricing = (pricing, lang) => {
  if (!pricing) return ['未配置'];
  const mode = pricing.mode || 'per_call';
  if (mode === 'per_call') return [`每次调用 ${pricing.cost ?? '?'} 积分`];
  if (mode === 'per_image') return [`每张 ${pricing.cost ?? '?'} 积分（按 n 计算）`];
  if (mode === 'by_mode') {
    return Object.entries(pricing.by_mode || {}).map(([k, v]) => `${k} 模式 · ${v} 积分/次`);
  }
  if (mode === 'tiered_pixels') {
    return (pricing.tiers || []).map(t => {
      const mp = Number(t.max_pixels || 0);
      if (mp === 0) return `其他尺寸 · ${t.cost} 积分/张`;
      const label = mp >= 1_000_000 ? `${(mp / 1_000_000).toFixed(1).replace('.0', '')}M px` : `${mp} px`;
      return `≤ ${label} · ${t.cost} 积分/张`;
    });
  }
  return [JSON.stringify(pricing)];
};

const ModelLogo = ({ modelId, size = 20 }) => {
  if (modelId === 'midjourney') {
    return <img src={MidjourneyIcon} className={`w-${size/4} h-${size/4}`} style={{width: size, height: size}} alt="MJ" />;
  }
  return <img src={ChatGptIcon} className="brightness-0 invert" style={{width: size, height: size}} alt="GPT" />;
};

const sampleBody = (model) => {
  const body = { model: model.id };
  for (const p of model.params_schema || []) {
    if (p.name === 'model') continue;
    if (p.required || p.example !== undefined) {
      let v = p.example ?? p.default;
      if (v === undefined) {
        if (p.name === 'prompt') v = '一只猫坐在书上，影棚灯光';
        else if (p.type === 'number') v = 1;
        else continue;
      }
      body[p.name] = v;
    }
  }
  if (!body.prompt) body.prompt = '一只猫坐在书上，影棚灯光';
  return body;
};

const endpointFor = (model) => model.supports?.video ? '/v1/videos' : '/v1/images/generations';

// ---------- 中文参数描述映射（仅覆盖通用字段，size 等模型特有的由后端返回） ----------
const zhParamDesc = {
  model: '模型 ID（使用卡片上显示的值）',
  prompt: '文本提示词，描述你想生成的内容',
  image: '参考图 URL（支持传入 1 张或多张 HTTPS 链接，用于图生图）',
  n: '生成数量（1-10），每张独立计费',
  quality: '质量参数（可选），透传给上游模型',
  mode: '速度模式，影响价格（见计费规则）',
};

// ---------- Details Modal (Portal) ----------

const ModelDetailsModal = ({ model, lang, apiBase, onClose }) => {
  if (!model) return null;
  const [copied, setCopied] = useState(null);
  const lines = describePricing(model.pricing, lang);
  const origin = apiBase || 'https://aigcog.com';
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-start justify-between shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
              <ModelLogo modelId={model.id} size={24} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">{model.display_name || model.id}</h3>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-[11px] text-white/50 font-mono bg-white/5 px-1.5 py-0.5 rounded">{model.id}</code>
                <button onClick={() => copy('id', model.id)} className="text-white/30 hover:text-white p-1 rounded">
                  {copied === 'id' ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
                {model.supports?.image && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">image</span>}
                {model.supports?.video && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">video</span>}
              </div>
              {model.description && <p className="text-xs text-white/50 mt-2">{model.description}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1.5 rounded hover:bg-white/10 shrink-0"><X size={18} /></button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <section>
            <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-2 flex items-center gap-1.5">
              <Send size={11} /> 调用端点
            </h4>
            <div className="bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 font-mono text-xs text-white flex items-center gap-2">
              <span className="text-green-400 font-bold">POST</span>
              <span className="text-white/90 flex-1 truncate">{ep}</span>
            </div>
          </section>

          <section>
            <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-2 flex items-center gap-1.5">
              <Zap size={11} className="text-[#FF8A3D]" /> 计费
            </h4>
            <ul className="space-y-1.5">
              {lines.map((line, i) => (
                <li key={i} className="text-xs text-white/80 font-mono flex items-start gap-2">
                  <span className="text-[#FF8A3D] mt-0.5">›</span><span>{line}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-2 flex items-center gap-1.5">
              <Code2 size={11} /> 请求参数
            </h4>
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.03] text-white/40 text-[10px] uppercase tracking-wider">
                    <th className="text-left px-3 py-2 font-medium">参数</th>
                    <th className="text-left px-3 py-2 font-medium">类型</th>
                    <th className="text-left px-3 py-2 font-medium">必填</th>
                    <th className="text-left px-3 py-2 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {(model.params_schema || []).map((p) => (
                    <tr key={p.name} className="border-t border-white/5">
                      <td className="px-3 py-2 align-top">
                        <code className="text-white font-mono">{p.name}</code>
                        {p.values && <div className="mt-1 flex flex-wrap gap-1">{p.values.map(v => <span key={v} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/60 font-mono">{v}</span>)}</div>}
                      </td>
                      <td className="px-3 py-2 align-top text-white/70 font-mono text-[11px]">{p.type}</td>
                      <td className="px-3 py-2 align-top">
                        {p.required ? <span className="text-[10px] text-red-400 font-bold">✓</span> : <span className="text-[10px] text-white/30">—</span>}
                      </td>
                      <td className="px-3 py-2 align-top text-white/60 leading-relaxed">
                        {zhParamDesc[p.name] || p.description}
                        {p.default !== undefined && <div className="text-[10px] text-white/40 mt-1">默认值: <code className="text-white/60 font-mono">{String(p.default)}</code></div>}
                        {p.example !== undefined && <div className="text-[10px] text-white/40 mt-1">示例: <code className="text-white/60 font-mono">{String(p.example)}</code></div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-1.5"><Code2 size={11} /> 调用示例</h4>
              <button onClick={() => copy('curl', curl)} className="text-[11px] text-white/50 hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5">
                {copied === 'curl' ? <><Check size={11} className="text-green-400" /> copied</> : <><Copy size={11} /> copy</>}
              </button>
            </div>
            <pre className="bg-[#0a0a0a] border border-white/10 rounded-lg p-3 text-[11px] text-white/80 font-mono overflow-x-auto leading-relaxed whitespace-pre">{curl}</pre>
          </section>

          <section>
            <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-2 flex items-center gap-1.5"><ArrowRight size={11} /> 返回格式</h4>
            <pre className="bg-[#0a0a0a] border border-white/10 rounded-lg p-3 text-[11px] text-white/70 font-mono overflow-x-auto leading-relaxed whitespace-pre">{`{
  "created": 1710000000,
  "model": "${model.id}",
  "data": [ { "url": "https://..." } ],
  "usage": { "quota_cost": ${model.pricing?.cost || 1}, "quota_remaining": 99 }
}`}</pre>
            <p className="text-[10px] text-white/50 mt-2 leading-relaxed">
              ⏱ 该接口为同步调用（服务端内部完成轮询），响应时间取决于模型复杂度，通常 30~180 秒。请设置足够的超时时间（建议 ≥ 300s）。
            </p>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ---------- Card (一行一个) ----------

const ModelCard = ({ model, lang, onOpen }) => {
  const lines = describePricing(model.pricing, lang);

  return (
    <button onClick={() => onOpen(model)}
      className="group w-full text-left rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/15 active:border-white/10 p-4 transition-colors focus:outline-none flex items-center gap-4">
      {/* Logo */}
      <div className="shrink-0 w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
        <ModelLogo modelId={model.id} size={24} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white truncate">{model.display_name || model.id}</h3>
          {model.supports?.image && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">image</span>}
          {model.supports?.video && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">video</span>}
        </div>
        <code className="text-[10px] text-white/30 font-mono">{model.id}</code>
        {model.description && <p className="text-[11px] text-white/50 mt-1 line-clamp-1">{model.description}</p>}
      </div>

      {/* Pricing */}
      <div className="shrink-0 text-right hidden sm:block">
        {lines.slice(0, 2).map((line, i) => (
          <p key={i} className="text-[11px] text-white/60 font-mono">{line}</p>
        ))}
        {lines.length > 2 && <p className="text-[10px] text-white/30">+{lines.length - 2} more</p>}
      </div>

      {/* Arrow */}
      <div className="shrink-0 text-white/20 group-hover:text-white/70 transition-colors">
        <ArrowRight size={16} />
      </div>
    </button>
  );
};

// ---------- Main ----------

const ModelsPlazaPage = ({ token, lang }) => {
  const [models, setModels] = useState([]);
  const [apiBase, setApiBase] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [active, setActive] = useState(null);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/models/public`, { headers: authHeaders(token) });
      if (r.ok) { const j = await r.json(); setModels(j.models || []); setApiBase(j.api_base || ''); }
    } finally { setLoading(false); }
  };

  useEffect(() => { if (token) fetchModels(); }, [token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter(m => {
      if (filter === 'image' && !m.supports?.image) return false;
      if (filter === 'video' && !m.supports?.video) return false;
      if (!q) return true;
      return (m.id + ' ' + (m.display_name || '') + ' ' + (m.description || '')).toLowerCase().includes(q);
    });
  }, [models, search, filter]);

  const stats = useMemo(() => ({
    total: models.length,
    image: models.filter(m => m.supports?.image).length,
    video: models.filter(m => m.supports?.video).length,
  }), [models]);

  const filterBtn = (key, label) => (
    <button onClick={() => setFilter(key)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filter === key ? 'bg-[#FF8A3D] text-white' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'}`}>{label}</button>
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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF8A3D] to-[#E65100] flex items-center justify-center"><Sparkles size={20} className="text-white" /></div>
              <h1 className="text-2xl font-bold text-white">模型广场</h1>
            </div>
            <p className="text-sm text-white/40 ml-[52px]">平台开放的 AI 模型，点击卡片查看参数与调用示例</p>
          </div>
          <button onClick={fetchModels} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60"><RefreshCw size={15} /></button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6 mt-6">
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">可用模型</p>
            <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1"><ImageIcon size={10} className="text-orange-400" /> 图像</p>
            <p className="text-2xl font-bold text-white mt-1">{stats.image}</p>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1"><Film size={10} className="text-red-400" /> 视频</p>
            <p className="text-2xl font-bold text-white mt-1">{stats.video}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2">
            {filterBtn('all', '全部')}
            {filterBtn('image', '图像')}
            {filterBtn('video', '视频')}
          </div>
          <div className="relative flex-1 sm:flex-initial min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索模型..."
              className="h-9 w-full sm:w-64 bg-[#0a0a0a] border border-white/10 rounded-lg pl-9 pr-3 text-xs text-white placeholder:text-white/25 focus:border-[#FF8A3D] focus:outline-none" />
          </div>
        </div>

        {loading ? (
          <div className="py-24 text-center"><Loader2 size={22} className="animate-spin text-[#FF8A3D] mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center text-white/30"><Cpu size={40} className="mx-auto mb-3 opacity-40" /><p className="text-sm">没有匹配的模型</p></div>
        ) : (
          <div className="space-y-3">
            {filtered.map(m => <ModelCard key={m.id} model={m} lang={lang} onOpen={setActive} />)}
          </div>
        )}

        <div className="mt-8 p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-start gap-3">
          <Info size={15} className="text-white/40 shrink-0 mt-0.5" />
          <p className="text-[11px] text-white/50 leading-relaxed">
            点击卡片查看该模型的参数、调用示例与返回格式。去 <Key size={11} className="inline -mt-0.5" /> API 管理 创建 Key 后即可使用。
          </p>
        </div>
      </div>

      <ModelDetailsModal model={active} lang={lang} apiBase={apiBase} onClose={() => setActive(null)} />
    </div>
  );
};

export default ModelsPlazaPage;
