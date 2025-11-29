import React, { useState, useEffect, useRef } from 'react';
import { 
  Image as ImageIcon, Settings, Sparkles, UploadCloud, 
  History, Download, Maximize2, Palette,
  Monitor, BoxSelect, Copy, Camera, User, Edit3, Globe, 
  LogOut, X, Loader2, Check, Lock, AlertCircle, RefreshCw, Zap
} from 'lucide-react';

const API_BASE_URL = "http://localhost:8000"; 

// ==========================================
// 🎨 LOGO 设置区域
// ==========================================
const WXLogo = () => (
  <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="shadow-lg shadow-orange-500/20 rounded-xl">
    <rect width="40" height="40" rx="12" fill="#FF8A3D"/>
    <path d="M11 13L15 27L19 13H21L25 27L29 13" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// --- 语言包 ---
const TRANSLATIONS = {
  en: {
    nav: { product: "Product Shot", retouch: "AI Retouch", portrait: "Portrait", soon: "Coming Soon" },
    auth: { 
      login: "Log In", logout: "Log Out", username: "Username", password: "Password", submit: "Sign In", welcome: "Welcome",
      productName: "WX Studio", subtitle: "Professional AI Photography", placeholderUser: "Enter username"
    },
    upload: { title: "Upload Source", desc: "Reference image is required", uploaded: "Image Ready", uploading: "Uploading...", change: "Change Image" },
    prompt: { label: "Creative Prompt", placeholder: "Describe materials, lighting, and mood...", enhance: "AI Enhance", enhancing: "Optimizing..." },
    style: "Aesthetics", 
    styles: {
      Luxurious: "Luxurious", Minimal: "Minimal", Nature: "Nature", 
      Cyberpunk: "Cyberpunk", Studio: "Studio", Soft: "Soft", 
      Vintage: "Vintage", Cinematic: "Cinematic", Neon: "Neon"
    },
    resolution: "Output Size", ratio: "Aspect Ratio",
    generate: { idle: "Generate", loading: "Creating...", disabled: "Fill in Parameters", loginRequired: "Login to Create", quotaEmpty: "Quota Exceeded" },
    status: { ready: "WX Studio Ready", powered: "Powered by TT-API" },
    gallery: { title: "History", empty: "No creations yet" },
    quota: "Credits",
    toast: { copySuccess: "Copied!", copyFail: "Failed", downloadFail: "Failed" }
  },
  zh: {
    nav: { product: "商品摄影", retouch: "智能修图", portrait: "个人写真", soon: "敬请期待" },
    auth: { 
      login: "登录 / 注册", logout: "退出登录", username: "账号", password: "密码", submit: "立即登录", welcome: "欢迎回来",
      productName: "WX Studio", subtitle: "专业 AI 商品摄影工坊", placeholderUser: "请输入账号"
    },
    upload: { title: "上传底图", desc: "请上传商品原图 (必填)", uploaded: "底图已就绪", uploading: "加密上传中...", change: "更换底图" },
    prompt: { label: "创意描述", placeholder: "描述材质、光影氛围、背景细节...", enhance: "AI 润色", enhancing: "优化中..." },
    style: "美学风格", 
    styles: {
      Luxurious: "奢华质感", Minimal: "极简白底", Nature: "自然森系", 
      Cyberpunk: "赛博朋克", Studio: "专业影棚", Soft: "柔和光影", 
      Vintage: "复古胶片", Cinematic: "电影大片", Neon: "霓虹光效"
    },
    resolution: "输出画质", ratio: "画幅比例",
    generate: { idle: "立即生成", loading: "正在生成中...", disabled: "请填写必要参数", loginRequired: "请登录后使用", quotaEmpty: "配额已用尽" },
    status: { ready: "WX Studio 就绪", powered: "由 TT-API 驱动" },
    gallery: { title: "创作记录", empty: "暂无历史记录" },
    quota: "剩余点数",
    toast: { copySuccess: "已复制到剪贴板", copyFail: "复制失败", downloadFail: "下载失败" }
  }
};

const FullscreenViewer = ({ isOpen, image, onClose }) => {
  if (!isOpen || !image) return null;
  return (
    <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
      <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
        <X size={24} />
      </button>
      <img src={image} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" onClick={(e) => e.stopPropagation()} alt="Fullscreen" />
    </div>
  );
};

const LoginModal = ({ isOpen, onClose, onLogin, t }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch(`${API_BASE_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      if (!res.ok) throw new Error('账号或密码错误');
      
      const data = await res.json();
      onLogin(data.access_token, data.username, data.quota);
      onClose();
    } catch (err) {
      setError(err.message);
      // 本地开发回退逻辑
      if (process.env.NODE_ENV === 'development' && err.message.includes('Failed to fetch')) {
         console.warn("Backend unavailable. Using Mock Login for UI testing.");
         onLogin("mock_token", username, 999);
         onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-[380px] bg-[#141414] border border-white/10 rounded-2xl shadow-2xl p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white"><X size={18}/></button>
        <div className="flex flex-col items-center gap-4 mb-8">
          <WXLogo />
          <div className="text-center">
            <h2 className="text-xl font-bold text-white tracking-tight">{t.auth.productName}</h2>
            <p className="text-xs text-white/40 mt-1">{t.auth.subtitle}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <InputGroup label={t.auth.username} type="text" value={username} onChange={setUsername} placeholder={t.auth.placeholderUser} />
          <InputGroup label={t.auth.password} type="password" value={password} onChange={setPassword} placeholder="••••••••" />
          {error && <div className="text-red-400 text-xs flex items-center gap-1 bg-red-500/10 p-2 rounded"><AlertCircle size={12}/>{error}</div>}
          <button type="submit" disabled={loading} className="w-full h-11 mt-2 bg-gradient-to-r from-[#FF8A3D] to-[#E65100] hover:opacity-90 text-white font-bold rounded-lg text-sm transition-all shadow-lg flex items-center justify-center gap-2">
            {loading ? <Loader2 size={18} className="animate-spin"/> : t.auth.submit}
          </button>
        </form>
      </div>
    </div>
  );
};

const InputGroup = ({ label, type, value, onChange, placeholder }) => (
  <div>
    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">{label}</label>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none transition-all placeholder:text-white/20" placeholder={placeholder} />
  </div>
);

const AIPhotoStudio = () => {
  const [lang, setLang] = useState('zh');
  const t = TRANSLATIONS[lang];
  
  // 用户状态
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'Guest');
  const [quota, setQuota] = useState(0);
  
  const [showLogin, setShowLogin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false); 

  // Action Loading States
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const [activeTab, setActiveTab] = useState('product');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const [prompt, setPrompt] = useState("");
  const [sourceImageCloudUrl, setSourceImageCloudUrl] = useState(null); 
  const [sourceImageLocalPreview, setSourceImageLocalPreview] = useState(null); 
  const [isUploading, setIsUploading] = useState(false);
  const [resultImage, setResultImage] = useState(null);
  
  const [config, setConfig] = useState({ style: 'Luxurious', ratio: '1:1', resolution: '2K' });
  const [history, setHistory] = useState([]);

  const isLoggedIn = !!token;
  const isValid = !!sourceImageCloudUrl && prompt.trim().length > 0;

  const ratioOptions = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
  const styleIds = ['Luxurious', 'Minimal', 'Nature', 'Cyberpunk', 'Studio', 'Soft', 'Vintage', 'Cinematic', 'Neon'];

  // --- 初始化 ---
  useEffect(() => {
    if (token) {
      fetchHistory();
      fetchUserInfo();
    } else {
      setHistory([]);
      setQuota(0);
    }
  }, [token]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setHistory(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchUserInfo = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/user/me`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setQuota(data.quota);
      }
    } catch (err) { console.error(err); }
  };

  const handleLogin = (newToken, newUser, newQuota) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUser);
    setToken(newToken);
    setUsername(newUser);
    setQuota(newQuota);
  };

  const handleLogout = () => {
    localStorage.clear();
    setToken(null);
    setUsername('Guest');
    setSourceImageLocalPreview(null);
    setSourceImageCloudUrl(null);
    setPrompt("");
    setResultImage(null);
    setShowUserMenu(false);
  };

  // --- 核心功能函数 ---

  const handleDownload = async () => {
    if (!resultImage) return;
    setIsDownloading(true);
    try {
      const proxyUrl = `${API_BASE_URL}/api/proxy?url=${encodeURIComponent(resultImage)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `WX_Studio_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert(t.toast.downloadFail);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopy = async () => {
    if (!resultImage) return;
    setIsCopying(true);
    try {
      const proxyUrl = `${API_BASE_URL}/api/proxy?url=${encodeURIComponent(resultImage)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      alert(t.toast.copySuccess);
    } catch (err) {
      console.error('Copy failed:', err);
      alert(t.toast.copyFail);
    } finally {
      setIsCopying(false);
    }
  };

  const checkAuth = (action) => {
    if (!isLoggedIn) { setShowLogin(true); return false; }
    action();
    return true;
  };

  const handleFileChange = async (e) => {
    if (!checkAuth(() => {})) return;
    const file = e.target.files[0];
    if (!file) return;

    setSourceImageLocalPreview(URL.createObjectURL(file));
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (!res.ok) throw new Error('Upload Failed');
      const data = await res.json();
      setSourceImageCloudUrl(data.url);
    } catch (err) {
      alert("上传失败: " + err.message);
      setSourceImageLocalPreview(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!checkAuth(() => {})) return;
    if (quota <= 0) { alert(t.generate.quotaEmpty); return; }
    if (!isValid) return;

    setIsGenerating(true);
    setResultImage(null);
    setProgress(5);
    
    const progressTimer = setInterval(() => setProgress(p => p < 90 ? p + Math.random() * 3 : p), 500);

    try {
      const formData = new URLSearchParams();
      formData.append('prompt', prompt);
      formData.append('image_size', config.resolution);
      formData.append('ratio', config.ratio);
      formData.append('style', config.style);
      formData.append('image_url', sourceImageCloudUrl);

      const res = await fetch(`${API_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Service Unavailable');
      }
      
      const data = await res.json();
      if (data.status === 'SUCCESS' && data.data?.image_url) {
        setResultImage(data.data.image_url);
        setHistory(prev => [data.data.history_item, ...prev]);
        setQuota(data.data.remaining_quota);
        setProgress(100);
      } else {
        throw new Error('Generation failed');
      }
    } catch (err) {
      alert(`生成失败: ${err.message}`);
      setProgress(0);
    } finally {
      clearInterval(progressTimer);
      setIsGenerating(false);
    }
  };

  const handleHistoryClick = (item) => {
    setResultImage(item.image);
    setPrompt(item.prompt); 
  };

  const handleImprovePrompt = () => {
    if (!prompt.trim()) return;
    setIsImproving(true);
    setTimeout(() => {
        setIsImproving(false);
        setPrompt(prompt + " (Professional Studio Lighting, 8k Resolution, High Detail)");
    }, 1200);
  };

  return (
    <div className="w-full h-screen bg-[#050505] text-white font-sans flex flex-col overflow-hidden selection:bg-[#FF8A3D] selection:text-white">
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onLogin={handleLogin} t={t} />
      <FullscreenViewer isOpen={showFullscreen} image={resultImage} onClose={() => setShowFullscreen(false)} />

      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-[#0a0a0a] border-b border-white/5 z-50 shrink-0 relative">
        <div className="flex items-center gap-3 select-none">
          <WXLogo />
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            WX <span className="font-light opacity-50">Studio</span>
            {/* ✨ Beta Tag - 内测版标识 ✨ */}
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#FF8A3D]/20 text-[#FF8A3D] border border-[#FF8A3D]/20 font-mono tracking-wide">
              BETA v0.9
            </span>
          </h1>
        </div>

        <div className="flex bg-[#141414] p-1 rounded-full border border-white/5">
          <NavButton active icon={<Camera size={16}/>} label={t.nav.product} />
          <NavButton disabled icon={<Edit3 size={16}/>} label={t.nav.retouch} tooltip={t.nav.soon} />
          <NavButton disabled icon={<User size={16}/>} label={t.nav.portrait} tooltip={t.nav.soon} />
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')} className="p-2 hover:bg-white/10 rounded-full transition-colors flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white">
            <Globe size={16} /><span>{lang === 'zh' ? 'EN' : '中'}</span>
          </button>
          <div className="w-[1px] h-6 bg-white/10"></div>
          
          {isLoggedIn ? (
            <div className="relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-3 hover:bg-white/5 py-1 px-3 rounded-full transition-colors border border-white/5 bg-[#141414]">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-semibold text-white/90">{username}</span>
                  <div className="flex items-center gap-1">
                    <Zap size={10} className="text-[#FF8A3D]" fill="currentColor"/>
                    <span className="text-[10px] text-[#FF8A3D] font-mono">{quota}</span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF8A3D] to-[#E65100] border border-white/10"></div>
              </button>
              {showUserMenu && (
                <div className="absolute top-full right-0 mt-2 w-40 bg-[#141414] border border-white/10 rounded-xl shadow-2xl py-1 z-50 overflow-hidden">
                  <div className="px-4 py-2 text-[10px] text-white/40 uppercase tracking-wider font-bold">{t.quota}: {quota}</div>
                  <div className="h-[1px] bg-white/5 my-1"></div>
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-white/5 flex items-center gap-2">
                    <LogOut size={14}/> {t.auth.logout}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => setShowLogin(true)} className="px-6 py-2 rounded-full bg-white text-black hover:bg-gray-200 text-xs font-bold transition-all">
              {t.auth.login}
            </button>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 flex gap-0 min-h-0 relative">
        <div className="w-[360px] bg-[#0a0a0a] border-r border-white/5 flex flex-col z-20">
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
            {/* Upload */}
            <div className="space-y-3">
              <SectionLabel icon={<UploadCloud size={14}/>}>{t.upload.title}</SectionLabel>
              <div className="relative w-full aspect-[16/10] group">
                {sourceImageLocalPreview ? (
                  <div className="w-full h-full rounded-xl overflow-hidden border border-[#FF8A3D]/30 bg-[#141414] relative group cursor-pointer" onClick={() => document.getElementById('file-upload').click()}>
                    <img src={sourceImageLocalPreview} className="w-full h-full object-contain p-2" alt="source" />
                    {isUploading ? (
                       <div className="absolute inset-0 bg-black/80 flex items-center justify-center flex-col gap-2">
                         <Loader2 className="animate-spin text-[#FF8A3D]"/>
                         <span className="text-xs text-white/80">{t.upload.uploading}</span>
                       </div>
                    ) : (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center flex-col gap-2 backdrop-blur-sm">
                        <RefreshCw className="text-white"/>
                        <span className="text-xs text-white">{t.upload.change}</span>
                      </div>
                    )}
                    {!isUploading && sourceImageCloudUrl && <div className="absolute top-2 right-2 w-5 h-5 bg-[#FF8A3D] rounded-full flex items-center justify-center shadow-lg"><Check size={10} className="text-white"/></div>}
                  </div>
                ) : (
                  <label htmlFor="file-upload" className="w-full h-full rounded-xl border border-dashed border-white/10 hover:border-[#FF8A3D]/50 hover:bg-white/[0.02] flex flex-col items-center justify-center cursor-pointer transition-all gap-3 bg-[#111]">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center"><UploadCloud size={20} className="text-white/40"/></div>
                    <div className="text-center"><p className="text-xs font-medium text-white/80">{t.upload.title}</p><p className="text-[10px] text-white/30">{t.upload.desc}</p></div>
                  </label>
                )}
                <input id="file-upload" type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isUploading}/>
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <SectionLabel icon={<Edit3 size={14}/>}>{t.prompt.label}</SectionLabel>
                  <button onClick={handleImprovePrompt} disabled={isImproving || !prompt} className="text-[10px] text-[#FF8A3D] hover:text-[#ff9752] flex items-center gap-1 bg-[#FF8A3D]/10 px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Sparkles size={10}/> {isImproving ? t.prompt.enhancing : t.prompt.enhance}</button>
                </div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={t.prompt.placeholder} className="w-full h-28 bg-[#141414] border border-white/10 rounded-xl p-3 text-xs text-white/90 placeholder:text-white/20 resize-none focus:outline-none focus:border-[#FF8A3D]/50 transition-all custom-scrollbar"/>
              </div>

              <div className="space-y-5">
                <ParamSection label={t.style} options={['Luxurious', 'Minimal', 'Nature', 'Cyberpunk', 'Studio', 'Soft', 'Vintage', 'Cinematic', 'Neon']} translations={t.styles} active={config.style} onChange={v => setConfig({...config, style: v})} />
                <ParamSection label={t.ratio} options={ratioOptions} active={config.ratio} onChange={v => setConfig({...config, ratio: v})} grid />
                <ParamSection label={t.resolution} options={['1K', '2K', '4K']} active={config.resolution} onChange={v => setConfig({...config, resolution: v})} />
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-white/5 bg-[#0a0a0a]">
            <button 
              onClick={handleGenerate}
              disabled={isGenerating || (isLoggedIn && !isValid) || isUploading}
              className={`w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg
                ${isGenerating || (isLoggedIn && !isValid)
                  ? 'bg-[#1a1a1a] text-white/30 cursor-not-allowed border border-white/5'
                  : 'bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white hover:opacity-90 shadow-orange-900/20'}
              `}
            >
              {isGenerating ? <><Loader2 size={16} className="animate-spin"/> {t.generate.loading}</> : 
               !isLoggedIn ? <><Lock size={14}/> {t.generate.loginRequired}</> :
               quota <= 0 ? t.generate.quotaEmpty :
               !isValid ? t.generate.disabled : <><Sparkles size={16}/> {t.generate.idle} <span className="opacity-50 text-[10px] ml-1">(-1)</span></>
              }
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-[#050505] p-6 min-w-0 flex flex-col">
          <div className="flex-1 rounded-2xl bg-[#0a0a0a] border border-white/5 relative overflow-hidden flex items-center justify-center group">
            <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px'}}></div>
            {isGenerating && (
              <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-4"><div className="h-full bg-[#FF8A3D] transition-all duration-300" style={{width: `${progress}%`}}></div></div>
                <div className="text-[#FF8A3D] font-mono text-2xl animate-pulse">{Math.round(progress)}%</div>
                <div className="text-white/40 text-xs mt-2 uppercase tracking-widest">{t.status.powered}</div>
              </div>
            )}
            <div className="relative w-full h-full p-8 flex items-center justify-center">
              {!resultImage && !isGenerating ? (
                <div className="text-center opacity-20 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl border border-dashed border-white/30 flex items-center justify-center"><ImageIcon size={32}/></div>
                  <p className="text-sm font-medium tracking-wide">{t.status.ready}</p>
                </div>
              ) : (
                <div className={`relative w-full h-full flex items-center justify-center transition-all duration-500 ${isGenerating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                   {resultImage && <img src={resultImage} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt="Result" />}
                </div>
              )}
            </div>
            
            {/* 修复后的悬浮操作栏 */}
            {resultImage && !isGenerating && (
              <div className="absolute bottom-8 flex items-center gap-3 p-2 rounded-full bg-[#1e1e1e]/80 border border-white/10 shadow-2xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                <ActionBtn icon={isDownloading ? <Loader2 className="animate-spin" size={18}/> : <Download size={18}/>} onClick={handleDownload} tooltip="Download" />
                <ActionBtn icon={<Maximize2 size={18}/>} onClick={() => setShowFullscreen(true)} tooltip="Fullscreen" />
                <div className="w-[1px] h-4 bg-white/10"></div>
                <ActionBtn icon={isCopying ? <Loader2 className="animate-spin" size={18}/> : <Copy size={18}/>} onClick={handleCopy} tooltip="Copy" />
              </div>
            )}
          </div>
        </div>

        {/* History */}
        <div className="w-[220px] bg-[#0a0a0a] border-l border-white/5 flex flex-col z-20">
          <div className="p-5 border-b border-white/5"><SectionLabel icon={<History size={14}/>}>{t.gallery.title}</SectionLabel></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {history.map(item => (
              <div key={item.id} onClick={() => {setResultImage(item.image); setPrompt(item.prompt)}} className="aspect-square rounded-xl overflow-hidden border border-white/5 hover:border-[#FF8A3D] cursor-pointer relative group bg-[#111] transition-all hover:shadow-lg hover:shadow-orange-900/10">
                <img src={item.image} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt="thumb"/>
              </div>
            ))}
            {history.length === 0 && <div className="text-center text-[10px] text-white/20 mt-10">{t.gallery.empty}</div>}
          </div>
        </div>
      </main>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #222; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #333; }
      `}</style>
    </div>
  );
};

// --- Components ---
const NavButton = ({ active, disabled, icon, label, tooltip, onClick }) => (
  <button onClick={disabled ? undefined : onClick} className={`group relative flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all ${active ? 'bg-white/10 text-white shadow-inner' : disabled ? 'text-white/30 cursor-not-allowed' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
    {icon} <span>{label}</span>
    {disabled && tooltip && (
      <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-[#1a1a1a] border border-white/10 text-[#FF8A3D] text-[10px] rounded-md shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 transform translate-y-1 group-hover:translate-y-0">
        {tooltip}
      </div>
    )}
  </button>
);

const SectionLabel = ({ icon, children }) => <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">{icon} {children}</div>;

const ParamSection = ({ label, options, translations, active, onChange, grid }) => (
  <div>
    <div className="text-[10px] text-white/40 font-bold uppercase mb-2">{label}</div>
    <div className={grid ? "grid grid-cols-3 gap-2" : "flex gap-2 overflow-x-auto pb-2 scrollbar-hide"}>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} className={`px-3 py-2 rounded-lg text-[10px] font-medium border transition-all whitespace-nowrap ${active === opt ? 'bg-[#FF8A3D] border-[#FF8A3D] text-white shadow-lg shadow-orange-900/20' : 'bg-[#141414] border-transparent text-white/50 hover:bg-white/5 hover:text-white'}`}>
          {translations ? translations[opt] : opt}
        </button>
      ))}
    </div>
  </div>
);

const ActionBtn = ({ icon, onClick, tooltip }) => (
  <button onClick={onClick} className="p-2.5 rounded-full hover:bg-white/10 text-white transition-colors relative group/btn" title={tooltip}>
    {icon}
  </button>
);

export default AIPhotoStudio;