import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Settings2, Power, Save, Eye, EyeOff, AlertCircle, GripVertical,
  Cpu, X, Loader2, Plus, Search, Trash2, RefreshCw, XCircle, CheckCircle2,
  ChevronDown, Check, Image as ImageIcon, Upload, Info, DollarSign, Tag,
  Layers, Zap, Globe2
} from 'lucide-react';
import { ConfirmDialog, AlertDialog } from '../components/ui/Dialog';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const authHeaders = (token, extra = {}) => ({ 'Authorization': `Bearer ${token}`, ...extra });

// ---------- Badge ----------
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

// ---------- 自定义 Select（匹配深色主题） ----------
const Select = ({ value, onChange, options, placeholder = '请选择', disabled = false, renderOption, renderSelected }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`w-full h-9 bg-[#0a0a0a] border rounded-lg px-3 text-xs text-left flex items-center justify-between transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/20'}
          ${open ? 'border-[#FF8A3D]/50' : 'border-white/10'}`}
      >
        <span className={current ? 'text-white truncate' : 'text-white/30'}>
          {current ? (renderSelected ? renderSelected(current) : current.label) : placeholder}
        </span>
        <ChevronDown size={13} className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden shadow-2xl max-h-64 overflow-y-auto">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2
                ${o.value === value ? 'bg-white/[0.04] text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <div className="flex-1 min-w-0">
                {renderOption ? renderOption(o) : o.label}
              </div>
              {o.value === value && <Check size={13} className="text-[#FF8A3D] shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------- 动态计费编辑器 ----------
const PRICING_MODE_OPTIONS = [
  { value: 'per_call', label: '按次调用', desc: '每次调用固定扣费' },
  { value: 'per_image', label: '按图张数', desc: '按 n 参数乘以单价' },
  { value: 'tiered_pixels', label: '按分辨率分级', desc: '不同像素量对应不同单价' },
  { value: 'by_mode', label: '按速度档', desc: 'Midjourney 等多档位模型' },
  { value: 'per_token', label: '按 Token 计费', desc: '对话类模型按输入输出 Token 收费' },
];

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
        <div className="grid grid-cols-[1fr_100px_auto] gap-2 text-[10px] text-white/40 px-1">
          <span>最大像素（0 = 兜底档）</span>
          <span>单价</span>
          <span></span>
        </div>
        {tiers.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr_100px_auto] gap-2 items-center">
            <input type="number" placeholder="4500000" value={t.max_pixels ?? 0}
                   onChange={e => setTier(i, { max_pixels: parseInt(e.target.value || '0', 10) })}
                   className="h-8 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
            <input type="number" placeholder="2" value={t.cost ?? 1}
                   onChange={e => setTier(i, { cost: parseInt(e.target.value || '1', 10) })}
                   className="h-8 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
            <button type="button" onClick={() => rmTier(i)} className="text-white/30 hover:text-red-400 p-1"><X size={14} /></button>
          </div>
        ))}
        <button type="button" onClick={addTier} className="text-[11px] text-white/50 hover:text-white">+ 添加一档</button>
      </div>
    );
  };

  const renderByMode = () => {
    const modes = v.by_mode || { relax: 2, fast: 3, turbo: 5 };
    const labels = { relax: '慢速 Relax', fast: '正常 Fast', turbo: '极速 Turbo' };
    const set = (k, val) => update({ by_mode: { ...modes, [k]: parseInt(val || '0', 10) } });
    return (
      <div className="grid grid-cols-3 gap-2">
        {['relax', 'fast', 'turbo'].map(k => (
          <label key={k} className="text-[11px] text-white/50">
            {labels[k]}
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
        <label className="text-[11px] text-white/50 mb-1 block">计费方式</label>
        <Select
          value={v.mode || 'per_call'}
          onChange={mode => update({ mode })}
          options={PRICING_MODE_OPTIONS}
          renderOption={(o) => (
            <div>
              <div className="text-xs">{o.label}</div>
              <div className="text-[10px] text-white/40 mt-0.5">{o.desc}</div>
            </div>
          )}
        />
      </div>

      {(v.mode === 'per_call' || v.mode === 'per_image' || !v.mode) && (
        <div>
          <label className="text-[11px] text-white/50 mb-1 block">单价（积分）</label>
          <input type="number" value={v.cost ?? 1} onChange={e => update({ cost: parseInt(e.target.value || '1', 10) })}
                 className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded px-3 text-xs text-white" />
        </div>
      )}
      {v.mode === 'per_token' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-white/50 mb-1 block">输入 $/M Tokens</label>
            <input type="number" step="0.01" value={v.input_m_cost ?? 0} onChange={e => update({ input_m_cost: parseFloat(e.target.value || '0') })}
                   className="w-full h-8 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
          </div>
          <div>
            <label className="text-[11px] text-white/50 mb-1 block">输出 $/M Tokens</label>
            <input type="number" step="0.01" value={v.output_m_cost ?? 0} onChange={e => update({ output_m_cost: parseFloat(e.target.value || '0') })}
                   className="w-full h-8 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
          </div>
          <div>
            <label className="text-[11px] text-white/50 mb-1 block">缓存写入 $/M</label>
            <input type="number" step="0.01" value={v.cache_write_m_cost ?? 0} onChange={e => update({ cache_write_m_cost: parseFloat(e.target.value || '0') })}
                   className="w-full h-8 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
          </div>
          <div>
            <label className="text-[11px] text-white/50 mb-1 block">缓存命中 $/M</label>
            <input type="number" step="0.01" value={v.cache_hit_m_cost ?? 0} onChange={e => update({ cache_hit_m_cost: parseFloat(e.target.value || '0') })}
                   className="w-full h-8 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] text-white/50 mb-1 block">汇率（$1 = ? 积分）</label>
            <input type="number" value={v.exchange_rate ?? 100} onChange={e => update({ exchange_rate: parseInt(e.target.value || '100', 10) })}
                   className="w-full h-8 bg-[#0a0a0a] border border-white/10 rounded px-2 text-xs text-white" />
          </div>
        </div>
      )}
      {v.mode === 'tiered_pixels' && renderTiers()}
      {v.mode === 'by_mode' && renderByMode()}
    </div>
  );
};

// ---------- JSON 字段编辑器（textarea + 实时校验） ----------
const JsonField = ({ value, onChange, placeholder }) => {
  const [text, setText] = useState(() => {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value, null, 2); } catch { return ''; }
  });
  const [error, setError] = useState(null);

  // 当外部 value 变化（例如切换 adapter 重置 config）时同步本地 text
  useEffect(() => {
    if (value === undefined || value === null || value === '') {
      setText(''); setError(null); return;
    }
    if (typeof value === 'string') {
      setText(value);
      try { JSON.parse(value); setError(null); } catch (e) { setError(e.message); }
    } else {
      try { setText(JSON.stringify(value, null, 2)); setError(null); }
      catch { setText(''); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  const handleChange = (e) => {
    const v = e.target.value;
    setText(v);
    if (!v.trim()) { setError(null); onChange(undefined); return; }
    try {
      const parsed = JSON.parse(v);
      setError(null);
      onChange(parsed);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={handleChange}
        placeholder={placeholder || '{\n  "key": "value"\n}'}
        spellCheck={false}
        rows={Math.max(4, Math.min(12, text.split('\n').length))}
        className={`w-full bg-[#0a0a0a] border rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none transition-colors resize-y leading-relaxed ${error ? 'border-red-500/50' : 'border-white/10 focus:border-[#FF8A3D]/50'}`}
      />
      {error && <p className="text-[10px] text-red-400 mt-1">JSON 解析错误：{error}</p>}
    </div>
  );
};

// ---------- Adapter 配置字段编辑器 ----------
const GROUP_META = {
  upstream: { title: '上游对接', icon: <Globe2 size={12} />, desc: '指定上游服务的模型 ID、请求地址等核心参数' },
  size: { title: '尺寸行为', icon: <Layers size={12} />, desc: '控制尺寸/画幅参数如何传给上游' },
  advanced: { title: '高级选项', icon: <Zap size={12} />, desc: '超时、并发等调优项，可使用默认值' },
  default: { title: '其他配置', icon: <Settings2 size={12} />, desc: '' },
};

const ConfigEditor = ({ schema, value, onChange }) => {
  const fields = (schema && schema.config_fields) || [];
  if (!fields.length) {
    return <p className="text-[11px] text-white/30">此 adapter 无需额外配置</p>;
  }
  const setField = (k, val) => onChange({ ...(value || {}), [k]: val });

  // 按 group 分组
  const groups = {};
  fields.forEach(f => {
    const g = f.group || 'default';
    if (!groups[g]) groups[g] = [];
    groups[g].push(f);
  });

  const order = ['upstream', 'size', 'advanced', 'default'];
  const sortedGroups = order.filter(g => groups[g]);

  const renderField = (f) => {
    const v = (value || {})[f.key];
    const display = v === undefined || v === null ? '' : v;
    const label = f.label_zh || f.key;
    const help = f.help_zh || f.help;

    return (
      <div key={f.key}>
        <label className="text-[11px] text-white/70 mb-1 flex items-center gap-1.5">
          <span className="font-medium">{label}</span>
          {f.required && <span className="text-red-400/80">*</span>}
          <code className="text-[10px] text-white/30 font-mono">{f.key}</code>
        </label>
        {f.type === 'enum' ? (
          <Select
            value={display || f.default || ''}
            onChange={val => setField(f.key, val)}
            options={(f.options || []).map(o => ({ value: o, label: o }))}
            placeholder="请选择"
          />
        ) : f.type === 'boolean' ? (
          <label className="flex items-center gap-2 h-9 px-3 rounded-lg bg-[#0a0a0a] border border-white/10 cursor-pointer hover:border-white/20 transition-colors">
            <input type="checkbox" checked={Boolean(v ?? f.default)} onChange={e => setField(f.key, e.target.checked)} className="accent-[#FF8A3D]" />
            <span className="text-xs text-white/80">{v ?? f.default ? '已启用' : '未启用'}</span>
          </label>
        ) : f.type === 'number' ? (
          <input type="number" value={display} placeholder={String(f.placeholder ?? f.default ?? '')}
                 onChange={e => setField(f.key, e.target.value === '' ? undefined : Number(e.target.value))}
                 className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 text-xs text-white focus:border-[#FF8A3D]/50 outline-none transition-colors" />
        ) : f.type === 'json' ? (
          <JsonField value={v} onChange={val => setField(f.key, val)} placeholder={f.placeholder} />
        ) : (
          <input type="text" value={display} placeholder={String(f.placeholder ?? f.default ?? '')}
                 onChange={e => setField(f.key, e.target.value)}
                 className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 text-xs text-white font-mono focus:border-[#FF8A3D]/50 outline-none transition-colors" />
        )}
        {help && <p className="text-[10px] text-white/40 mt-1 leading-relaxed">{help}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {sortedGroups.map(g => {
        const meta = GROUP_META[g] || GROUP_META.default;
        return (
          <div key={g}>
            <div className="flex items-center gap-1.5 mb-2 text-[11px] text-white/50">
              <span className="text-[#FF8A3D]">{meta.icon}</span>
              <span className="font-bold">{meta.title}</span>
              {meta.desc && <span className="text-white/30">· {meta.desc}</span>}
            </div>
            <div className="space-y-3 pl-1">
              {groups[g].map(renderField)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------- Logo 上传 ----------
const LogoUpload = ({ value, onChange, token, onError }) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      onError?.('Logo 不能超过 2MB');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: authHeaders(token),
        body: fd,
      });
      const j = await res.json();
      if (!res.ok || !j.url) throw new Error(j.detail || '上传失败');
      onChange(j.url);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-xl bg-[#0a0a0a] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
        {value ? (
          <img src={value} alt="logo" className="w-full h-full object-cover" />
        ) : uploading ? (
          <Loader2 size={18} className="animate-spin text-white/40" />
        ) : (
          <ImageIcon size={20} className="text-white/20" />
        )}
      </div>
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="h-8 px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Upload size={12} /> {value ? '更换 Logo' : '上传 Logo'}
          </button>
          {value && (
            <button type="button" onClick={() => onChange('')}
                    className="h-8 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/50 hover:text-red-400 hover:border-red-500/30">
              移除
            </button>
          )}
        </div>
        <p className="text-[10px] text-white/40">建议 512×512 以上正方形，PNG/JPG/WebP/SVG，≤ 2MB</p>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" className="hidden"
               onChange={e => handleFile(e.target.files?.[0])} />
      </div>
    </div>
  );
};

// ---------- 「上架到」开关 ----------
const PUBLISH_TARGETS = [
  { key: 'plaza', label: '模型广场', desc: '用户可在「模型广场」查看和复制调用示例' },
  { key: 'quick_create', label: '快速创作', desc: '出现在首页快速创作的模型选择器里' },
  { key: 'canvas', label: '无限画布', desc: '出现在画布模式的模型选择器里' },
];

const PublishToggle = ({ value, onChange }) => {
  const list = Array.isArray(value) ? value : ['plaza'];
  const toggle = (key) => {
    if (list.includes(key)) onChange(list.filter(k => k !== key));
    else onChange([...list, key]);
  };
  return (
    <div className="space-y-1.5">
      {PUBLISH_TARGETS.map(t => {
        const active = list.includes(t.key);
        return (
          <button
            type="button"
            key={t.key}
            onClick={() => toggle(t.key)}
            className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-start gap-2.5
              ${active ? 'bg-[#FF8A3D]/5 border-[#FF8A3D]/40' : 'bg-white/[0.02] border-white/10 hover:border-white/20'}`}
          >
            <div className={`w-4 h-4 rounded border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors
              ${active ? 'bg-[#FF8A3D] border-[#FF8A3D]' : 'border-white/30'}`}>
              {active && <Check size={10} className="text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white">{t.label}</div>
              <div className="text-[10px] text-white/40 mt-0.5">{t.desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ---------- 模型编辑弹窗 ----------
const ModelModal = ({ isOpen, onClose, token, lang, adapters, initial, onSaved }) => {
  const [form, setForm] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alertData, setAlertData] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    if (isOpen) {
      // 预留：后续可以改成 undefined 让后端默认值逻辑接管
    }
    if (initial) {
      setForm({
        ...initial,
        published_to: initial.published_to || ['plaza', 'quick_create', 'canvas'],
      });
    } else {
      setForm({
        id: '',
        adapter_type: Object.keys(adapters || {})[0] || 'ttapi-image',
        upstream_api_key: '',
        display_name: '',
        logo_url: '',
        description: '',
        enabled: true,
        supports: { image: true, video: false },
        pricing: { mode: 'per_call', cost: 1 },
        config: {},
        published_to: ['plaza', 'quick_create', 'canvas'],
      });
    }
    setShowKey(false);
  }, [isOpen, initial, adapters]);

  if (!isOpen || !form) return null;

  const schema = adapters?.[form.adapter_type];
  const isEdit = Boolean(initial);

  const adapterOptions = Object.entries(adapters || {}).map(([k, meta]) => ({
    value: k,
    label: meta.display_name_zh || meta.display_name || k,
    key: k,
    meta,
  }));

  const submit = async () => {
    if (!form.id) {
      setAlertData({ title: '提示', message: '请输入模型 ID', type: 'error' });
      return;
    }
    if (!form.adapter_type) {
      setAlertData({ title: '提示', message: '请选择适配器类型', type: 'error' });
      return;
    }
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
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setAlertData({ title: '保存失败', message: e.detail || '保存失败', type: 'error' });
        return;
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setAlertData({ title: '发生错误', message: err.message, type: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-5xl shadow-2xl max-h-[92vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Cpu size={16} className="text-[#FF8A3D]" />
            {isEdit ? '编辑模型' : '新增模型'}
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1.5 rounded hover:bg-white/10"><X size={18} /></button>
        </div>

        {/* Body（scrollable） */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
            {/* 左列：基础信息 + 展示 */}
            <div className="space-y-5">
              {/* 基础信息 */}
              <section>
                <div className="text-xs font-bold text-white/80 mb-3 flex items-center gap-1.5">
                  <Tag size={13} className="text-[#FF8A3D]" /> 基础信息
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-white/70 mb-1 block">
                      模型 ID <span className="text-red-400">*</span>
                      <span className="text-[10px] text-white/40 ml-2">用户调用 API 时传的 model 字段，创建后不可修改</span>
                    </label>
                    <input value={form.id || ''} disabled={isEdit}
                           onChange={e => setForm({ ...form, id: e.target.value })}
                           placeholder="例如 gpt-image-2 / midjourney-fast / veo3.1-4k"
                           className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 text-xs text-white font-mono disabled:opacity-50 focus:border-[#FF8A3D]/50 outline-none transition-colors" />
                  </div>

                  <div>
                    <label className="text-[11px] text-white/70 mb-1 block">
                      展示名称
                      <span className="text-[10px] text-white/40 ml-2">在模型广场 / 快速创作里展示的中文名</span>
                    </label>
                    <input value={form.display_name || ''}
                           onChange={e => setForm({ ...form, display_name: e.target.value })}
                           placeholder={form.id ? `例如 ${form.id} 的中文名` : '例如 GPT Image 2 专业版'}
                           className="w-full h-9 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 text-xs text-white focus:border-[#FF8A3D]/50 outline-none transition-colors" />
                  </div>

                  <div>
                    <label className="text-[11px] text-white/70 mb-1 block">Logo</label>
                    <LogoUpload value={form.logo_url} onChange={logo_url => setForm({ ...form, logo_url })}
                                token={token} onError={msg => setAlertData({ title: '上传失败', message: msg, type: 'error' })} />
                  </div>

                  <div>
                    <label className="text-[11px] text-white/70 mb-1 block">简介</label>
                    <textarea value={form.description || ''} rows={2}
                           onChange={e => setForm({ ...form, description: e.target.value })}
                           placeholder="简要介绍该模型的能力和使用场景"
                           className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-[#FF8A3D]/50 outline-none transition-colors resize-none" />
                  </div>
                </div>
              </section>

              {/* 适配器 */}
              <section>
                <div className="text-xs font-bold text-white/80 mb-3 flex items-center gap-1.5">
                  <Settings2 size={13} className="text-[#FF8A3D]" /> 适配器
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-white/70 mb-1 flex items-center gap-1">
                      <span>适配器类型</span>
                      <span className="text-red-400">*</span>
                      <span className="group relative inline-flex ml-1">
                        <Info size={11} className="text-white/30 cursor-help" />
                        <span className="hidden group-hover:block absolute left-5 top-0 w-72 p-2.5 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl text-[10px] text-white/70 z-10 leading-relaxed">
                          适配器决定如何把我们的请求翻译成上游接口协议。协议一致（如都是 OpenAI 兼容的 /v1/images/generations）可以共用一个适配器。不同上游的字段名、返回结构、轮询机制不一样，需要选对应的适配器。
                        </span>
                      </span>
                    </label>
                    <Select
                      value={form.adapter_type}
                      onChange={adapter_type => setForm({ ...form, adapter_type, config: {} })}
                      options={adapterOptions}
                      renderOption={(o) => (
                        <div>
                          <div className="flex items-center gap-2">
                            <code className="text-[10px] text-white/50 font-mono">{o.key}</code>
                            <span className="text-xs text-white">{o.meta?.display_name_zh || o.meta?.display_name}</span>
                          </div>
                          {o.meta?.description_zh && (
                            <div className="text-[10px] text-white/40 mt-1 leading-relaxed">{o.meta.description_zh}</div>
                          )}
                        </div>
                      )}
                      renderSelected={(o) => (
                        <span className="flex items-center gap-2">
                          <code className="text-[10px] text-white/40 font-mono">{o.key}</code>
                          <span>{o.meta?.display_name_zh || o.meta?.display_name}</span>
                        </span>
                      )}
                    />
                    {schema?.description_zh && (
                      <p className="text-[10px] text-white/40 mt-1.5 leading-relaxed">{schema.description_zh}</p>
                    )}
                    {schema?.supports && (
                      <div className="flex gap-1 mt-2">
                        {schema.supports.image && <Badge tone="info">图像</Badge>}
                        {schema.supports.video && <Badge tone="info">视频</Badge>}
                        {schema.supports.text && <Badge tone="info">对话</Badge>}
                        {schema.supports.async && <Badge tone="warn">异步</Badge>}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] text-white/70 mb-1 block">上游 API 密钥</label>
                    <div className="flex gap-1.5">
                      <input type={showKey ? 'text' : 'password'} value={form.upstream_api_key || ''}
                             onChange={e => setForm({ ...form, upstream_api_key: e.target.value })}
                             placeholder="sk-... 或 TT-API-KEY"
                             className="flex-1 h-9 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 text-xs text-white font-mono focus:border-[#FF8A3D]/50 outline-none transition-colors" />
                      <button type="button" onClick={() => setShowKey(s => !s)}
                              className="px-2.5 rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white hover:bg-white/10">
                        {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* 上架 */}
              <section>
                <div className="text-xs font-bold text-white/80 mb-3 flex items-center gap-1.5">
                  <Globe2 size={13} className="text-[#FF8A3D]" /> 上架位置
                </div>
                <PublishToggle value={form.published_to} onChange={published_to => setForm({ ...form, published_to })} />
              </section>

              {/* 状态 + 能力 */}
              <section>
                <div className="text-xs font-bold text-white/80 mb-3 flex items-center gap-1.5">
                  <Power size={13} className="text-[#FF8A3D]" /> 状态与能力
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[#0a0a0a] border border-white/10 cursor-pointer hover:border-white/20">
                    <input type="checkbox" checked={Boolean(form.enabled)} onChange={e => setForm({ ...form, enabled: e.target.checked })} className="accent-[#FF8A3D]" />
                    <span className="text-xs text-white/80">启用</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[#0a0a0a] border border-white/10 cursor-pointer hover:border-white/20">
                    <input type="checkbox" checked={Boolean(form.supports?.image)} onChange={e => setForm({ ...form, supports: { ...(form.supports || {}), image: e.target.checked } })} className="accent-[#FF8A3D]" />
                    <span className="text-xs text-white/80">图像</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[#0a0a0a] border border-white/10 cursor-pointer hover:border-white/20">
                    <input type="checkbox" checked={Boolean(form.supports?.video)} onChange={e => setForm({ ...form, supports: { ...(form.supports || {}), video: e.target.checked } })} className="accent-[#FF8A3D]" />
                    <span className="text-xs text-white/80">视频</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[#0a0a0a] border border-white/10 cursor-pointer hover:border-white/20">
                    <input type="checkbox" checked={Boolean(form.supports?.text)} onChange={e => setForm({ ...form, supports: { ...(form.supports || {}), text: e.target.checked } })} className="accent-[#FF8A3D]" />
                    <span className="text-xs text-white/80">对话</span>
                  </label>
                </div>
              </section>
            </div>

            {/* 右列：适配器配置 + 计费 */}
            <div className="space-y-5">
              <section>
                <div className="text-xs font-bold text-white/80 mb-3 flex items-center gap-1.5">
                  <Settings2 size={13} className="text-[#FF8A3D]" /> 适配器配置
                </div>
                <div className="border border-white/10 rounded-xl p-4 bg-black/20">
                  <ConfigEditor schema={schema} value={form.config} onChange={config => setForm({ ...form, config })} />
                </div>
              </section>

              <section>
                <div className="text-xs font-bold text-white/80 mb-3 flex items-center gap-1.5">
                  <DollarSign size={13} className="text-[#FF8A3D]" /> 计费规则
                </div>
                <div className="border border-white/10 rounded-xl p-4 bg-black/20">
                  <PricingEditor value={form.pricing} onChange={pricing => setForm({ ...form, pricing })} />
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3 shrink-0 bg-[#0e0e0e]/60">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl bg-white/5 text-white/80 text-sm hover:bg-white/10">
            取消
          </button>
          <button onClick={submit} disabled={saving}
                  className="flex-1 h-10 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存
          </button>
        </div>

        <AlertDialog
          isOpen={!!alertData}
          onClose={() => setAlertData(null)}
          title={alertData?.title}
          message={alertData?.message}
          type={alertData?.type}
        />
      </div>
    </div>
  );
};

// ---------- 列表主体 ----------
const AdminModelsPage = ({ token, lang }) => {
  const [models, setModels] = useState([]);
  const [adapters, setAdapters] = useState({});
  const [loading, setLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [alertData, setAlertData] = useState(null);

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
    setConfirmData({
      title: '删除模型',
      message: `确认删除模型 "${m.id}"？\n已使用此模型的 API Key 将无法继续调用。`,
      onConfirm: async () => {
        const res = await fetch(`${API_BASE_URL}/api/admin/models/${m.id}`, { method: 'DELETE', headers: authHeaders(token) });
        if (res.ok) fetchAll();
      }
    });
  };

  const handleDragStart = (e, index) => { e.dataTransfer.setData('index', index); };
  const handleDragOver = (e) => { e.preventDefault(); };
  const handleDrop = async (e, targetIndex) => {
    const sourceIndex = parseInt(e.dataTransfer.getData('index'));
    if (sourceIndex === targetIndex) return;
    const newModels = [...models];
    const [moved] = newModels.splice(sourceIndex, 1);
    newModels.splice(targetIndex, 0, moved);
    setModels(newModels);
    try {
      await fetch(`${API_BASE_URL}/api/admin/models/reorder`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(newModels.map(m => m.id)),
      });
    } catch (err) { console.error('Reorder failed:', err); }
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
              <h1 className="text-2xl font-bold text-white">模型管理</h1>
            </div>
            <p className="text-sm text-white/40 ml-[52px]">
              配置对外开放的模型；协议一致的模型直接配置即可生效
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60"><RefreshCw size={15} /></button>
            <button onClick={() => { setEditing(null); setShowEdit(true); }}
                    className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90">
              <Plus size={14} /> 新增模型
            </button>
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/40 border-b border-white/5">
                  <th className="text-left px-4 py-2">模型</th>
                  <th className="text-left px-4 py-2">适配器</th>
                  <th className="text-left px-4 py-2">能力</th>
                  <th className="text-left px-4 py-2">上架</th>
                  <th className="text-left px-4 py-2">计费</th>
                  <th className="text-left px-4 py-2">状态</th>
                  <th className="text-right px-4 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10"><Loader2 size={18} className="animate-spin text-[#FF8A3D] mx-auto" /></td></tr>
                ) : models.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-white/30">尚未配置模型。点击「新增模型」开始。</td></tr>
                ) : models.map((m, idx) => {
                  const publishedTo = m.published_to || ['plaza', 'quick_create', 'canvas'];
                  return (
                  <tr
                    key={m.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, idx)}
                    className="border-b border-white/5 hover:bg-white/[0.02] cursor-move active:bg-white/[0.05]"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <GripVertical size={14} className="text-white/20 shrink-0" />
                        {m.logo_url ? (
                          <img src={m.logo_url} alt="" className="w-7 h-7 rounded-md object-cover border border-white/10 shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                            <Cpu size={12} className="text-white/40" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-white font-medium truncate">{m.display_name || m.id}</div>
                          <div className="text-[10px] text-white/40 font-mono truncate">{m.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><Badge tone="info">{m.adapter_type}</Badge></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {m.supports?.image && <Badge>图像</Badge>}
                        {m.supports?.video && <Badge>视频</Badge>}
                        {m.supports?.text && <Badge>对话</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {publishedTo.includes('plaza') && <Badge tone="orange">广场</Badge>}
                        {publishedTo.includes('quick_create') && <Badge tone="orange">快速</Badge>}
                        {publishedTo.includes('canvas') && <Badge tone="orange">画布</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-white/70 font-mono text-[11px]">
                        {m.pricing?.mode || 'per_call'}:{' '}
                        {m.pricing?.mode === 'by_mode'
                          ? Object.entries(m.pricing.by_mode || {}).map(([k, v]) => `${k}=${v}`).join(' / ')
                          : m.pricing?.mode === 'tiered_pixels'
                            ? (m.pricing.tiers || []).map(t => `${t.max_pixels || '∞'}→${t.cost}`).join(' / ')
                            : m.pricing?.mode === 'per_token'
                              ? `In:$${m.pricing.input_m_cost}/M Out:$${m.pricing.output_m_cost}/M`
                              : (m.pricing?.cost ?? '?')}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {m.enabled ? <Badge tone="success">启用</Badge> : <Badge tone="danger">停用</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => { setEditing(m); setShowEdit(true); }}
                                className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white" title="编辑">
                          <Settings2 size={13} />
                        </button>
                        <button onClick={() => toggleEnabled(m)}
                                className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white" title={m.enabled ? '停用' : '启用'}>
                          {m.enabled ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                        </button>
                        <button onClick={() => remove(m)}
                                className="p-1.5 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400" title="删除">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-5 text-[11px] text-white/40 leading-relaxed max-w-3xl flex items-start gap-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          协议一致的模型（比如 TTAPI 系列、Tuzi 系列、OpenAI 兼容）直接在这里配置即可启用；若上游协议结构不同（字段名/返回结构/轮询机制），需要在 backend/api_gateway/adapters/ 下新增一个 adapter 类并注册到 REGISTRY。
        </p>
      </div>

      <ModelModal
        isOpen={showEdit}
        onClose={() => { setShowEdit(false); setEditing(null); }}
        token={token} lang={lang} adapters={adapters} initial={editing}
        onSaved={fetchAll}
      />

      <ConfirmDialog
        isOpen={!!confirmData}
        onClose={() => setConfirmData(null)}
        onConfirm={confirmData?.onConfirm || (() => {})}
        title={confirmData?.title}
        message={confirmData?.message}
        type="danger"
      />

      <AlertDialog
        isOpen={!!alertData}
        onClose={() => setAlertData(null)}
        title={alertData?.title}
        message={alertData?.message}
        type={alertData?.type}
      />
    </div>
  );
};

export default AdminModelsPage;
