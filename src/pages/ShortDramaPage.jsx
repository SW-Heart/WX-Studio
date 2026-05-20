import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft,
  Clapperboard,
  Film,
  Loader2,
  MessageSquare,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  StopCircle,
  X,
} from 'lucide-react';

import { API_BASE_URL } from '../config/app';
import { toSecureUrl } from '../utils/media';

// ==========================================
// 🌐 API helpers
// ==========================================
const drama = {
  async meta(token) {
    const r = await fetch(`${API_BASE_URL}/api/drama/meta`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`meta ${r.status}`);
    return r.json();
  },
  async list(token) {
    const r = await fetch(`${API_BASE_URL}/api/drama/jobs?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`list ${r.status}`);
    const data = await r.json();
    return data.items || [];
  },
  async get(token, jobId) {
    const r = await fetch(`${API_BASE_URL}/api/drama/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`get ${r.status}`);
    return r.json();
  },
  async create(token, body) {
    const r = await fetch(`${API_BASE_URL}/api/drama/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`create ${r.status}: ${t}`);
    }
    return r.json();
  },
  async cancel(token, jobId) {
    const r = await fetch(`${API_BASE_URL}/api/drama/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`cancel ${r.status}`);
    return r.json();
  },
};

// ==========================================
// 🎨 状态映射
// ==========================================
const STATUS_LABEL = {
  queued: { zh: '排队中', en: 'Queued', cls: 'bg-white/10 text-white/70' },
  writing: { zh: '编剧中...', en: 'Writing...', cls: 'bg-blue-500/20 text-blue-300' },
  casting: { zh: '角色生成中...', en: 'Casting...', cls: 'bg-purple-500/20 text-purple-300' },
  storyboarding: { zh: '分镜设计中...', en: 'Storyboarding...', cls: 'bg-violet-500/20 text-violet-300' },
  decomposing: { zh: '镜头解析中...', en: 'Decomposing...', cls: 'bg-fuchsia-500/20 text-fuchsia-300' },
  framing: { zh: '首帧生成中...', en: 'Framing...', cls: 'bg-amber-500/20 text-amber-300' },
  filming: { zh: '视频生成中...', en: 'Filming...', cls: 'bg-orange-500/20 text-orange-300' },
  composing: { zh: '剪辑成片中...', en: 'Composing...', cls: 'bg-emerald-500/20 text-emerald-300' },
  awaiting_confirm: { zh: '等待确认', en: 'Awaiting Confirm', cls: 'bg-yellow-500/20 text-yellow-300' },
  done: { zh: '已完成', en: 'Done', cls: 'bg-green-500/30 text-green-300' },
  failed: { zh: '失败', en: 'Failed', cls: 'bg-red-500/30 text-red-300' },
  canceled: { zh: '已取消', en: 'Canceled', cls: 'bg-gray-500/30 text-gray-300' },
};

const isRunning = (status) =>
  ['queued', 'writing', 'casting', 'storyboarding', 'decomposing', 'framing', 'filming', 'composing', 'awaiting_confirm'].includes(status);

// current_step 中文映射
const STEP_LABEL = {
  'queued': { zh: '排队中', en: 'Queued' },
  'writing script': { zh: '正在编写剧本...', en: 'Writing script...' },
  'extracting characters': { zh: '正在提取角色...', en: 'Extracting characters...' },
  'generating portraits': { zh: '正在生成角色立绘...', en: 'Generating portraits...' },
  'designing storyboard': { zh: '正在设计分镜...', en: 'Designing storyboard...' },
  'decomposing shots': { zh: '正在解析镜头细节...', en: 'Decomposing shots...' },
  'rendering first frames': { zh: '正在生成首帧画面...', en: 'Rendering first frames...' },
  'rendering video clips': { zh: '正在生成视频片段...', en: 'Rendering video clips...' },
  'composing final video': { zh: '正在剪辑成片...', en: 'Composing final video...' },
  'done': { zh: '已完成', en: 'Done' },
  'failed': { zh: '失败', en: 'Failed' },
  'awaiting:script_ready': { zh: '请确认并可修改剧本', en: 'Please review & edit script' },
  'awaiting:characters_ready': { zh: '请确认并可修改角色图Prompt', en: 'Please review & edit character prompts' },
  'awaiting:portraits_ready': { zh: '请确认角色立绘', en: 'Please review character portraits' },
  'awaiting:storyboard_ready': { zh: '请确认并可修改分镜描述', en: 'Please review & edit storyboard' },
};

const formatTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleString();
};

// ==========================================
// 📦 Main Page
// ==========================================
const ShortDramaPage = ({ token, lang = 'zh' }) => {
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const refreshList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const items = await drama.list(token);
      setJobs(items);
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  // 首次加载 meta + list
  useEffect(() => {
    if (!token) return;
    drama.meta(token).then(setMeta).catch(() => {});
    refreshList();
  }, [token, refreshList]);

  // 列表自动轮询（只在没选中任务时刷列表）
  useEffect(() => {
    if (!token || selectedJobId) return;
    const t = setInterval(refreshList, 5000);
    return () => clearInterval(t);
  }, [token, selectedJobId, refreshList]);

  if (!token) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center text-white/50">
          {lang === 'zh' ? '请先登录后使用短剧创作' : 'Please log in to use Short Drama'}
        </div>
      </div>
    );
  }

  if (selectedJobId) {
    return (
      <DramaJobDetail
        token={token}
        lang={lang}
        jobId={selectedJobId}
        onBack={() => {
          setSelectedJobId(null);
          refreshList();
        }}
      />
    );
  }

  return (
    <>
      <Helmet>
        <title>{lang === 'zh' ? 'OG AI - 短剧创作' : 'OG AI - Short Drama'}</title>
      </Helmet>
      <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1 flex items-center gap-2">
              <Film className="text-[#FF8A3D]" size={28} />
              {lang === 'zh' ? '短剧创作' : 'Short Drama'}
            </h1>
            <p className="text-white/50 text-sm">
              {lang === 'zh'
                ? '一句话生成完整短剧：自动写剧本、设计角色、分镜、配音视频'
                : 'One sentence to a full short drama: auto script, casting, storyboard, video.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={refreshList}
              className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition flex items-center gap-1.5 text-sm"
              title={lang === 'zh' ? '刷新' : 'Refresh'}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">{lang === 'zh' ? '刷新' : 'Refresh'}</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg bg-gradient-to-br from-[#FF8A3D] to-[#E65100] hover:shadow-lg hover:shadow-[#FF8A3D]/30 text-white transition flex items-center gap-1.5 text-sm font-medium"
            >
              <Plus size={16} />
              {lang === 'zh' ? '新建短剧' : 'New Drama'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {jobs.length === 0 && !loading ? (
          <EmptyState lang={lang} onCreate={() => setShowCreate(true)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                lang={lang}
                onOpen={() => setSelectedJobId(j.id)}
              />
            ))}
          </div>
        )}

        {showCreate && (
          <CreateModal
            token={token}
            lang={lang}
            meta={meta}
            onClose={() => setShowCreate(false)}
            onCreated={(jobId) => {
              setShowCreate(false);
              refreshList();
              setSelectedJobId(jobId);
            }}
          />
        )}
      </div>
    </>
  );
};

// ==========================================
// 🟪 Empty
// ==========================================
const EmptyState = ({ lang, onCreate }) => (
  <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-12 text-center">
    <Clapperboard size={48} className="mx-auto mb-4 text-white/20" />
    <p className="text-white/60 mb-2">
      {lang === 'zh' ? '暂无短剧任务' : 'No drama jobs yet'}
    </p>
    <p className="text-white/30 text-sm mb-6">
      {lang === 'zh' ? '把脑子里的故事变成视频，只要一句话' : 'Turn an idea into a video with one sentence'}
    </p>
    <button
      onClick={onCreate}
      className="px-5 py-2.5 rounded-lg bg-gradient-to-br from-[#FF8A3D] to-[#E65100] text-white font-medium inline-flex items-center gap-2"
    >
      <Sparkles size={16} />
      {lang === 'zh' ? '开始创作' : 'Start Creating'}
    </button>
  </div>
);

// ==========================================
// 🟩 Job Card (列表项)
// ==========================================
const JobCard = ({ job, lang, onOpen }) => {
  const status = STATUS_LABEL[job.status] || { zh: job.status, en: job.status, cls: 'bg-white/10 text-white/70' };
  const idea = (job.inputs?.idea || '').trim();
  const finalUrl = job.final_video_url;

  return (
    <div
      onClick={onOpen}
      className="group bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden hover:border-white/30 hover:bg-white/[0.05] transition cursor-pointer"
    >
      <div className="aspect-video bg-black/40 relative">
        {finalUrl ? (
          <video
            src={toSecureUrl(finalUrl)}
            className="w-full h-full object-cover"
            preload="metadata"
            muted
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20">
            <Film size={36} />
          </div>
        )}
        <div className={`absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full ${status.cls}`}>
          {status[lang]}
        </div>
        {isRunning(job.status) && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-[#FF8A3D] to-[#E65100] transition-all"
              style={{ width: `${job.progress || 0}%` }}
            />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm text-white/80 line-clamp-2 leading-snug min-h-[2.5rem]">
          {idea || (lang === 'zh' ? '(无 idea 描述)' : '(no idea)')}
        </p>
        <div className="flex items-center justify-between mt-2 text-[11px] text-white/40">
          <span>{formatTime(job.created_at)}</span>
          {isRunning(job.status) ? (
            <span>{job.progress || 0}%</span>
          ) : job.status === 'done' ? (
            <span className="text-green-400 inline-flex items-center gap-1">
              <PlayCircle size={12} />
              {lang === 'zh' ? '查看' : 'View'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 🟦 Create Modal
// ==========================================
const STYLE_PRESETS = [
  { id: 'realistic', label: { zh: '写实电影感', en: 'Cinematic realistic' }, value: 'Photorealistic, cinematic lighting, shallow depth of field' },
  { id: 'anime', label: { zh: '动漫风格', en: 'Anime' }, value: 'Anime style, vivid colors, expressive eyes' },
  { id: 'cartoon', label: { zh: '卡通插画', en: 'Cartoon' }, value: 'Cartoon style, flat shading, friendly tone' },
  { id: '3d', label: { zh: '3D 动画', en: '3D animation' }, value: '3D animated film, Pixar-like, soft volumetric lighting' },
  { id: 'noir', label: { zh: '黑色电影', en: 'Film noir' }, value: 'Black and white film noir, hard shadows, vintage 1950s' },
];

const CreateModal = ({ token, lang, meta, onClose, onCreated }) => {
  const [idea, setIdea] = useState('');
  const [requirement, setRequirement] = useState('');
  const [style, setStyle] = useState(STYLE_PRESETS[0].value);
  const [mode, setMode] = useState('auto');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [shotCount, setShotCount] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const aspectRatios = meta?.aspect_ratios || {
    '9:16': { label_zh: '竖屏 9:16', label_en: 'Portrait 9:16' },
    '16:9': { label_zh: '横屏 16:9', label_en: 'Landscape 16:9' },
    '1:1': { label_zh: '方形 1:1', label_en: 'Square 1:1' },
  };

  const submit = async () => {
    if (!idea.trim()) {
      setErr(lang === 'zh' ? '请输入创意' : 'Please enter your idea');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await drama.create(token, {
        idea: idea.trim(),
        user_requirement: requirement.trim(),
        style,
        mode,
        aspect_ratio: aspectRatio,
        shot_count: shotCount,
      });
      onCreated(r.job_id);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0d0d10] border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-[#0d0d10]">
          <h3 className="font-bold flex items-center gap-2 text-white">
            <Sparkles size={18} className="text-[#FF8A3D]" />
            {lang === 'zh' ? '新建短剧' : 'New Drama'}
          </h3>
          <button onClick={onClose} className="text-white/50 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 创意 */}
          <div>
            <label className="block text-sm text-white/70 mb-2">
              {lang === 'zh' ? '✨ 创意（必填）' : '✨ Idea (required)'}
            </label>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={3}
              placeholder={
                lang === 'zh'
                  ? '一只猫和一只狗第一次见面，会发生什么？'
                  : 'A cat and a dog meet for the first time. What happens?'
              }
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#FF8A3D] text-sm resize-none"
            />
          </div>

          {/* 要求 */}
          <div>
            <label className="block text-sm text-white/70 mb-2">
              {lang === 'zh' ? '📋 创作要求（选填）' : '📋 Requirements (optional)'}
            </label>
            <textarea
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              rows={2}
              placeholder={
                lang === 'zh'
                  ? `面向儿童，不超过 ${meta?.max_shots || 20} 个镜头`
                  : `For children, no more than ${meta?.max_shots || 20} shots`
              }
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#FF8A3D] text-sm resize-none"
            />
          </div>

          {/* 画幅比例 */}
          <div>
            <label className="block text-sm text-white/70 mb-2">
              {lang === 'zh' ? '📐 画幅比例' : '📐 Aspect Ratio'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(aspectRatios).map(([key, val]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAspectRatio(key)}
                  className={`px-3 py-2 rounded-lg text-xs border transition ${
                    aspectRatio === key
                      ? 'bg-[#FF8A3D]/20 border-[#FF8A3D]/60 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {lang === 'zh' ? val.label_zh : val.label_en}
                </button>
              ))}
            </div>
          </div>

          {/* 镜头数量 */}
          <div>
            <label className="block text-sm text-white/70 mb-2">
              {lang === 'zh' ? '🎞️ 镜头数量（视频段数）' : '🎞️ Shot Count (video segments)'}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={3}
                max={meta?.max_shots || 12}
                value={shotCount}
                onChange={(e) => setShotCount(Number(e.target.value))}
                className="flex-1 accent-[#FF8A3D]"
              />
              <span className="text-white font-medium text-sm w-8 text-center">{shotCount}</span>
            </div>
            <div className="flex justify-between text-[10px] text-white/30 mt-1 px-0.5">
              <span>3 ({lang === 'zh' ? '极短' : 'min'})</span>
              <span>{lang === 'zh'
                ? `≈${shotCount * 8}秒 · ≈${Math.ceil(shotCount * 8 / 60)}分钟成片`
                : `≈${shotCount * 8}s · ≈${Math.ceil(shotCount * 8 / 60)}min video`}</span>
              <span>{meta?.max_shots || 12} ({lang === 'zh' ? '最多' : 'max'})</span>
            </div>
          </div>

          {/* 风格预设 */}
          <div>
            <label className="block text-sm text-white/70 mb-2">
              {lang === 'zh' ? '🎨 视觉风格' : '🎨 Visual style'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
              {STYLE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setStyle(p.value)}
                  className={`px-3 py-2 rounded-lg text-xs border transition ${
                    style === p.value
                      ? 'bg-[#FF8A3D]/20 border-[#FF8A3D]/60 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {p.label[lang]}
                </button>
              ))}
            </div>
            <input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#FF8A3D]"
            />
          </div>

          {/* 模式选择 */}
          <div>
            <label className="block text-sm text-white/70 mb-2">
              {lang === 'zh' ? '🎬 生成模式' : '🎬 Mode'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('auto')}
                className={`px-3 py-3 rounded-lg text-xs border transition text-left ${
                  mode === 'auto'
                    ? 'bg-[#FF8A3D]/20 border-[#FF8A3D]/60 text-white'
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <div className="font-medium mb-0.5">{lang === 'zh' ? '⚡ 一键模式' : '⚡ Auto'}</div>
                <div className="text-[10px] text-white/40">
                  {lang === 'zh' ? '全自动，提交后等结果' : 'Fully automatic, wait for result'}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode('directed')}
                className={`px-3 py-3 rounded-lg text-xs border transition text-left ${
                  mode === 'directed'
                    ? 'bg-[#FF8A3D]/20 border-[#FF8A3D]/60 text-white'
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <div className="font-medium mb-0.5">{lang === 'zh' ? '🎬 导演模式' : '🎬 Directed'}</div>
                <div className="text-[10px] text-white/40">
                  {lang === 'zh' ? '每步确认，可修改剧本/角色/分镜' : 'Confirm each step, edit script/cast/shots'}
                </div>
              </button>
            </div>
          </div>

          {meta && (
            <div className="text-[11px] text-white/40 bg-white/[0.02] border border-white/5 rounded-lg p-3">
              <p>
                {lang === 'zh' ? '镜头数' : 'Shots'}: <span className="text-white/60">{shotCount}</span>
                {' · '}
                {lang === 'zh' ? '角色上限' : 'Max characters'}: <span className="text-white/60">{meta.max_characters}</span>
                {' · '}
                {lang === 'zh' ? '视频时长' : 'Video'}: <span className="text-white/60">{meta.video_seconds}s/段</span>
              </p>
              {meta.costs && (
                <p className="mt-1">
                  {lang === 'zh' ? '预估积分消耗' : 'Est. cost'}：
                  <span className="text-white/60">
                    ~{shotCount * (meta.costs.video_per_call + meta.costs.image_per_call) + meta.costs.image_per_call * meta.max_characters + meta.costs.llm_per_call * (4 + shotCount)}
                  </span>
                  {' '}
                  ({lang === 'zh' ? `${shotCount}段视频 + ${shotCount}张首帧 + 角色立绘 + LLM` : `${shotCount} videos + ${shotCount} frames + portraits + LLM`})
                </p>
              )}
              <p className="mt-1">
                {lang === 'zh'
                  ? `预估耗时 ${Math.ceil(shotCount * 3.5 + 5)} 分钟。图片/视频失败自动重试 3 次。`
                  : `Est. ${Math.ceil(shotCount * 3.5 + 5)} min. Auto-retries up to 3 times.`}
              </p>
            </div>
          )}

          {err && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-sm"
            >
              {lang === 'zh' ? '取消' : 'Cancel'}
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-gradient-to-br from-[#FF8A3D] to-[#E65100] text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {lang === 'zh' ? '生成短剧' : 'Generate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 🟧 Job Detail
// ==========================================
const DramaJobDetail = ({ token, lang, jobId, onBack }) => {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [canceling, setCanceling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(null);

  const [editScript, setEditScript] = useState('');
  const [editCharacters, setEditCharacters] = useState([]);
  const [editStoryboard, setEditStoryboard] = useState([]);
  const [savingSection, setSavingSection] = useState(null);

  const isScriptDirty = job ? editScript !== (job.artifacts?.script || '') : false;

  const isCharactersDirty = useMemo(() => {
    if (!job || !job.artifacts?.characters) return false;
    return JSON.stringify(editCharacters) !== JSON.stringify(job.artifacts.characters);
  }, [editCharacters, job]);

  const isStoryboardDirty = useMemo(() => {
    if (!job || !job.artifacts?.storyboard) return false;
    return JSON.stringify(editStoryboard) !== JSON.stringify(job.artifacts.storyboard);
  }, [editStoryboard, job]);

  const fetchOnce = useCallback(async () => {
    try {
      const j = await drama.get(token, jobId);
      setJob(j);
      setError(null);
      return j;
    } catch (e) {
      setError(String(e.message || e));
      return null;
    }
  }, [token, jobId]);

  useEffect(() => {
    fetchOnce();
    // 任务在跑时每 4s 拉一次
    timerRef.current = setInterval(async () => {
      const j = await fetchOnce();
      if (j && !isRunning(j.status)) {
        clearInterval(timerRef.current);
      }
    }, 4000);
    return () => clearInterval(timerRef.current);
  }, [fetchOnce]);

  // 同步剧本
  useEffect(() => {
    if (job?.artifacts?.script && !savingSection) {
      const serverScript = job.artifacts.script;
      if (editScript === '' || editScript !== serverScript) {
        const currentIsDirty = editScript !== '' && editScript !== (job.artifacts?.script || '');
        if (!currentIsDirty) {
          setEditScript(serverScript);
        }
      }
    }
  }, [job?.artifacts?.script, savingSection, editScript]);

  // 同步角色
  useEffect(() => {
    if (job?.artifacts?.characters && !savingSection) {
      const serverChars = job.artifacts.characters;
      const currentIsDirty = editCharacters.length > 0 && JSON.stringify(editCharacters) !== JSON.stringify(serverChars);
      if (!currentIsDirty) {
        setEditCharacters(JSON.parse(JSON.stringify(serverChars)));
      }
    }
  }, [job?.artifacts?.characters, savingSection, editCharacters]);

  // 同步分镜
  useEffect(() => {
    if (job?.artifacts?.storyboard && !savingSection) {
      const serverStoryboard = job.artifacts.storyboard;
      const currentIsDirty = editStoryboard.length > 0 && JSON.stringify(editStoryboard) !== JSON.stringify(serverStoryboard);
      if (!currentIsDirty) {
        setEditStoryboard(JSON.parse(JSON.stringify(serverStoryboard)));
      }
    }
  }, [job?.artifacts?.storyboard, savingSection, editStoryboard]);

  const handlePatch = async (section, data) => {
    setSavingSection(section);
    try {
      const r = await fetch(`${API_BASE_URL}/api/drama/jobs/${jobId}/patch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [section]: data }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `Failed to patch ${section}`);
      }
      await fetchOnce();
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      setSavingSection(null);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm(lang === 'zh' ? '确认取消此任务？' : 'Cancel this job?')) return;
    setCanceling(true);
    try {
      await drama.cancel(token, jobId);
      await fetchOnce();
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      setCanceling(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await fetch(`${API_BASE_URL}/api/drama/jobs/${jobId}/confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'continue' }),
      });
      await fetchOnce();
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      setConfirming(false);
    }
  };

  if (!job) {
    return (
      <div className="h-full flex items-center justify-center">
        {error ? (
          <div className="text-red-300">{error}</div>
        ) : (
          <Loader2 size={24} className="animate-spin text-white/50" />
        )}
      </div>
    );
  }

  const status = STATUS_LABEL[job.status] || { zh: job.status, en: job.status, cls: 'bg-white/10 text-white/70' };
  const artifacts = job.artifacts || {};
  const characters = artifacts.characters || [];
  const portraits = artifacts.portraits || {};
  const shots = artifacts.shots || [];
  const finalUrl = artifacts.final_video_url;

  return (
    <div className="h-full overflow-y-auto">
      {/* Sticky 顶部：标题 + 进度 */}
      <div className="sticky top-0 z-10 bg-[#050505] border-b border-white/5 px-4 md:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-white truncate">
              {(job.inputs?.idea || '').trim() || (lang === 'zh' ? '(无创意)' : '(no idea)')}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-xs text-white/50">
              <span>{formatTime(job.created_at)}</span>
              <span>·</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${status.cls}`}>
                {status[lang]}
              </span>
              {isRunning(job.status) && job.status !== 'awaiting_confirm' && <span>{job.progress || 0}%</span>}
            </div>
          </div>
          {isRunning(job.status) && job.status !== 'awaiting_confirm' && (
            <button
              onClick={handleCancel}
              disabled={canceling}
              className="px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <StopCircle size={14} />
              {lang === 'zh' ? '取消' : 'Cancel'}
            </button>
          )}
          {job.status === 'awaiting_confirm' && (
            <>
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <StopCircle size={14} />
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="px-4 py-2 rounded-lg bg-gradient-to-br from-[#10B981] to-[#059669] text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {confirming ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                {lang === 'zh' ? '确认继续' : 'Confirm & Continue'}
              </button>
            </>
          )}
        </div>

        {/* 进度条 */}
        {isRunning(job.status) && job.status !== 'awaiting_confirm' && (
          <div className="mt-3">
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FF8A3D] to-[#E65100] transition-all"
                style={{ width: `${job.progress || 0}%` }}
              />
            </div>
            <p className="text-xs text-white/50 mt-1.5">
              {STEP_LABEL[job.current_step]?.[lang] || job.current_step}
            </p>
          </div>
        )}
        {job.status === 'awaiting_confirm' && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs">
            {lang === 'zh'
              ? '请检查以上内容，确认无误后点击「确认继续」进入下一步。'
              : 'Review the content above, then click "Confirm & Continue" to proceed.'}
          </div>
        )}
      </div>

      {/* 内容区 */}
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">

      {/* 运行中且没有任何产物时：显示加载动画 */}
      {isRunning(job.status) && job.status !== 'awaiting_confirm' && !artifacts.script && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-[#FF8A3D] animate-spin" />
            <Film size={24} className="absolute inset-0 m-auto text-white/40" />
          </div>
          <p className="mt-6 text-white/60 text-sm">
            {STEP_LABEL[job.current_step]?.[lang] || (lang === 'zh' ? '处理中...' : 'Processing...')}
          </p>
          <p className="mt-2 text-white/30 text-xs">
            {lang === 'zh' ? '请稍候，AI 正在创作中' : 'Please wait, AI is creating...'}
          </p>
        </div>
      )}

      {/* 运行中但已有部分产物：显示产物 + 底部加载指示 */}
      {isRunning(job.status) && job.status !== 'awaiting_confirm' && artifacts.script && (
        <div className="mb-6 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
          <Loader2 size={14} className="animate-spin text-[#FF8A3D]" />
          <span className="text-xs text-white/50">
            {STEP_LABEL[job.current_step]?.[lang] || job.current_step}
          </span>
        </div>
      )}

      {/* 错误 */}
      {job.status === 'failed' && job.error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {job.error}
        </div>
      )}

      {/* 最终视频 */}
      {finalUrl && (
        <Section title={lang === 'zh' ? '🎬 成片' : '🎬 Final Video'}>
          <video
            src={toSecureUrl(finalUrl)}
            controls
            className="w-full max-w-md mx-auto rounded-lg bg-black"
          />
          <div className="text-center mt-2">
            <a
              href={toSecureUrl(finalUrl)}
              download
              className="text-xs text-[#FF8A3D] hover:underline"
            >
              {lang === 'zh' ? '下载视频' : 'Download'}
            </a>
          </div>
        </Section>
      )}

      {/* 剧本 */}
      {artifacts.script && (
        <Section title={lang === 'zh' ? '📝 剧本' : '📝 Script'}>
          {job.status === 'awaiting_confirm' && job.current_step?.includes('script') ? (
            <div className="space-y-3">
              <textarea
                value={editScript}
                onChange={(e) => setEditScript(e.target.value)}
                className="w-full h-80 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#FF8A3D] text-sm resize-y font-sans leading-relaxed"
                placeholder={lang === 'zh' ? '在此处编辑您的剧本...' : 'Edit your script here...'}
              />
              {isScriptDirty && (
                <div className="flex justify-end">
                  <button
                    onClick={() => handlePatch('script', editScript)}
                    disabled={savingSection === 'script'}
                    className="px-3 py-1.5 rounded-lg bg-[#FF8A3D] hover:bg-[#E65100] text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 transition"
                  >
                    {savingSection === 'script' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : null}
                    {lang === 'zh' ? '保存剧本修改' : 'Save Script Changes'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-white/80 leading-relaxed bg-white/[0.02] border border-white/5 rounded-lg p-4 max-h-80 overflow-y-auto">
              {artifacts.script}
            </pre>
          )}
          {/* 导演模式：重新生成 / 提供意见 */}
          {job.status === 'awaiting_confirm' && job.current_step?.includes('script') && (
            <DirectorActions
              token={token}
              jobId={jobId}
              lang={lang}
              section="script"
              onRegenerated={fetchOnce}
            />
          )}
        </Section>
      )}

      {/* 角色 + 立绘 */}
      {((job.status === 'awaiting_confirm' && job.current_step?.includes('characters_ready')) || characters.length > 0) && (
        <Section title={lang === 'zh' ? `👥 角色 (${(job.status === 'awaiting_confirm' && job.current_step?.includes('characters_ready') ? editCharacters.length : characters.length)})` : `👥 Cast (${(job.status === 'awaiting_confirm' && job.current_step?.includes('characters_ready') ? editCharacters.length : characters.length)})`}>
          {job.status === 'awaiting_confirm' && job.current_step?.includes('characters_ready') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {editCharacters.map((c, i) => (
                  <div key={i} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#FF8A3D]">{c.identifier_in_scene}</span>
                      <span className="text-[10px] text-white/30">ID: {c.idx}</span>
                    </div>
                    <div>
                      <label className="block text-[11px] text-white/40 mb-1">
                        {lang === 'zh' ? '角色图生成 Prompt (外貌特征)' : 'Character Portrait Prompt'}
                      </label>
                      <textarea
                        value={c.static_features}
                        onChange={(e) => {
                          const updated = [...editCharacters];
                          updated[i] = { ...updated[i], static_features: e.target.value };
                          setEditCharacters(updated);
                        }}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-[#FF8A3D] text-xs resize-none leading-relaxed"
                        placeholder={lang === 'zh' ? '输入角色外貌特征描述，例如：金发蓝眼，穿着黑色夹克...' : 'Describe character visual features...'}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {isCharactersDirty && (
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => handlePatch('characters', editCharacters)}
                    disabled={savingSection === 'characters'}
                    className="px-3 py-1.5 rounded-lg bg-[#FF8A3D] hover:bg-[#E65100] text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 transition"
                  >
                    {savingSection === 'characters' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : null}
                    {lang === 'zh' ? '保存角色修改' : 'Save Character Changes'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {characters.map((c, i) => {
                const p = portraits[c.identifier_in_scene];
                return (
                  <div key={i} className="bg-white/[0.02] border border-white/5 rounded-lg overflow-hidden">
                    <div className="aspect-square bg-black/40">
                      {p?.front_url ? (
                        <img src={toSecureUrl(p.front_url)} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 size={20} className="text-white/30 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs text-white/80 font-medium truncate">{c.identifier_in_scene}</p>
                      <p className="text-[10px] text-white/40 line-clamp-2 mt-0.5">{c.static_features}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* 导演模式：重新生成 / 提供意见 */}
          {job.status === 'awaiting_confirm' && job.current_step?.includes('characters_ready') && (
            <DirectorActions
              token={token}
              jobId={jobId}
              lang={lang}
              section="characters"
              onRegenerated={fetchOnce}
            />
          )}
          {job.status === 'awaiting_confirm' && job.current_step?.includes('portraits') && (
            <DirectorActions
              token={token}
              jobId={jobId}
              lang={lang}
              section="portraits"
              onRegenerated={fetchOnce}
            />
          )}
        </Section>
      )}

      {/* 分镜设计（storyboard - step 4 产物，尚未 decompose） */}
      {!shots.length && (artifacts.storyboard || []).length > 0 && (
        <Section title={lang === 'zh' ? `🎬 分镜设计 (${(job.status === 'awaiting_confirm' && job.current_step?.includes('storyboard') ? editStoryboard.length : artifacts.storyboard.length)} 个镜头)` : `🎬 Storyboard (${(job.status === 'awaiting_confirm' && job.current_step?.includes('storyboard') ? editStoryboard.length : artifacts.storyboard.length)} shots)`}>
          {job.status === 'awaiting_confirm' && job.current_step?.includes('storyboard') ? (
            <div className="space-y-4">
              <div className="space-y-3">
                {editStoryboard.map((s, i) => (
                  <div key={i} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/85">
                        {lang === 'zh' ? `镜头 ${i + 1}` : `Shot ${i + 1}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/30">Camera {s.cam_idx}</span>
                        {s.is_last && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 font-medium">END</span>}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-white/40 mb-1">
                          {lang === 'zh' ? '画面视觉描述 (Prompt)' : 'Visual Prompt'}
                        </label>
                        <textarea
                          value={s.visual_desc}
                          onChange={(e) => {
                            const updated = [...editStoryboard];
                            updated[i] = { ...updated[i], visual_desc: e.target.value };
                            setEditStoryboard(updated);
                          }}
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-[#FF8A3D] text-xs resize-none leading-relaxed"
                          placeholder={lang === 'zh' ? '描述镜头画面，例如：<Alice> 坐在窗前看雨...' : 'Describe what happens...'}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/40 mb-1">
                          {lang === 'zh' ? '配音/配乐描述' : 'Audio Description'}
                        </label>
                        <textarea
                          value={s.audio_desc || ''}
                          onChange={(e) => {
                            const updated = [...editStoryboard];
                            updated[i] = { ...updated[i], audio_desc: e.target.value };
                            setEditStoryboard(updated);
                          }}
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-[#FF8A3D] text-xs resize-none leading-relaxed"
                          placeholder={lang === 'zh' ? '描述声音，例如：[旁白] 那是她一生中最漫长的一天。' : 'Describe audio...'}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {isStoryboardDirty && (
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => handlePatch('storyboard', editStoryboard)}
                    disabled={savingSection === 'storyboard'}
                    className="px-3 py-1.5 rounded-lg bg-[#FF8A3D] hover:bg-[#E65100] text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 transition"
                  >
                    {savingSection === 'storyboard' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : null}
                    {lang === 'zh' ? '保存分镜修改' : 'Save Storyboard Changes'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {artifacts.storyboard.map((s, i) => (
                <div key={i} className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-white/80">
                      {lang === 'zh' ? `镜头 ${i + 1}` : `Shot ${i + 1}`}
                    </span>
                    <span className="text-[10px] text-white/30">cam {s.cam_idx}</span>
                    {s.is_last && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">END</span>}
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">{s.visual_desc}</p>
                  {s.audio_desc && (
                    <p className="text-xs text-white/40 italic mt-1.5">{s.audio_desc}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {job.status === 'awaiting_confirm' && job.current_step?.includes('storyboard') && (
            <DirectorActions
              token={token}
              jobId={jobId}
              lang={lang}
              section="storyboard"
              onRegenerated={fetchOnce}
            />
          )}
        </Section>
      )}

      {/* 分镜详情（shots - step 5 decompose 后的完整数据） */}
      {shots.length > 0 && (
        <Section title={lang === 'zh' ? `🎥 分镜 (${shots.length})` : `🎥 Shots (${shots.length})`}>
          <div className="space-y-3">
            {shots.map((s, i) => (
              <ShotRow key={i} shot={s} lang={lang} />
            ))}
          </div>
          {/* 导演模式：重新生成 / 提供意见 */}
          {job.status === 'awaiting_confirm' && job.current_step?.includes('storyboard') && (
            <DirectorActions
              token={token}
              jobId={jobId}
              lang={lang}
              section="storyboard"
              onRegenerated={fetchOnce}
            />
          )}
        </Section>
      )}
      </div>{/* end content area */}
    </div>
  );
};

// ==========================================
// 🎬 Director Actions (重新生成 / 提供修改意见)
// ==========================================
const DirectorActions = ({ token, jobId, lang, section, onRegenerated }) => {
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleRegenerate = async (userFeedback = '') => {
    if (!userFeedback && !window.confirm(
      lang === 'zh'
        ? '确认重新生成？当前内容将被覆盖。'
        : 'Regenerate? Current content will be overwritten.'
    )) return;
    setSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/api/drama/jobs/${jobId}/confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'regenerate',
          feedback: userFeedback || '',
        }),
      });
      setFeedback('');
      setShowFeedback(false);
      onRegenerated?.();
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFeedbackSubmit = () => {
    if (!feedback.trim()) return;
    handleRegenerate(feedback.trim());
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleRegenerate('')}
          disabled={submitting}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RotateCcw size={12} />
          {lang === 'zh' ? '重新生成' : 'Regenerate'}
        </button>
        <button
          onClick={() => setShowFeedback(!showFeedback)}
          disabled={submitting}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <MessageSquare size={12} />
          {lang === 'zh' ? '提供修改意见' : 'Give Feedback'}
        </button>
      </div>
      {showFeedback && (
        <div className="flex gap-2">
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={lang === 'zh' ? '输入你的修改意见，AI 会据此重新生成...' : 'Enter your feedback for regeneration...'}
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#FF8A3D]"
            onKeyDown={(e) => e.key === 'Enter' && handleFeedbackSubmit()}
          />
          <button
            onClick={handleFeedbackSubmit}
            disabled={submitting || !feedback.trim()}
            className="px-3 py-2 rounded-lg bg-[#FF8A3D]/20 hover:bg-[#FF8A3D]/30 border border-[#FF8A3D]/40 text-[#FF8A3D] text-xs disabled:opacity-50"
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : (lang === 'zh' ? '提交并重新生成' : 'Submit & Regen')}
          </button>
        </div>
      )}
    </div>
  );
};

const Section = ({ title, children }) => (
  <div className="mb-7">
    <h2 className="text-sm font-semibold text-white/60 mb-2.5 uppercase tracking-wide">{title}</h2>
    {children}
  </div>
);

const ShotRow = ({ shot, lang }) => {
  const ff = shot.first_frame_url;
  const clip = shot.clip_url;
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 flex flex-col md:flex-row gap-3">
      <div className="flex gap-2 md:w-72 shrink-0">
        <div className="flex-1 aspect-video bg-black/40 rounded overflow-hidden">
          {ff ? (
            <img src={toSecureUrl(ff)} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
              {lang === 'zh' ? '首帧' : 'first'}
            </div>
          )}
        </div>
        <div className="flex-1 aspect-video bg-black/40 rounded overflow-hidden">
          {clip ? (
            <video src={toSecureUrl(clip)} controls muted className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
              {lang === 'zh' ? '视频' : 'clip'}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0 text-xs text-white/60">
        <p className="text-white/80 font-medium mb-1">
          {lang === 'zh' ? `镜头 ${shot.idx + 1}` : `Shot ${shot.idx + 1}`}
          <span className="text-white/30 ml-2 text-[10px]">cam {shot.cam_idx} · {shot.variation_type}</span>
        </p>
        <p className="line-clamp-3 leading-snug">{shot.visual_desc}</p>
        {shot.audio_desc && (
          <p className="mt-1 text-white/40 italic line-clamp-2">{shot.audio_desc}</p>
        )}
      </div>
    </div>
  );
};

export default ShortDramaPage;
