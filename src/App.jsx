import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Image as ImageIcon, Settings, Sparkles, UploadCloud,
  History, Download, Maximize2, Palette,
  Monitor, BoxSelect, Copy, Camera, User, Edit3, Globe,
  LogOut, X, Loader2, Check, Lock, AlertCircle, RefreshCw, Zap, Plus, Trash2, CheckCircle,
  Home, ArrowRight, Wand2, ArrowLeft, FolderOpen, Filter,
  Video, PlayCircle, Film,
} from 'lucide-react';
import { Layout } from './components/layout/Layout';
import { TaskProvider, useTaskManager, TASK_STATUS } from './context/TaskContext';

//t [重要配置] 开发环境从 .env.development 读取, 生产环境留空让 Nginx 转发
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
// 这样既能读本地 .env，上线后读不到就会自动变空字符串(适配Nginx)

// ==========================================
// 🎨 [在此处修改 LOGO]
// 把下面的链接换成您自己的 Logo 图片地址
// ==========================================
const LOGO_URL = "https://ai-shot.oss-cn-hangzhou.aliyuncs.com/uploads/logo.png";

// --- 辅助函数：强制转换为 HTTPS 域名链接 ---
// 解决 ERR_CERT_COMMON_NAME_INVALID 的核心：把 IP 替换为域名
const toSecureUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("blob:")) return url;

  // [核心修复] 如果链接里包含您的IP，强制替换为域名
  // 请确保这里的域名和您的一致
  const YOUR_DOMAIN = "aigcog.com";
  const YOUR_IP = "8.149.136.249";

  let secureUrl = url;
  if (secureUrl.includes(YOUR_IP)) {
    secureUrl = secureUrl.replace(YOUR_IP, YOUR_DOMAIN);
  }
  if (secureUrl.startsWith("http:")) {
    secureUrl = secureUrl.replace("http:", "https:");
  }
  return secureUrl;
};

// ==========================================
// 🎨 LOGO 组件 (图片版)
// ==========================================
const OGLogo = () => {
  const [error, setError] = useState(false);
  if (LOGO_URL && !error) {
    return (
      <img
        src={LOGO_URL}
        alt="Logo"
        className="w-8 h-8 rounded-lg shadow-lg shadow-orange-500/20 object-cover"
        onError={() => setError(true)}
      />
    );
  }
  // 备用 SVG Logo
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="shadow-lg shadow-orange-500/20 rounded-xl">
      <rect width="40" height="40" rx="12" fill="#FF8A3D" />
      <path d="M11 13L15 27L19 13H21L25 27L29 13" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// --- 📝 [在此处修改文案] ---
const TRANSLATIONS = {
  en: {
    nav: { product: "Product Shot", retouch: "AI Retouch", portrait: "Portrait", soon: "Coming Soon" },
    auth: {
      login: "Log In", logout: "Log Out", submit: "Sign In", welcome: "Welcome",
      productName: "OG AI",
      subtitle: "Professional AI Photography",
      phone: "Phone Number", code: "Verification Code",
      placeholderPhone: "Enter your phone number",
      placeholderCode: "Enter 6-digit code",
      sendCode: "Get Code", sending: "Sending...", resend: "Resend"
    },
    upload: { title: "Reference Images", desc: "Upload", uploaded: "Ready", uploading: "...", change: "Change" },
    prompt: { label: "Creative Prompt", placeholder: "Describe materials, lighting, and mood...", enhance: "AI Enhance", enhancing: "Optimizing..." },
    styles: { Luxurious: "Luxurious", Minimal: "Minimal", Nature: "Nature", Cyberpunk: "Cyberpunk", Studio: "Studio", Soft: "Soft", Vintage: "Vintage", Cinematic: "Cinematic", Neon: "Neon" },
    template: "Reference Templates",
    resolution: "Output Size", ratio: "Aspect Ratio",
    generate: { idle: "Generate", loading: "Creating...", disabled: "Upload Image First", loginRequired: "Login to Create", quotaEmpty: "Quota Exceeded" },
    status: { ready: "OG AI Ready", powered: "Powered by TT-API", generating: "Creating your masterpiece...", failed: "Generation Failed" },
    gallery: { title: "History", empty: "No creations yet" },
    quota: "Credits",
    toast: { copySuccess: "Copied!", copyFail: "Copy Failed", downloadFail: "Download Failed", downloadSuccess: "Downloaded!", httpsRequired: "Copy requires HTTPS" },
    actions: { download: "Download", fullscreen: "Fullscreen", copy: "Copy Image" }
  },
  zh: {
    nav: { product: "商品摄影", retouch: "智能修图", portrait: "个人写真", soon: "敬请期待" },
    auth: {
      login: "登录 / 注册", logout: "退出登录", submit: "登录 / 注册", welcome: "欢迎回来",
      productName: "OG AI",
      subtitle: "专业 AI 商品摄影工坊",
      phone: "手机号", code: "验证码",
      placeholderPhone: "请输入手机号",
      placeholderCode: "请输入6位验证码",
      sendCode: "获取验证码", sending: "发送中...", resend: "重新获取"
    },
    upload: { title: "参考图", desc: "上传参考图", uploaded: "已就绪", uploading: "上传中...", change: "更换" },
    prompt: { label: "创意描述", placeholder: "描述材质、光影氛围、背景细节...", enhance: "AI 润色", enhancing: "优化中..." },
    styles: { Luxurious: "奢华质感", Minimal: "极简白底", Nature: "自然森系", Cyberpunk: "赛博朋克", Studio: "专业影棚", Soft: "柔和光影", Vintage: "复古胶片", Cinematic: "电影大片", Neon: "霓虹光效" },
    template: "参考模版",
    resolution: "输出画质", ratio: "画幅比例",
    generate: { idle: "立即生成", loading: "任务提交中...", disabled: "请先上传图片", loginRequired: "请登录后使用", quotaEmpty: "配额已用尽" },
    status: { ready: "OG AI 就绪", powered: "由 TT-API 驱动", generating: "正在精心绘制中...", failed: "生成失败" },
    gallery: { title: "创作记录", empty: "暂无历史记录" },
    quota: "剩余点数",
    toast: { copySuccess: "已复制到剪贴板", copyFail: "复制失败", downloadFail: "下载失败", downloadSuccess: "下载成功", httpsRequired: "复制功能需要 HTTPS 安全协议" },
    actions: { download: "下载图片", fullscreen: "全屏查看", copy: "复制图片" }
  }
};

// ==========================================
// 📋 参考模版数据
// ==========================================
const TEMPLATES = [
  {
    id: 'storyboard',
    name: { zh: '3X3故事板', en: '3x3 Storyboard' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/3x3.png',
    prompt: '为高端{{家具}}电商广告制作一张 3×3 的写实风格故事板联系表，广告中仅包含以下产品： {{主产品}}和{{辅助产品}}\n背景{{背景}} \n照明{{照明}} \n生成一个等间距的 3×3 网格。'
  },
  {
    id: 'frozen',
    name: { zh: '冰爽优雅', en: 'Frozen Elegance' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/%E5%86%B0%E7%88%BD.jpeg',
    prompt: '想象一下这样的视觉概念：[产品名称]（标签上印有{{}}文字）悬浮在一块裂纹遍布的超透明冰块中。产品清晰可见，周围环绕着一层薄霜。它静置于光滑的白色丝绸之上，环境灯光冷峻而优雅，光影在丝绸表面跳跃闪烁。请以奢华的韩国护肤品广告风格，用丰富的视觉细节描绘整个场景。'
  },
  {
    id: 'brand',
    name: { zh: '品牌设计', en: 'Brand Design' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/pinpai.png',
    prompt: 'Create a vertical 9:16 brand design guide poster using the uploaded product image. Adapt the design style to match the product\'s niche and visual identity. Structure the poster with clear, elegant sections: (1) Large logo display and safe zone usage, (2) Product mockup centered and highlighted, (3) Primary and secondary color palette swatches with hex codes, (4) Typography guide with heading, subheading, body font samples, and line spacing specs, (5) Iconography or graphic motif examples used by the brand, (6) Image treatment style with sample lifestyle or studio visuals, (7) Grid system or layout rules, (8) Packaging mockups and surface applications, (9) Do\'s & Don\'ts with annotated visuals. Use minimalist white or soft neutral background with structured layout dividers and drop shadows. The result must be visually rich, clean, and suitable for a printed or digital brand book.'
  },
  {
    id: 'food',
    name: { zh: '食品海报', en: 'Food Poster' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/%E9%A3%9F%E5%93%81.jpeg',
    prompt: 'A 2:3 aspect ratio, vertical, high-resolution food advertisement showcasing the most representative and delicious product from the uploaded reference image. The product is centered and enhanced with mouthwatering details such as melting cheese, dripping chocolate, whipped cream, or condensed moisture. The background should use a gradient or soft color scheme consistent with the brand image. A slogan aligned with the brand style should be prominently displayed at the top. The official brand logo should be included at the bottom. Utilize cinematic studio lighting, soft shadows, and ultra-clear textures to create a visually impactful yet minimalist poster.'
  },
  {
    id: 'glass',
    name: { zh: '拟态玻璃', en: 'Glass Morph' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/%E6%8B%9F%E6%80%81%E7%8E%BB%E7%92%83.jpeg',
    prompt: '[产品名称] in a surreal, minimalist paper-glass style advertisement.\nThe product is centered, crafted from translucent frosted glass-paper, placed against a clean white or softly tinted background.\nSoft cinematic lighting creates gentle contrast and ambient shadows.\nA single brand color subtly interacts with the scene through glow, mist, liquid, or foam.\nInclude a bold, elegant 4-word slogan near the product.\nThe brand logo appears subtly etched, glowing, or printed in a refined manner.\nVertical or square aspect ratio, ultra-detailed, poster-quality, visually soothing and conceptually refined.'
  },
  {
    id: 'sky',
    name: { zh: '从天而降', en: 'Sky Drop' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/%E5%A4%A9.png',
    prompt: '创作一张比例为 1:1 的图片\n一张梦幻般的品牌广告，广告主角是 [品牌名称]。广告中，品牌设计了一个泡泡状的胶囊，胶囊内装着品牌专属颜色的降落伞包装，包装盒内是他们的经典产品。背景是蓝天、模糊的降落伞包装、白云，顶部有一个小小的品牌标志，下方是一句简洁的标语。广告采用电影级的日光照明，并运用了镜头光晕、景深和 HDR 技术。'
  },
  {
    id: 'planet',
    name: { zh: '品牌星球', en: 'Brand Planet' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/mac%20book%20word.png',
    prompt: 'Planet [产品名称], Year 3025. A distant world shaped entirely by the essence of the brand. The landscapes echo its core identity — from surreal terrains to fantastical weather patterns. Native flora and fauna embody its signature ingredients and aesthetics. Rivers flow with iconic flavors. Architecture is inspired by its packaging and visual language, fused with futuristic technology. The atmosphere is rich in texture, cinematic lighting, and surreal detail. A dreamlike vision of brand identity reimagined as a sci-fi utopia.'
  }
];

const FullscreenViewer = ({ isOpen, image, onClose }) => {
  if (!isOpen || !image) return null;
  const secureImage = toSecureUrl(image);
  return (
    <div className="fixed top-14 md:top-16 bottom-0 left-0 right-0 z-[50] bg-black/95 flex items-center justify-center p-4 md:p-8" onClick={onClose}>
      {/* 关闭按钮 - 简洁风格 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-white/80 hover:text-white transition-colors"
      >
        <X size={28} />
      </button>
      <img src={secureImage} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" onClick={(e) => e.stopPropagation()} alt="Fullscreen" />
    </div>
  );
};

// ==========================================
// 🔔 Toast 通知组件
// ==========================================
const Toast = ({ message, type = 'success', onClose }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current?.(), 3000);
    return () => clearTimeout(timer);
  }, []);

  const icons = {
    success: <CheckCircle size={18} className="text-green-400" />,
    error: <AlertCircle size={18} className="text-red-400" />,
    info: <AlertCircle size={18} className="text-blue-400" />
  };

  const colors = {
    success: 'border-green-500/30 bg-green-500/10',
    error: 'border-red-500/30 bg-red-500/10',
    info: 'border-blue-500/30 bg-blue-500/10'
  };

  return (
    <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl border ${colors[type]} backdrop-blur-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300`}>
      {icons[type]}
      <span className="text-sm text-white font-medium">{message}</span>
    </div>
  );
};

// ==========================================
// 📂 全局图库组件
// ==========================================

const MediaRenderer = ({ src, alt, className, onClick }) => {
  if (!src) return null;
  const isVideo = src.includes('.mp4') || src.includes('video');
  if (isVideo) {
    return (
      <video 
        src={src} 
        className={`${className} object-cover`} 
        onClick={onClick}
        autoPlay loop muted playsInline
      />
    );
  }
  return <img src={src} alt={alt || 'media'} className={className} onClick={onClick} />;
};

const GalleryModal = ({ isOpen, onClose, token, lang }) => {
  const [history, setHistory] = useState([]);
  const [filter, setFilter,] = useState('all'); // all, product, retouch, portrait
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // 要删除的图片ID
  const [deleting, setDeleting] = useState(false);

  const t = TRANSLATIONS[lang];

  const filterOptions = [
    { id: 'all', label: { zh: '全部', en: 'All' } },
    { id: 'product', label: { zh: '商品摄影', en: 'Product' } },
    { id: 'retouch', label: { zh: '智能修图', en: 'Retouch' } },
    { id: 'portrait', label: { zh: '人像写真', en: 'Portrait' } },
    { id: 'video', label: { zh: '视频生成', en: 'Video' } }
  ];

  const fetchAllHistory = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (itemId) => {
    if (!token || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/history/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setHistory(prev => prev.filter(item => item.id !== itemId));
        setDeleteConfirm(null);
        if (selectedImage?.id === itemId) setSelectedImage(null);
      }
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  useEffect(() => {
    if (isOpen && token) fetchAllHistory();
  }, [isOpen, token]);

  const filteredHistory = history.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'product') return !item.type || item.type === 'product';
    return item.type === filter;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          <FolderOpen size={24} className="text-[#FF8A3D]" />
          <h2 className="text-xl font-bold text-white">{lang === 'zh' ? '我的图库' : 'My Gallery'}</h2>
        </div>
        <div className="flex items-center gap-4">
          {/* 筛选器 */}
          <div className="flex items-center gap-2 bg-white/5 rounded-full p-1">
            {filterOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setFilter(opt.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all
                  ${filter === opt.id ? 'bg-[#FF8A3D] text-white' : 'text-white/60 hover:text-white'}`}
              >
                {opt.label[lang]}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={32} className="animate-spin text-[#FF8A3D]" />
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/30">
            <FolderOpen size={48} className="mb-4" />
            <p>{lang === 'zh' ? '暂无图片' : 'No images'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredHistory.map(item => (
              <div
                key={item.id}
                className="aspect-square rounded-xl overflow-hidden border border-white/10 cursor-pointer group relative bg-[#111] hover:border-[#FF8A3D]/50 transition-all hover:shadow-lg hover:shadow-orange-900/20"
              >
                <img
                  src={toSecureUrl(item.image)}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  alt=""
                  onClick={() => setSelectedImage(item)}
                />
                {/* 删除按钮 */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-red-600 text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                  title={lang === 'zh' ? '删除' : 'Delete'}
                >
                  <Trash2 size={14} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent" onClick={() => setSelectedImage(item)}>
                  <p className="text-[10px] text-white/70 line-clamp-1">{item.prompt}</p>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full mt-1 inline-block
                    ${item.type === 'retouch' ? 'bg-purple-500/30 text-purple-300' :
                      item.type === 'portrait' ? 'bg-cyan-500/30 text-cyan-300' :
                        'bg-orange-500/30 text-orange-300'}`}>
                    {item.type === 'retouch' ? '修图' : item.type === 'portrait' ? '人像' : '商品'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[1002] bg-black/80 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-4">{lang === 'zh' ? '确认删除' : 'Confirm Delete'}</h3>
            <p className="text-white/60 text-sm mb-8">{lang === 'zh' ? '确定要删除这张图片吗？此操作无法撤销。' : 'Are you sure you want to delete this image? This action cannot be undone.'}</p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {lang === 'zh' ? '删除' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 图片预览 */}
      {selectedImage && (
        <div className="fixed inset-0 z-[1001] bg-black/95 flex items-center justify-center p-8" onClick={() => setSelectedImage(null)}>
          <button onClick={() => setSelectedImage(null)} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
            <X size={24} />
          </button>
          {/* 预览界面的删除按钮 */}
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(selectedImage.id); }}
            className="absolute top-6 right-20 p-2 bg-white/10 hover:bg-red-600 rounded-full text-white transition-colors"
            title={lang === 'zh' ? '删除' : 'Delete'}
          >
            <Trash2 size={20} />
          </button>
          <img src={toSecureUrl(selectedImage.image)} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} alt="" />
        </div>
      )}
    </div>
  );
};

// ==========================================
// 🏠 首页组件
// ==========================================
const HomePage = ({ onNavigate, token, lang }) => {
  const t = TRANSLATIONS[lang];
  const [recentHistory, setRecentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const features = [
    {
      id: 'video',
      icon: <Film size={28} />,
      title: { zh: '视频生成', en: 'Video Generation' },
      desc: { zh: '让画面动起来，赋予无限生命力。', en: 'Bring your images to life with motion.' },
      available: true,
      gradient: 'from-[#EF4444] to-[#B91C1C]'
    },
    {
      id: 'product',
      icon: <Camera size={28} />,
      title: { zh: '商品摄影', en: 'Product Photography' },
      desc: { zh: '毫厘尽显匠心，一眼即是心动。', en: 'Every detail tells a story.' },
      available: true,
      gradient: 'from-[#FF8A3D] to-[#E65100]'
    },
    {
      id: 'retouch',
      icon: <Wand2 size={28} />,
      title: { zh: '智能修图', en: 'AI Retouch' },
      desc: { zh: '懂审美的AI，让想象触手可及。', en: 'Perfect images with AI magic.' },
      available: true,
      gradient: 'from-[#8B5CF6] to-[#6D28D9]'
    },
    {
      id: 'portrait',
      icon: <User size={28} />,
      title: { zh: '人像写真', en: 'Portrait Photography' },
      desc: { zh: '以光影为笔，描绘灵魂的轮廓。', en: 'Telling your story through light and shadow.' },
      available: true,
      gradient: 'from-[#06B6D4] to-[#0891B2]'
    },
    {
      id: 'create',
      icon: <Edit3 size={28} />,
      title: { zh: '基础创作', en: 'Basic Create' },
      desc: { zh: '文生图、图生图，任意创作。', en: 'Text2Img, Img2Img, free creation.' },
      available: true,
      gradient: 'from-[#10B981] to-[#059669]'
    }
  ];

  // 加载最近创作记录 - 仅显示已完成的作品
  useEffect(() => {
    const fetchRecentHistory = async () => {
      if (!token) return;
      setLoadingHistory(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/history`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const serverData = await res.json();
          // 只显示已完成的服务器历史记录，不显示进行中的任务
          setRecentHistory(serverData.slice(0, 8));
        }
      } catch (err) { console.error(err); }
      finally { setLoadingHistory(false); }
    };
    fetchRecentHistory();
    // 移除自动刷新，避免滚动时被重置
  }, [token]);

  return (
    <>
      <Helmet>
        <title>{lang === 'zh' ? 'OG AI - 首页 | AI商品摄影与智能修图' : 'OG AI - Home | AI Photography & Editing'}</title>
        <meta name="description" content={lang === 'zh' ? 'OG AI - 专业的AI商品摄影和智能修图平台。一键生成高质量商品图片，AI智能修图，个人写真制作。' : 'OG AI - Professional AI photography and editing platform. Generate high-quality product images with one click.'} />
      </Helmet>
      <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
        {/* 动态光晕背景 */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#FF8A3D]/8 rounded-full blur-[150px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#8B5CF6]/8 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* 欢迎区域 */}
        <div className="relative z-10 mb-8">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {lang === 'zh' ? '开始创作' : 'Start Creating'}
          </h1>
          <p className="text-white/50 text-sm md:text-base">
            {lang === 'zh' ? '选择一个功能，开启 AI 创意之旅' : 'Choose a feature to start your AI creative journey'}
          </p>
        </div>

        {/* 快捷入口卡片 */}
        <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-10">
          {features.map((feature) => (
            <div
              key={feature.id}
              onClick={() => feature.available && onNavigate(feature.id)}
              className={`group relative p-4 md:p-5 rounded-xl border transition-all duration-300 cursor-pointer
              ${feature.available
                  ? 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05] hover:scale-[1.02]'
                  : 'bg-white/[0.02] border-white/5 cursor-not-allowed opacity-60'
                }`}
            >
              {/* 图标 */}
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-tr ${feature.gradient} flex items-center justify-center mb-3 
              ${feature.available ? 'group-hover:scale-110 transition-transform duration-300' : 'grayscale'}`}>
                {feature.icon}
              </div>

              {/* 标题 */}
              <h3 className="text-base md:text-lg font-bold mb-1">{feature.title[lang]}</h3>

              {/* 描述 */}
              <p className="text-white/40 text-xs md:text-sm line-clamp-2">{feature.desc[lang]}</p>

              {/* 进入箭头 */}
              {feature.available && (
                <ArrowRight size={16} className="absolute top-4 right-4 text-white/20 group-hover:text-[#FF8A3D] group-hover:translate-x-1 transition-all" />
              )}
            </div>
          ))}
        </div>

        {/* 最近创作记录 */}
        {token && (
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
                <History size={20} className="text-[#FF8A3D]" />
                {lang === 'zh' ? '最近创作' : 'Recent Creations'}
              </h2>
              <button
                onClick={() => onNavigate('gallery')}
                className="text-xs text-white/50 hover:text-[#FF8A3D] transition-colors flex items-center gap-1"
              >
                {lang === 'zh' ? '查看全部' : 'View All'}
                <ArrowRight size={14} />
              </button>
            </div>

            {loadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[#FF8A3D]" />
              </div>
            ) : recentHistory.length === 0 ? (
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-8 text-center">
                <FolderOpen size={40} className="mx-auto mb-3 text-white/20" />
                <p className="text-white/40 text-sm">
                  {lang === 'zh' ? '暂无创作记录，开始你的第一次创作吧！' : 'No creations yet. Start your first creation!'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                {recentHistory.map(item => (
                  <div
                    key={item.id}
                    className="aspect-square rounded-xl overflow-hidden border border-white/10 group relative bg-[#111] hover:border-[#FF8A3D]/50 transition-all cursor-pointer"
                    onClick={() => onNavigate('gallery')}
                  >
                    <img src={toSecureUrl(item.image)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="" />
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-[10px] text-white/70 line-clamp-1">{item.prompt}</p>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full mt-1 inline-block
                      ${item.type === 'retouch' ? 'bg-purple-500/30 text-purple-300' :
                          item.type === 'portrait' ? 'bg-cyan-500/30 text-cyan-300' :
                            item.type === 'create' ? 'bg-green-500/30 text-green-300' :
                              'bg-orange-500/30 text-orange-300'}`}>
                        {item.type === 'retouch' ? (lang === 'zh' ? '修图' : 'Retouch') :
                          item.type === 'portrait' ? (lang === 'zh' ? '人像' : 'Portrait') :
                            item.type === 'create' ? (lang === 'zh' ? '创作' : 'Create') :
                              (lang === 'zh' ? '商品' : 'Product')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 未登录提示 */}
        {!token && (
          <div className="relative z-10 bg-gradient-to-r from-[#FF8A3D]/10 to-[#E65100]/10 border border-[#FF8A3D]/20 rounded-xl p-6 text-center">
            <p className="text-white/70 mb-3">
              {lang === 'zh' ? '登录后可保存创作记录并使用全部功能' : 'Login to save your creations and access all features'}
            </p>
            <p className="text-white/40 text-sm">
              {lang === 'zh' ? '点击右上角登录按钮开始' : 'Click the login button in the top right to get started'}
            </p>
          </div>
        )}
      </div>
    </>
  );
};

// ==========================================
// 👤 人像写真组件
// ==========================================
const PORTRAIT_TEMPLATES = [
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204825_350.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204545_252.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204511_359.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204428_924.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204310_957.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204209_146.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204129_497.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204100_675.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/704.jpeg'
];

const PortraitStudio = ({ onBack, lang, setLang }) => {
  const t = TRANSLATIONS[lang];
  const taskManager = useTaskManager(); // 任务管理器
  const taskManagerRef = useRef(taskManager);
  taskManagerRef.current = taskManager; // 保持最新引用

  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'Guest');
  const [quota, setQuota] = useState(() => {
    const saved = localStorage.getItem('quota');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [showLogin, setShowLogin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });

  // 核心状态
  const [subjectImage, setSubjectImage] = useState(null); // 本人照片
  const [targetImage, setTargetImage] = useState(null);   // 目标写真

  // const [isGenerating, setIsGenerating] = useState(false); // Removed
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  // 初始化时立即从 TaskManager 读取运行中的任务，避免页面切换时数据消失
  const [history, setHistory] = useState(() => {
    const runningTasks = taskManager.getTasksByType('portrait')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      .map(t => ({
        id: t.id,
        image: t.metadata?.targetImage || '',
        prompt: t.prompt,
        timestamp: t.startTime / 1000,
        type: 'portrait',
        status: t.status === TASK_STATUS.PENDING ? 'pending' : 'running',
        progress: t.progress || 0
      }));
    return runningTasks;
  });
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const activeHistoryIdRef = useRef(activeHistoryId);
  activeHistoryIdRef.current = activeHistoryId; // 保持最新值，避免闭包问题

  const isLoggedIn = !!token;
  const isValid = subjectImage && targetImage;

  // 返回时检测任务状态
  // 返回时检测任务状态
  const handleBack = () => {
    onBack?.();
  };

  const handleLogin = (newToken, newUser, newQuota) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUser);
    localStorage.setItem('quota', newQuota.toString());
    setToken(newToken); setUsername(newUser); setQuota(newQuota);
    setShowLogin(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('quota');
    setToken(null); setUsername('Guest'); setQuota(0);
    setHistory([]); setActiveHistoryId(null);
  };

  // 加载历史记录
  const fetchHistory = async () => {
    if (!token) return;
    const portraitHistory = [];
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const serverHistory = data.filter(item => item.type === 'portrait').map(item => ({ ...item, status: 'done', progress: 100 }));
        portraitHistory.push(...serverHistory);
      }
    } catch (err) { console.error('Fetch history failed:', err); }

    // 智能对账：清理僵尸任务 (Smart Reconciliation)
    const runningTasks = taskManagerRef.current.getTasksByType('portrait')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING);

    runningTasks.forEach(localTask => {
      // 尝试在服务端历史中找到匹配项 (匹配 Prompt 和 时间范围)
      const match = portraitHistory.find(serverItem => {
        // 宽松匹配：服务端时间通常晚于开始时间 (允许误差)
        // 注意：服务端 prompt 可能会带有格式，这里简单匹配
        const timeMatch = serverItem.timestamp >= (localTask.startTime / 1000) - 600; // 允许10分钟误差(服务端时间可能不准)
        return serverItem.prompt === localTask.prompt && timeMatch;
      });

      if (match) {
        // 找到匹配，说明服务端已完成 -> 完成本地任务
        taskManagerRef.current.completeTask(localTask.id, match.image);
      } else if (Date.now() - localTask.startTime > 30 * 60 * 1000) {
        // 超过30分钟未完成且未在历史中找到 -> 标记为超时失败
        taskManagerRef.current.failTask(localTask.id, 'Timeout: Task not found on server');
      }
    });

    // 重新获取合并后的列表 (taskManager状态已更新，已完成的任务将不再出现在 runningTasks 中)
    const activeRunningTasks = taskManagerRef.current.getTasksByType('portrait')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      .map(t => ({
        id: t.id,
        image: t.metadata?.targetImage || '', // 暂时显示目标图
        prompt: t.prompt,
        timestamp: t.startTime / 1000,
        type: 'portrait',
        status: t.status === TASK_STATUS.PENDING ? 'pending' : 'running',
        progress: t.progress || 0
      }));

    const finalHistory = [...activeRunningTasks, ...portraitHistory];
    setHistory(finalHistory);
    if ((activeRunningTasks.length > 0 || finalHistory.length > 0) && !activeHistoryIdRef.current) {
      setActiveHistoryId(finalHistory[0]?.id);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000); // 加快刷新频率到5秒，以便更快同步状态
    return () => clearInterval(interval);
  }, [token]);

  // 同步任务进度
  useEffect(() => {
    const syncTaskProgress = () => {
      const runningTasks = taskManager.getTasksByType('portrait');
      if (runningTasks.length === 0) return;

      setHistory(prev => prev.map(h => {
        const task = runningTasks.find(t => t.id === h.id);
        if (task) {
          let newStatus = h.status;
          if (task.status === TASK_STATUS.SUCCESS) newStatus = 'done';
          else if (task.status === TASK_STATUS.ERROR) newStatus = 'error';
          else if (task.status === TASK_STATUS.RUNNING) newStatus = 'running';
          else newStatus = 'pending';

          return {
            ...h,
            progress: task.progress || h.progress,
            status: newStatus,
            image: task.result || h.image,
            error: task.error || h.error
          };
        }
        return h;
      }));
    };
    const interval = setInterval(syncTaskProgress, 500);
    return () => clearInterval(interval);
  }, [taskManager]);

  // 上传图片
  const uploadImage = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return data.url;
  };

  const handleSubjectChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) { setShowLogin(true); return; }
    try {
      const url = await uploadImage(file);
      setSubjectImage(url);
    } catch { showToast('上传失败', 'error'); }
  };

  const handleTargetChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) { setShowLogin(true); return; }
    try {
      const url = await uploadImage(file);
      setTargetImage(url);
    } catch { showToast('上传失败', 'error'); }
  };

  const handleSelectTemplate = (url) => {
    setTargetImage(url);
    setShowTemplates(false);
  };

  const handleGenerate = async () => {
    if (!isValid || !token) return;
    if (quota <= 0) { showToast(t.toast.noQuota, 'error'); return; }

    const taskName = lang === 'zh' ? '人像写真' : 'Portrait';
    const taskId = taskManager.createTask('portrait', `[${taskName}]`, {
      subjectImage,
      targetImage
    });

    // 立即添加到历史
    const newItem = {
      id: taskId,
      image: targetImage, // 预览图先显示目标风格图
      prompt: `[${taskName}]`,
      timestamp: Date.now() / 1000,
      type: 'portrait',
      status: 'pending',
      progress: 0
    };
    setHistory(prev => [newItem, ...prev]);
    setActiveHistoryId(taskId);
    showToast(t.toast.genSuccess); // 提示"开始任务"

    executePortraitTask(taskId, subjectImage, targetImage);
  };

  // 异步执行任务
  const executePortraitTask = async (taskId, sImg, tImg) => {
    taskManager.updateTask(taskId, { status: TASK_STATUS.RUNNING });
    // setIsGenerating(false); // Removed

    // 模拟进度
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 1 + Math.random() * 2, 95);
      setHistory(prev => prev.map(h => h.id === taskId ? { ...h, progress: currentProgress } : h));
      taskManager.updateProgress(taskId, currentProgress);
    }, 500);

    try {
      const formData = new FormData();
      formData.append('subject_url', sImg);
      formData.append('target_url', tImg);

      const res = await fetch(`${API_BASE_URL}/api/portrait`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Generation failed');
      }

      const data = await res.json();

      // 成功
      taskManager.completeTask(taskId, data.data.image_url);
      setQuota(data.data.remaining_quota);
      localStorage.setItem('quota', data.data.remaining_quota.toString());

      setHistory(prev => prev.map(h => h.id === taskId ? {
        ...h,
        image: data.data.image_url,
        status: 'done',
        progress: 100
      } : h));

      if (activeHistoryId === taskId) setResult(data.data.image_url);

    } catch (err) {
      clearInterval(progressInterval);
      taskManager.failTask(taskId, err.message);
      setHistory(prev => prev.map(h => h.id === taskId ? { ...h, status: 'error', error: err.message } : h));
      showToast(err.message, 'error');
    }
  };

  const currentImage = history.find(h => h.id === activeHistoryId)?.image || (activeHistoryId ? null : result); // 优先显示历史选中的图

  const handleDownload = async () => {
    if (!currentImage) return;
    const secureUrl = toSecureUrl(currentImage);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `portrait_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast(t.toast.downloadSuccess);
    } catch (error) {
      // 降级方案：在新标签页打开
      window.open(secureUrl, '_blank');
      showToast(lang === 'zh' ? '已在新标签页打开，请右键保存图片' : 'Opened in new tab, right-click to save', 'info');
    }
  };

  const handleCopy = async () => {
    if (!currentImage) return;
    const secureUrl = toSecureUrl(currentImage);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showToast(t.toast.copySuccess);
    } catch (err) {
      // 降级方案：复制图片URL到剪贴板
      try {
        await navigator.clipboard.writeText(secureUrl);
        showToast(lang === 'zh' ? '已复制图片链接' : 'Image URL copied', 'success');
      } catch {
        showToast(t.toast.copyFail, 'error');
      }
    }
  };

  return (
    <div className="w-full h-full bg-[#050505] text-white font-sans flex flex-col overflow-hidden">
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onLogin={handleLogin} t={t} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Main Content - 与智能修图一致的布局 */}
      <main className="flex-1 flex flex-col md:flex-row gap-0 min-h-0 overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-full md:w-[380px] bg-[#0a0a0a] border-r border-white/5 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Step 1: 本人照片 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
                <span className="w-5 h-5 rounded-full bg-[#06B6D4]/20 text-[#06B6D4] flex items-center justify-center text-[10px] font-bold">1</span>
                {lang === 'zh' ? '上传本人照片' : 'Upload Your Photo'} <span className="text-red-400">*</span>
              </div>
              <div className={`aspect-video rounded-xl border-2 border-dashed transition-all cursor-pointer flex items-center justify-center overflow-hidden relative group/upload
                ${subjectImage ? 'border-[#06B6D4]/50 bg-[#06B6D4]/5' : 'border-white/10 hover:border-[#06B6D4]/30 hover:bg-white/[0.02]'}`}>
                {subjectImage ? (
                  <div className="relative w-full h-full">
                    <img src={toSecureUrl(subjectImage)} className="w-full h-full object-contain" alt="Subject" />
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/upload:opacity-100 transition-opacity">
                      <button onClick={() => setSubjectImage(null)} className="p-1.5 rounded-full bg-black/50 hover:bg-red-600 text-white transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center text-white/30 hover:text-white/50 transition-colors w-full h-full justify-center">
                    <User size={28} className="mb-2" />
                    <span className="text-xs">{lang === 'zh' ? '点击上传本人照片' : 'Click to upload your photo'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleSubjectChange} />
                  </label>
                )}
              </div>
            </div>

            {/* Step 2: 目标写真 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
                <span className="w-5 h-5 rounded-full bg-[#06B6D4]/20 text-[#06B6D4] flex items-center justify-center text-[10px] font-bold">2</span>
                {lang === 'zh' ? '目标写真/服装' : 'Target Style'} <span className="text-red-400">*</span>
              </div>
              <div className={`aspect-video rounded-xl border-2 border-dashed transition-all cursor-pointer flex items-center justify-center overflow-hidden relative group/target
                ${targetImage ? 'border-[#06B6D4]/50 bg-[#06B6D4]/5' : 'border-white/10 hover:border-[#06B6D4]/30 hover:bg-white/[0.02]'}`}>
                {targetImage ? (
                  <div className="relative w-full h-full">
                    <img src={toSecureUrl(targetImage)} className="w-full h-full object-contain" alt="Target" />
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/target:opacity-100 transition-opacity">
                      <button onClick={() => setTargetImage(null)} className="p-1.5 rounded-full bg-black/50 hover:bg-red-600 text-white transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center text-white/30 hover:text-white/50 transition-colors w-full h-full justify-center">
                    <ImageIcon size={28} className="mb-2" />
                    <span className="text-xs">{lang === 'zh' ? '点击上传目标写真' : 'Click to upload target'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleTargetChange} />
                  </label>
                )}
              </div>
              {/* 模板选择按钮 */}
              <button onClick={() => setShowTemplates(true)} className="w-full py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/60 hover:text-white transition-all flex items-center justify-center gap-2">
                <Palette size={14} />
                {lang === 'zh' ? '从模板选择' : 'Choose from Templates'}
              </button>
            </div>
          </div>

          {/* 生成按钮 */}
          <div className="p-4 border-t border-white/5">
            <button
              onClick={handleGenerate}
              disabled={!isValid || !isLoggedIn}
              className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all
                ${isValid && isLoggedIn
                  ? 'bg-gradient-to-r from-[#06B6D4] to-[#0891B2] hover:opacity-90 text-white shadow-lg shadow-cyan-500/20'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
            >
              <><Sparkles size={18} /> {lang === 'zh' ? '创作' : 'Create'}</>
            </button>
          </div>
        </div>

        {/* Center: Result - 与智能修图一致 */}
        <div className="flex-1 bg-[#050505] p-6 flex flex-col">
          <div className="flex-1 rounded-2xl bg-[#0a0a0a] border border-white/5 relative overflow-hidden flex items-center justify-center group">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>



            <div className="relative w-full h-full p-8 flex items-center justify-center">
              {/* 显示当前选中的任务进度 */}
              {(() => {
                const activeTask = history.find(h => h.id === activeHistoryId);
                if (activeTask && (activeTask.status === 'pending' || activeTask.status === 'running')) {
                  return (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
                      <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-4">
                        <div className="h-full bg-[#06B6D4] transition-all duration-300" style={{ width: `${activeTask.progress}%` }}></div>
                      </div>
                      <div className="text-[#06B6D4] font-mono text-2xl animate-pulse">{Math.round(activeTask.progress)}%</div>
                      <div className="text-white/40 text-xs mt-2">{lang === 'zh' ? '正在生成人像写真...' : 'Generating Portrait...'}</div>
                    </div>
                  );
                }
                return null;
              })()}

              {currentImage ? (
                <img src={toSecureUrl(currentImage)} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt="Result" />
              ) : (
                <div className="text-center opacity-20 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl border border-dashed border-white/30 flex items-center justify-center">
                    <User size={32} />
                  </div>
                  <p className="text-sm font-medium">{lang === 'zh' ? '人像写真就绪' : 'Portrait Ready'}</p>
                </div>
              )}
            </div>

            {/* 底部操作栏 */}
            {currentImage && (
              <div className="absolute bottom-8 flex items-center gap-3 p-2 rounded-full bg-[#1e1e1e]/80 border border-white/10 shadow-2xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                <ActionBtn icon={<Download size={18} />} onClick={handleDownload} tooltip={t.actions.download} />
                <ActionBtn icon={<Maximize2 size={18} />} onClick={() => setShowFullscreen(true)} tooltip={t.actions.fullscreen} />
                <div className="w-[1px] h-4 bg-white/10"></div>
                <ActionBtn icon={<Copy size={18} />} onClick={handleCopy} tooltip={t.actions.copy} />
              </div>
            )}
          </div>
        </div>

        {/* 全屏查看器 */}
        <FullscreenViewer isOpen={showFullscreen} image={currentImage} onClose={() => setShowFullscreen(false)} />

        {/* Right History Panel - 与智能修图一致 */}
        <div className="hidden lg:flex w-[200px] bg-[#0a0a0a] border-l border-white/5 flex-col">
          <div className="p-4 border-b border-white/5">
            <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
              <History size={14} /> {t.gallery.title}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => setActiveHistoryId(item.id)}
                className={`aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all relative
                  ${activeHistoryId === item.id ? 'border-[#06B6D4] ring-2 ring-[#06B6D4]/30' : 'border-white/5 hover:border-white/20'}`}
              >
                {item.image && <img src={toSecureUrl(item.image)} className={`w-full h-full object-cover transition-opacity ${item.status === 'done' ? 'opacity-100' : 'opacity-40'}`} alt="" />}

                {/* 进度覆盖层 */}
                {(item.status === 'pending' || item.status === 'running') && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                    <Loader2 size={16} className="text-[#06B6D4] animate-spin mb-1" />
                    <span className="text-[10px] text-[#06B6D4] font-mono">{Math.round(item.progress || 0)}%</span>
                  </div>
                )}

                {/* 失败覆盖层 */}
                {item.status === 'error' && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <AlertCircle size={16} className="text-red-500" />
                  </div>
                )}
              </div>
            ))}
            {history.length === 0 && (
              <div className="text-center text-white/20 text-xs py-8">{t.gallery.empty}</div>
            )}
          </div>
        </div>
      </main>

      {/* Template Modal - 优化弹窗样式 */}
      {showTemplates && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowTemplates(false)}>
          <div className="bg-[#0a0a0a] rounded-2xl border border-white/10 p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Palette size={18} className="text-[#06B6D4]" />
                {lang === 'zh' ? '选择写真模板' : 'Choose Template'}
              </h2>
              <button onClick={() => setShowTemplates(false)} className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {PORTRAIT_TEMPLATES.map((url, i) => (
                <div
                  key={i}
                  onClick={() => handleSelectTemplate(url)}
                  className="aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border-2 border-white/5 hover:border-[#06B6D4] transition-all group hover:shadow-lg hover:shadow-cyan-500/10"
                >
                  <img src={url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={`Template ${i + 1}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// ✏️ 基础创作组件
// ==========================================
const BasicCreateStudio = ({ onBack, lang, setLang }) => {
  const t = TRANSLATIONS[lang];
  const taskManager = useTaskManager();
  const taskManagerRef = useRef(taskManager);
  taskManagerRef.current = taskManager; // 保持最新引用

  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'Guest');
  const [quota, setQuota] = useState(() => {
    const saved = localStorage.getItem('quota');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [showLogin, setShowLogin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });

  // 核心状态
  const [prompt, setPrompt] = useState('');
  const [referImages, setReferImages] = useState([]); // 多参考图

  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  // 初始化时立即从 TaskManager 读取运行中的任务，避免页面切换时数据消失
  const [history, setHistory] = useState(() => {
    const runningTasks = taskManager.getTasksByType('create')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      .map(t => ({
        id: t.id,
        image: t.metadata?.referImages?.[0] || '',
        prompt: t.prompt,
        timestamp: t.startTime / 1000,
        type: 'create',
        status: t.status === TASK_STATUS.PENDING ? 'pending' : 'running',
        progress: t.progress || 0
      }));
    return runningTasks;
  });
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const activeHistoryIdRef = useRef(activeHistoryId);
  activeHistoryIdRef.current = activeHistoryId; // 保持最新值，避免闭包问题

  const isLoggedIn = !!token;
  const isValid = prompt.trim().length > 0;

  const handleBack = () => {
    onBack?.();
  };

  const handleLogin = (newToken, newUser, newQuota) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUser);
    localStorage.setItem('quota', newQuota.toString());
    setToken(newToken); setUsername(newUser); setQuota(newQuota);
    setShowLogin(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('quota');
    setToken(null); setUsername('Guest'); setQuota(0);
    setHistory([]); setActiveHistoryId(null);
  };

  // 加载历史记录
  const fetchHistory = async () => {
    if (!token) return;
    const createHistory = [];
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const serverHistory = data.filter(item => item.type === 'create').map(item => ({ ...item, status: 'done', progress: 100 }));
        createHistory.push(...serverHistory);
      }
    } catch (err) { console.error('Fetch history failed:', err); }

    // 智能对账：清理僵尸任务 (Smart Reconciliation)
    const runningTasks = taskManagerRef.current.getTasksByType('create')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING);

    runningTasks.forEach(localTask => {
      const match = createHistory.find(serverItem => {
        const timeMatch = serverItem.timestamp >= (localTask.startTime / 1000) - 600;
        return serverItem.prompt === localTask.prompt && timeMatch;
      });

      if (match) {
        taskManagerRef.current.completeTask(localTask.id, match.image);
      } else if (Date.now() - localTask.startTime > 30 * 60 * 1000) {
        taskManagerRef.current.failTask(localTask.id, 'Timeout: Task not found on server');
      }
    });

    const activeRunningTasks = taskManagerRef.current.getTasksByType('create')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      .map(t => ({
        id: t.id,
        image: t.metadata?.referImages?.[0] || '', // 如有参考图则显示第一张，否则可能为空
        prompt: t.prompt,
        timestamp: t.startTime / 1000,
        type: 'create',
        status: t.status === TASK_STATUS.PENDING ? 'pending' : 'running',
        progress: t.progress || 0
      }));

    const finalHistory = [...activeRunningTasks, ...createHistory];
    setHistory(finalHistory);
    if ((activeRunningTasks.length > 0 || finalHistory.length > 0) && !activeHistoryIdRef.current) {
      setActiveHistoryId(finalHistory[0]?.id);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000); // 加快刷新
    return () => clearInterval(interval);
  }, [token]);

  // 同步任务进度
  useEffect(() => {
    const syncTaskProgress = () => {
      const runningTasks = taskManager.getTasksByType('create');
      if (runningTasks.length === 0) return;

      setHistory(prev => prev.map(h => {
        const task = runningTasks.find(t => t.id === h.id);
        if (task) {
          let newStatus = h.status;
          if (task.status === TASK_STATUS.SUCCESS) newStatus = 'done';
          else if (task.status === TASK_STATUS.ERROR) newStatus = 'error';
          else if (task.status === TASK_STATUS.RUNNING) newStatus = 'running';
          else newStatus = 'pending';

          return {
            ...h,
            progress: task.progress || h.progress,
            status: newStatus,
            image: task.result || h.image,
            error: task.error || h.error
          };
        }
        return h;
      }));
    };
    const interval = setInterval(syncTaskProgress, 500);
    return () => clearInterval(interval);
  }, [taskManager]);

  // 上传图片
  const uploadImage = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return data.url;
  };

  const handleAddImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) { setShowLogin(true); return; }

    try {
      const url = await uploadImage(file);
      setReferImages(prev => [...prev, url]);
    } catch { showToast('上传失败', 'error'); }
    e.target.value = '';
  };

  const handleRemoveImage = (index) => {
    setReferImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!isValid || !token) return;
    if (quota <= 0) { showToast(t.toast.noQuota, 'error'); return; }

    const taskName = lang === 'zh' ? '基础创作' : 'Basic Create';
    const taskId = taskManager.createTask('create', prompt, {
      referImages
    });

    // 立即添加到历史
    const newItem = {
      id: taskId,
      image: referImages[0] || null, // 优先显示参考图作为占位
      prompt: prompt,
      timestamp: Date.now() / 1000,
      type: 'create',
      status: 'pending',
      progress: 0
    };
    setHistory(prev => [newItem, ...prev]);
    setActiveHistoryId(taskId);

    executeCreateTask(taskId, prompt, referImages);
  };

  // 异步执行创作任务
  const executeCreateTask = async (taskId, p, rImgs) => {
    taskManager.updateTask(taskId, { status: TASK_STATUS.RUNNING });
    // setIsGenerating(false); // Removed

    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 1 + Math.random() * 2, 95);
      setHistory(prev => prev.map(h => h.id === taskId ? { ...h, progress: currentProgress } : h));
      taskManager.updateProgress(taskId, currentProgress);
    }, 500);

    try {
      const formData = new FormData();
      formData.append('prompt', p);
      formData.append('image_urls_json', JSON.stringify(rImgs));

      const res = await fetch(`${API_BASE_URL}/api/create`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        let errMsg = 'Generation failed';
        try {
          const errData = await res.json();
          errMsg = errData.detail || errData.message || errMsg;
        } catch (e) {
          // If JSON parsing fails, just use the default message or response status
          errMsg = `Server error: ${res.status}`;
        }
        throw new Error(errMsg);
      }

      const data = await res.json();

      taskManager.completeTask(taskId, data.data.image_url);
      setQuota(data.data.remaining_quota);
      localStorage.setItem('quota', data.data.remaining_quota.toString());

      setHistory(prev => prev.map(h => h.id === taskId ? {
        ...h,
        image: data.data.image_url,
        status: 'done',
        progress: 100
      } : h));

      if (activeHistoryId === taskId) setResult(data.data.image_url);

    } catch (err) {
      clearInterval(progressInterval);
      taskManager.failTask(taskId, err.message);
      setHistory(prev => prev.map(h => h.id === taskId ? { ...h, status: 'error', error: err.message } : h));
      showToast(err.message, 'error');
    }
  };

  const currentImage = history.find(h => h.id === activeHistoryId)?.image || (activeHistoryId ? null : result);

  const handleDownload = async () => {
    if (!currentImage) return;
    const secureUrl = toSecureUrl(currentImage);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `create_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast(t.toast.downloadSuccess);
    } catch (error) {
      // 降级方案：在新标签页打开
      window.open(secureUrl, '_blank');
      showToast(lang === 'zh' ? '已在新标签页打开，请右键保存图片' : 'Opened in new tab, right-click to save', 'info');
    }
  };

  const handleCopy = async () => {
    if (!currentImage) return;
    const secureUrl = toSecureUrl(currentImage);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showToast(t.toast.copySuccess);
    } catch (err) {
      // 降级方案：复制图片URL到剪贴板
      try {
        await navigator.clipboard.writeText(secureUrl);
        showToast(lang === 'zh' ? '已复制图片链接' : 'Image URL copied', 'success');
      } catch {
        showToast(t.toast.copyFail, 'error');
      }
    }
  };

  return (
    <div className="w-full h-full bg-[#050505] text-white font-sans flex flex-col overflow-hidden">
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onLogin={handleLogin} t={t} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row gap-0 min-h-0 overflow-hidden">
        {/* Left Panel */}
        <div className="w-full md:w-[380px] bg-[#0a0a0a] border-r border-white/5 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Prompt 输入 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
                <Edit3 size={14} /> {lang === 'zh' ? '创意描述' : 'Prompt'} <span className="text-red-400">*</span>
              </div>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={lang === 'zh' ? '描述你想要生成的图像...' : 'Describe the image you want to create...'}
                className="w-full h-32 bg-[#111] border border-white/10 rounded-xl p-4 text-sm text-white placeholder:text-white/30 resize-none focus:border-[#10B981] focus:outline-none transition-colors"
              />
            </div>

            {/* 参考图片（选填） */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
                  <ImageIcon size={14} /> {lang === 'zh' ? '参考图片（选填）' : 'Reference Images (Optional)'}
                </div>
                <span className="text-[10px] text-white/30">{referImages.length}/5</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {referImages.map((url, i) => (
                  <div key={i} className="aspect-square rounded-lg overflow-hidden relative group border border-white/10">
                    <img src={toSecureUrl(url)} className="w-full h-full object-cover" alt="" />
                    <button onClick={() => handleRemoveImage(i)} className="absolute top-1 right-1 p-1 bg-red-500/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {referImages.length < 5 && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-white/10 hover:border-[#10B981]/50 flex items-center justify-center cursor-pointer transition-colors">
                    <Plus size={20} className="text-white/30" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleAddImage} />
                  </label>
                )}
              </div>
              <p className="text-[10px] text-white/30">{lang === 'zh' ? '无图片=文生图 | 有图片=图生图/多参考图' : 'No image=Text2Img | With images=Img2Img'}</p>
            </div>
          </div>

          {/* 生成按钮 */}
          <div className="p-4 border-t border-white/5">
            <button
              onClick={handleGenerate}
              disabled={!isValid || !isLoggedIn}
              className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all
                ${isValid && isLoggedIn
                  ? 'bg-gradient-to-r from-[#10B981] to-[#059669] hover:opacity-90 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
            >
              <><Sparkles size={18} /> {lang === 'zh' ? '开始创作' : 'Create'}</>
            </button>
          </div>
        </div>

        {/* Center: Result */}
        <div className="flex-1 bg-[#050505] p-6 flex flex-col">
          <div className="flex-1 rounded-2xl bg-[#0a0a0a] border border-white/5 relative overflow-hidden flex items-center justify-center group">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

            {activeHistoryId && (() => {
              const activeTask = history.find(h => h.id === activeHistoryId);
              if (activeTask && (activeTask.status === 'pending' || activeTask.status === 'running')) {
                return (
                  <div className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center pointer-events-none">
                    <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-4">
                      <div className="h-full bg-[#10B981] transition-all duration-300" style={{ width: `${activeTask.progress}%` }}></div>
                    </div>
                    <div className="text-[#10B981] font-mono text-2xl animate-pulse">{Math.round(activeTask.progress)}%</div>
                    <div className="text-white/40 text-xs mt-2">{lang === 'zh' ? '正在创作中...' : 'Creating...'}</div>
                  </div>
                );
              }
              // 修复：如果任务失败，显示错误信息
              if (activeTask && activeTask.status === 'error') {
                return (
                  <div className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center pointer-events-none">
                    <AlertCircle size={48} className="text-red-500 mb-4" />
                    <div className="text-red-400 text-sm">{activeTask.error || 'Creation Failed'}</div>
                  </div>
                );
              }
              return null;
            })()}

            <div className="relative w-full h-full p-8 flex items-center justify-center">
              {currentImage ? (
                <img src={toSecureUrl(currentImage)} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt="Result" />
              ) : (
                <div className="text-center opacity-20 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl border border-dashed border-white/30 flex items-center justify-center">
                    <Edit3 size={32} />
                  </div>
                  <p className="text-sm font-medium">{lang === 'zh' ? '基础创作就绪' : 'Basic Create Ready'}</p>
                </div>
              )}
            </div>

            {currentImage && (
              <div className="absolute bottom-8 flex items-center gap-3 p-2 rounded-full bg-[#1e1e1e]/80 border border-white/10 shadow-2xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                <ActionBtn icon={<Download size={18} />} onClick={handleDownload} tooltip={t.actions.download} />
                <ActionBtn icon={<Maximize2 size={18} />} onClick={() => setShowFullscreen(true)} tooltip={t.actions.fullscreen} />
                <div className="w-[1px] h-4 bg-white/10"></div>
                <ActionBtn icon={<Copy size={18} />} onClick={handleCopy} tooltip={t.actions.copy} />
              </div>
            )}
          </div>
        </div>

        <FullscreenViewer isOpen={showFullscreen} image={currentImage} onClose={() => setShowFullscreen(false)} />

        {/* Right History Panel */}
        <div className="hidden lg:flex w-[200px] bg-[#0a0a0a] border-l border-white/5 flex-col">
          <div className="p-4 border-b border-white/5">
            <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
              <History size={14} /> {t.gallery.title}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => setActiveHistoryId(item.id)}
                className={`aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all relative
                  ${activeHistoryId === item.id ? 'border-[#10B981] ring-2 ring-[#10B981]/30' : 'border-white/5 hover:border-white/20'}`}
              >
                {item.image && <img src={toSecureUrl(item.image)} className={`w-full h-full object-cover transition-opacity ${item.status === 'done' ? 'opacity-100' : 'opacity-40'}`} alt="" />}

                {/* 进度覆盖层 */}
                {(item.status === 'pending' || item.status === 'running') && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                    <Loader2 size={16} className="text-[#10B981] animate-spin mb-1" />
                    <span className="text-[10px] text-[#10B981] font-mono">{Math.round(item.progress || 0)}%</span>
                  </div>
                )}

                {/* 失败覆盖层 */}
                {item.status === 'error' && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <AlertCircle size={16} className="text-red-500" />
                  </div>
                )}
              </div>
            ))}
            {history.length === 0 && (
              <div className="text-center text-white/20 text-xs py-8">{t.gallery.empty}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// ==========================================
// 🎨 智能修图组件
// ==========================================
const AIRetouchStudio = ({ onBack, lang, setLang }) => {
  const t = TRANSLATIONS[lang];
  const taskManager = useTaskManager();
  const taskManagerRef = useRef(taskManager);
  taskManagerRef.current = taskManager; // 保持最新引用

  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'Guest');
  const [quota, setQuota] = useState(() => {
    const saved = localStorage.getItem('quota');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [showLogin, setShowLogin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const [sourceImage, setSourceImage] = useState(null);
  const [mode, setMode] = useState('general');
  const [strength, setStrength] = useState('medium');
  const [suggestion, setSuggestion] = useState('');
  // const [isGenerating, setIsGenerating] = useState(false); // Removed

  // 返回时检测任务状态
  // 返回时检测任务状态
  const handleBack = () => {
    onBack?.();
  };
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  // 初始化时立即从 TaskManager 读取运行中的任务，避免页面切换时数据消失
  const [history, setHistory] = useState(() => {
    const runningTasks = taskManager.getTasksByType('retouch')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      .map(t => ({
        id: t.id,
        image: t.metadata?.sourceImage || '',
        prompt: t.prompt,
        timestamp: t.startTime / 1000,
        type: 'retouch',
        status: t.status === TASK_STATUS.PENDING ? 'pending' : 'running',
        progress: t.progress || 0
      }));
    return runningTasks;
  });
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const activeHistoryIdRef = useRef(activeHistoryId);
  activeHistoryIdRef.current = activeHistoryId; // 保持最新值，避免闭包问题

  const fileInputRef = useRef(null);
  const isLoggedIn = !!token;

  const modes = [
    { id: 'general', name: { zh: '通用修图', en: 'General' }, icon: <Sparkles size={20} />, desc: { zh: '修正光影/提升画质/平衡色彩', en: 'Light/Quality/Color' } },
    { id: 'portrait', name: { zh: '人像精修', en: 'Portrait' }, icon: <User size={20} />, desc: { zh: '保留皮肤质感/眼神光/轮廓光', en: 'Skin/Eyes/Contour' } },
    { id: 'landscape', name: { zh: '风景/建筑', en: 'Landscape' }, icon: <ImageIcon size={20} />, desc: { zh: 'HDR效果/通透感/构图增强', en: 'HDR/Clarity/Composition' } },
    { id: 'product', name: { zh: '电商/美食', en: 'Product' }, icon: <Camera size={20} />, desc: { zh: '清晰度/诱人色泽/干净背景', en: 'Sharp/Appetizing/Clean' } }
  ];

  const strengths = [
    { id: 'low', name: { zh: '低', en: 'Low' }, tooltip: { zh: '仅降噪、调色，画面内容不变', en: 'Noise reduction & color correction only' } },
    { id: 'medium', name: { zh: '中', en: 'Medium' }, tooltip: { zh: '磨皮、补光、画面更清晰，但还是那张图', en: 'Skin smoothing & lighting enhancement' } },
    { id: 'high', name: { zh: '高', en: 'High' }, tooltip: { zh: '可能会改变衣服细节、背景，甚至让人物变得更"完美"但稍微不像本人', en: 'May alter details, background, or appearance' } }
  ];

  const handleLogin = (newToken, newUser, newQuota) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUser);
    localStorage.setItem('quota', newQuota.toString());
    setToken(newToken); setUsername(newUser); setQuota(newQuota);
    setShowLogin(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('quota');
    setToken(null); setUsername('Guest'); setQuota(0);
  };

  // 加载历史记录
  const fetchHistory = async () => {
    if (!token) return;
    const retouchHistory = [];
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const serverHistory = data.filter(item => item.type === 'retouch').map(item => ({ ...item, status: 'done', progress: 100 }));
        retouchHistory.push(...serverHistory);
      }
    } catch (err) { console.error('Fetch history failed:', err); }

    // 智能对账 (Smart Reconciliation)
    const runningTasks = taskManagerRef.current.getTasksByType('retouch')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING);

    runningTasks.forEach(localTask => {
      const match = retouchHistory.find(serverItem => {
        const timeMatch = serverItem.timestamp >= (localTask.startTime / 1000) - 600;
        return serverItem.prompt === localTask.prompt && timeMatch;
      });

      if (match) {
        taskManagerRef.current.completeTask(localTask.id, match.image);
      } else if (Date.now() - localTask.startTime > 30 * 60 * 1000) {
        taskManagerRef.current.failTask(localTask.id, 'Timeout: Task not found on server');
      }
    });

    const activeRunningTasks = taskManagerRef.current.getTasksByType('retouch')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      .map(t => ({
        id: t.id,
        image: t.metadata?.sourceImage || '',
        prompt: t.prompt,
        timestamp: t.startTime / 1000,
        type: 'retouch',
        status: t.status === TASK_STATUS.PENDING ? 'pending' : 'running',
        progress: t.progress || 0
      }));

    // 合并：进行中的任务在前面
    setHistory([...activeRunningTasks, ...retouchHistory]);
    // 使用 ref 访问最新值，避免闭包问题导致的自动重置
    if ((activeRunningTasks.length > 0 || retouchHistory.length > 0) && !activeHistoryIdRef.current) {
      setActiveHistoryId(activeRunningTasks[0]?.id || retouchHistory[0]?.id);
    }
  };

  // 定期刷新历史记录（同步 OSS 转存后的新链接）
  useEffect(() => {
    if (!token) return;

    fetchHistory();
    const interval = setInterval(fetchHistory, 5000); // 5秒刷新一次
    return () => clearInterval(interval);
  }, [token]);

  // 定时同步 taskManager 中的任务进度到本地 history
  useEffect(() => {
    const syncTaskProgress = () => {
      const runningTasks = taskManager.getTasksByType('retouch');
      if (runningTasks.length === 0) return;

      setHistory(prev => prev.map(h => {
        const task = runningTasks.find(t => t.id === h.id);
        if (task) {
          // 同步进度和状态
          let newStatus = h.status;
          if (task.status === TASK_STATUS.SUCCESS) newStatus = 'done';
          else if (task.status === TASK_STATUS.ERROR) newStatus = 'error';
          else if (task.status === TASK_STATUS.RUNNING) newStatus = 'running';
          else newStatus = 'pending';

          return {
            ...h,
            progress: task.progress || h.progress,
            status: newStatus,
            image: task.result || h.image,
            error: task.error || h.error
          };
        }
        return h;
      }));
    };

    const interval = setInterval(syncTaskProgress, 500);
    return () => clearInterval(interval);
  }, [taskManager]);

  const activeTask = history.find(item => item.id === activeHistoryId);

  const handleFileChange = async (e) => {
    if (!isLoggedIn) { setShowLogin(true); return; }
    const file = e.target.files[0];
    if (!file) return;

    const preview = URL.createObjectURL(file);
    setSourceImage({ preview, url: null, uploading: true });
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (!res.ok) throw new Error('上传失败');
      const data = await res.json();
      setSourceImage({ preview, url: data.url, uploading: false });
    } catch (err) {
      showToast('上传失败', 'error');
      setSourceImage(null);
    }
    e.target.value = '';
  };

  const handleGenerate = async () => {
    if (!isLoggedIn) { setShowLogin(true); return; }
    if (!sourceImage?.url) { showToast('请先上传图片', 'error'); return; }
    if (quota <= 0) { showToast('配额不足', 'error'); return; }

    // 创建任务并立即添加到历史记录（显示"生成中"）
    const taskId = taskManager.createTask('retouch', `${modes.find(m => m.id === mode)?.name[lang] || mode}`, {
      sourceImage: sourceImage.url,
      mode,
      strength,
      suggestion
    });

    // 创建本地任务记录（带进度）
    const pendingRecord = {
      id: taskId,
      image: sourceImage.url, // 先显示原图
      prompt: `[${modes.find(m => m.id === mode)?.name[lang] || mode}] ${strength}`,
      timestamp: Date.now() / 1000,
      type: 'retouch',
      status: 'pending',
      progress: 0
    };
    setHistory(prev => [pendingRecord, ...prev]);
    setActiveHistoryId(taskId);

    // 异步执行生成任务（不阻塞 UI）
    executeRetouchTask(taskId, sourceImage.url, mode, strength, suggestion);
  };

  // 异步执行修图任务
  const executeRetouchTask = async (taskId, imageUrl, taskMode, taskStrength, taskSuggestion) => {
    // 更新任务状态为运行中
    taskManager.updateTask(taskId, { status: TASK_STATUS.RUNNING });
    setHistory(prev => prev.map(h => h.id === taskId ? { ...h, status: 'running' } : h));

    // 使用累加进度，不再依赖闭包中的 history
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 2 + Math.random() * 3, 95);
      setHistory(prev => prev.map(h =>
        h.id === taskId ? { ...h, progress: currentProgress } : h
      ));
      taskManager.updateProgress(taskId, currentProgress);
    }, 600);

    try {
      const formData = new FormData();
      formData.append('mode', taskMode);
      formData.append('strength', taskStrength);
      formData.append('suggestion', taskSuggestion);
      formData.append('image_url', imageUrl);

      const res = await fetch(`${API_BASE_URL}/api/retouch`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '修图失败');
      }

      const data = await res.json();
      if (data.status === 'SUCCESS') {
        // 任务成功
        taskManager.completeTask(taskId, data.data.image_url);

        // 更新历史记录
        setHistory(prev => prev.map(h =>
          h.id === taskId ? {
            ...h,
            image: data.data.image_url,
            status: 'done',
            progress: 100
          } : h
        ));

        // 更新配额
        setQuota(data.data.remaining_quota);
        localStorage.setItem('quota', data.data.remaining_quota.toString());

        // 如果当前选中的是这个任务，更新结果
        if (activeHistoryId === taskId) {
          setResult(data.data.image_url);
        }

        showToast(lang === 'zh' ? '修图完成！' : 'Retouch complete!', 'success');
      }
    } catch (err) {
      clearInterval(progressInterval);
      taskManager.failTask(taskId, err.message);

      // 更新历史记录为失败状态
      setHistory(prev => prev.map(h =>
        h.id === taskId ? { ...h, status: 'error', error: err.message } : h
      ));

      showToast(err.message, 'error');
    }
  };

  // 获取当前显示的图片URL
  const currentImage = result || activeTask?.image;

  // --- 下载/复制 ---
  const handleDownload = async () => {
    if (!currentImage) return;
    const secureUrl = toSecureUrl(currentImage);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `OG_Retouch_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast(t.toast.downloadSuccess, 'success');
    } catch (error) {
      window.open(secureUrl, '_blank');
      showToast(lang === 'zh' ? '已在新标签页打开，请右键保存图片' : 'Opened in new tab, right-click to save', 'info');
    }
  };

  const handleCopy = async () => {
    if (!currentImage) return;
    const secureUrl = toSecureUrl(currentImage);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showToast(t.toast.copySuccess, 'success');
    } catch (err) {
      // 降级方案：复制图片URL到剪贴板
      try {
        await navigator.clipboard.writeText(secureUrl);
        showToast(lang === 'zh' ? '已复制图片链接' : 'Image URL copied', 'success');
      } catch {
        showToast(t.toast.copyFail, 'error');
      }
    }
  };

  return (
    <div className="w-full h-full bg-[#050505] text-white font-sans flex flex-col overflow-hidden">
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onLogin={handleLogin} t={t} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row gap-0 min-h-0 overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-full md:w-[380px] bg-[#0a0a0a] border-r border-white/5 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 图片上传 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
                <UploadCloud size={14} /> {lang === 'zh' ? '上传图片' : 'Upload Image'} <span className="text-red-400">*</span>
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`aspect-video rounded-xl border-2 border-dashed transition-all cursor-pointer flex items-center justify-center overflow-hidden
                  ${sourceImage ? 'border-[#8B5CF6]/50 bg-[#8B5CF6]/5' : 'border-white/10 hover:border-[#8B5CF6]/30 hover:bg-white/[0.02]'}`}
              >
                {sourceImage ? (
                  <div className="relative w-full h-full group/src">
                    <img src={sourceImage.preview} className="w-full h-full object-contain" alt="source" />
                    {sourceImage.uploading && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="animate-spin text-[#8B5CF6]" size={24} />
                      </div>
                    )}
                    {/* 上传完成后显示操作按钮 */}
                    {!sourceImage.uploading && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/src:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowFullscreen(true); }}
                          className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                          title={t.actions.fullscreen}
                        >
                          <Maximize2 size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSourceImage(null); setResult(null); }}
                          className="p-1.5 rounded-full bg-black/50 hover:bg-red-600 text-white transition-colors"
                          title={lang === 'zh' ? '删除' : 'Remove'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center">
                    <Plus className="mx-auto text-white/30 mb-2" size={32} />
                    <span className="text-xs text-white/30">{lang === 'zh' ? '点击上传图片' : 'Click to upload'}</span>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>

            {/* 修图模式 */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                {lang === 'zh' ? '修图模式' : 'Retouch Mode'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {modes.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`p-3 rounded-xl border transition-all text-left
                      ${mode === m.id
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                        : 'bg-[#141414] border-white/5 text-white/60 hover:border-white/20'}`}
                  >
                    <div className={`mb-2 ${mode === m.id ? 'text-[#8B5CF6]' : 'text-white/40'}`}>{m.icon}</div>
                    <div className="text-xs font-bold">{m.name[lang]}</div>
                    <div className="text-[10px] text-white/40 mt-1">{m.desc[lang]}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 美化强度 */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                {lang === 'zh' ? '美化强度' : 'Enhancement Strength'}
              </div>
              <div className="flex gap-2 relative">
                {strengths.map(s => (
                  <div key={s.id} className="relative group flex-1">
                    <button
                      onClick={() => setStrength(s.id)}
                      className={`w-full py-3 rounded-lg text-xs font-bold transition-all border
                        ${strength === s.id
                          ? 'bg-[#8B5CF6] border-[#8B5CF6] text-white'
                          : 'bg-[#141414] border-white/5 text-white/60 hover:border-white/20'}`}
                    >
                      {s.name[lang]}
                    </button>
                  </div>
                ))}
                {/* Tooltip 显示在按钮组下方，左对齐不超出 */}
                {strengths.map(s => strength !== s.id && (
                  <div
                    key={`tooltip-${s.id}`}
                    className={`absolute top-full left-0 right-0 mt-2 px-3 py-2 bg-[#252526] border border-[#454545] rounded-lg text-[10px] text-[#cccccc] whitespace-nowrap
                      opacity-0 pointer-events-none z-50 shadow-xl transition-opacity
                      ${s.id === 'low' ? 'group-hover:opacity-100' : ''}
                      ${s.id === 'medium' ? 'group-hover:opacity-100' : ''}
                      ${s.id === 'high' ? 'group-hover:opacity-100' : ''}`}
                    style={{ display: 'none' }}
                  >
                    {s.tooltip[lang]}
                  </div>
                ))}
              </div>
              {/* 统一的 tooltip 区域 */}
              <div className="h-8 mt-2 text-[10px] text-white/50 leading-relaxed">
                {strengths.find(s => s.id === strength)?.tooltip[lang]}
              </div>
            </div>

            {/* 修图建议 */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                {lang === 'zh' ? '修图建议（可选）' : 'Suggestions (Optional)'}
              </div>
              <textarea
                value={suggestion}
                onChange={e => setSuggestion(e.target.value)}
                placeholder={lang === 'zh' ? '例如：让画面更温暖、增加对比度...' : 'e.g., Make it warmer, add contrast...'}
                className="w-full h-20 bg-[#141414] border border-white/10 rounded-xl p-3 text-xs text-white/90 placeholder:text-white/20 resize-none focus:outline-none focus:border-[#8B5CF6]/50"
              />
            </div>
          </div>

          {/* Generate Button - Fixed at bottom */}
          <div className="p-6 border-t border-white/5 bg-[#0a0a0a] shrink-0">
            <button
              onClick={handleGenerate}
              disabled={!sourceImage?.url}
              className={`w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all
                ${sourceImage?.url
                  ? 'bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-white hover:opacity-90 shadow-lg shadow-purple-900/20'
                  : 'bg-[#1a1a1a] text-white/30 cursor-not-allowed'}`}
            >
              <><Wand2 size={16} /> {lang === 'zh' ? '开始修图' : 'Start Retouch'} <span className="opacity-50 text-[10px] ml-1">(-1)</span></>
            </button>
          </div>
        </div>

        {/* Right Panel - Result */}
        <div className="flex-1 bg-[#050505] p-6 flex flex-col">
          <div className="flex-1 rounded-2xl bg-[#0a0a0a] border border-white/5 relative overflow-hidden flex items-center justify-center group">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

            {/* 显示当前选中任务的进度（如果正在进行中）*/}
            {activeTask && (activeTask.status === 'pending' || activeTask.status === 'running') && (
              <div className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center pointer-events-none">
                <Loader2 size={48} className="text-[#8B5CF6] animate-spin mb-4" />
                <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden mb-4">
                  <div className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] transition-all duration-300" style={{ width: `${activeTask.progress || 0}%` }}></div>
                </div>
                <div className="text-[#8B5CF6] font-mono text-2xl">{Math.round(activeTask.progress || 0)}%</div>
                <div className="text-white/40 text-xs mt-2">{lang === 'zh' ? '正在智能修图...' : 'AI Retouching...'}</div>
              </div>
            )}

            {/* 显示失败状态 */}
            {activeTask && activeTask.status === 'error' && (
              <div className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center pointer-events-none">
                <AlertCircle size={48} className="text-red-500 mb-4" />
                <div className="text-red-400 text-sm">{activeTask.error || (lang === 'zh' ? '处理失败' : 'Processing failed')}</div>
              </div>
            )}

            <div className="relative w-full h-full p-8 flex items-center justify-center">
              {activeTask?.status === 'done' && activeTask?.image ? (
                <img src={toSecureUrl(activeTask.image)} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt="Result" />
              ) : !activeTask || activeTask.status === 'pending' || activeTask.status === 'running' ? (
                <div className="text-center opacity-20 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl border border-dashed border-white/30 flex items-center justify-center">
                    <Wand2 size={32} />
                  </div>
                  <p className="text-sm font-medium">{lang === 'zh' ? '智能修图就绪' : 'AI Retouch Ready'}</p>
                </div>
              ) : (
                <div className="text-center opacity-20 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl border border-dashed border-white/30 flex items-center justify-center">
                    <Wand2 size={32} />
                  </div>
                  <p className="text-sm font-medium">{lang === 'zh' ? '智能修图就绪' : 'AI Retouch Ready'}</p>
                </div>
              )}
            </div>

            {/* 底部操作栏 - 与商品摄影一致的样式 */}
            {currentImage && (
              <div className="absolute bottom-8 flex items-center gap-3 p-2 rounded-full bg-[#1e1e1e]/80 border border-white/10 shadow-2xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                <ActionBtn icon={<Download size={18} />} onClick={handleDownload} tooltip={t.actions.download} />
                <ActionBtn icon={<Maximize2 size={18} />} onClick={() => setShowFullscreen(true)} tooltip={t.actions.fullscreen} />
                <div className="w-[1px] h-4 bg-white/10"></div>
                <ActionBtn icon={<Copy size={18} />} onClick={handleCopy} tooltip={t.actions.copy} />
              </div>
            )}
          </div>
        </div>

        {/* 全屏查看器 */}
        <FullscreenViewer isOpen={showFullscreen} image={currentImage} onClose={() => setShowFullscreen(false)} />

        {/* Right History Panel */}
        <div className="hidden lg:flex w-[200px] bg-[#0a0a0a] border-l border-white/5 flex-col">
          <div className="p-4 border-b border-white/5">
            <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
              <History size={14} /> {t.gallery.title}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => { setActiveHistoryId(item.id); if (item.status === 'done') setResult(item.image); }}
                className={`aspect-square rounded-lg overflow-hidden border cursor-pointer relative group bg-[#111] transition-all hover:shadow-lg
                  ${activeHistoryId === item.id ? 'border-[#8B5CF6] ring-1 ring-[#8B5CF6]/50' : 'border-white/5 hover:border-[#8B5CF6]/50'}
                  ${item.status === 'error' ? 'border-red-500/50' : ''}`}
              >
                {item.image && <img src={toSecureUrl(item.image)} className={`w-full h-full object-cover transition-opacity ${item.status === 'done' ? 'opacity-80 group-hover:opacity-100' : 'opacity-40'}`} alt="thumb" />}

                {/* 进行中任务的覆盖层 */}
                {(item.status === 'pending' || item.status === 'running') && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                    <Loader2 size={24} className="text-[#8B5CF6] animate-spin mb-2" />
                    <p className="text-[10px] text-white/80">{Math.round(item.progress || 0)}%</p>
                    {/* 进度条 */}
                    <div className="w-3/4 h-1 bg-white/20 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] transition-all duration-300"
                        style={{ width: `${item.progress || 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 失败任务的覆盖层 */}
                {item.status === 'error' && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                    <AlertCircle size={24} className="text-red-500 mb-2" />
                    <p className="text-[9px] text-red-400 text-center px-2">{item.error || '失败'}</p>
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/90 to-transparent">
                  <p className="text-[8px] text-white/80 line-clamp-1">{item.prompt}</p>
                </div>
              </div>
            ))}
            {history.length === 0 && <div className="text-center text-[10px] text-white/20 mt-6">{t.gallery.empty}</div>}
          </div>
        </div>
      </main >
    </div >
  );
};

const LoginModal = ({ isOpen, onClose, onLogin, t }) => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');

  // 倒计时效果
  React.useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 关闭时清空表单
  React.useEffect(() => {
    if (!isOpen) {
      setPhone('');
      setCode('');
      setError('');
      setCountdown(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 发送验证码
  const handleSendCode = async () => {
    if (!phone || phone.length !== 11) {
      setError('请输入正确的11位手机号');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '发送失败');
      setCountdown(60);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  // 验证码登录
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone || !code) {
      setError('请输入手机号和验证码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '验证失败');
      onLogin(data.access_token, data.username, data.quota);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-[380px] bg-[#141414] border border-white/10 rounded-2xl shadow-2xl p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white"><X size={18} /></button>
        <div className="flex flex-col items-center gap-4 mb-8"><OGLogo /><div className="text-center"><h2 className="text-xl font-bold text-white tracking-tight">{t.auth.productName}</h2><p className="text-xs text-white/40 mt-1">{t.auth.subtitle}</p></div></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* 手机号输入 */}
          <div>
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">{t.auth.phone}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              className="w-full h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none transition-all placeholder:text-white/20"
              placeholder={t.auth.placeholderPhone}
            />
          </div>
          {/* 验证码输入 + 发送按钮 */}
          <div>
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">{t.auth.code}</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="flex-1 h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none transition-all placeholder:text-white/20"
                placeholder={t.auth.placeholderCode}
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sending || countdown > 0}
                className={`w-28 h-11 rounded-lg text-xs font-bold transition-all ${countdown > 0 ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-[#FF8A3D]/20 text-[#FF8A3D] hover:bg-[#FF8A3D]/30'}`}
              >
                {sending ? t.auth.sending : countdown > 0 ? `${countdown}s` : t.auth.sendCode}
              </button>
            </div>
          </div>
          {error && <div className="text-red-400 text-xs flex items-center gap-1 bg-red-500/10 p-2 rounded"><AlertCircle size={12} />{error}</div>}
          <button type="submit" disabled={loading} className="w-full h-11 mt-2 bg-gradient-to-r from-[#FF8A3D] to-[#E65100] hover:opacity-90 text-white font-bold rounded-lg text-sm transition-all shadow-lg flex items-center justify-center gap-2">{loading ? <Loader2 size={18} className="animate-spin" /> : t.auth.submit}</button>
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

const AIPhotoStudio = ({ onBack, lang, setLang }) => {
  const t = TRANSLATIONS[lang];
  const taskManager = useTaskManager();
  const taskManagerRef = useRef(taskManager);
  taskManagerRef.current = taskManager; // 保持最新引用

  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'Guest');
  const [quota, setQuota] = useState(() => {
    const saved = localStorage.getItem('quota');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [showLogin, setShowLogin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  const [activeTab, setActiveTab] = useState('product');
  // const [isGenerating, setIsGenerating] = useState(false); // Removed
  const [isImproving, setIsImproving] = useState(false);

  const [sourceImages, setSourceImages] = useState([]);
  const fileInputRef = useRef(null); // 修复 fileInputRef

  const [prompt, setPrompt] = useState("");
  const [activeHistoryId, setActiveHistoryId] = useState(null);

  const [config, setConfig] = useState({ style: 'Luxurious' });
  // 初始化时立即从 TaskManager 读取运行中的任务，避免页面切换时数据消失
  const [history, setHistory] = useState(() => {
    const runningTasks = taskManager.getTasksByType('product')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      .map(t => ({
        id: t.id,
        image: t.metadata?.sourceImages?.[0] || '',
        prompt: t.prompt,
        timestamp: t.startTime / 1000,
        type: 'product',
        status: t.status === TASK_STATUS.PENDING ? 'pending' : 'running',
        progress: t.progress || 0
      }));
    return runningTasks;
  });
  const activeHistoryIdRef = useRef(activeHistoryId);
  activeHistoryIdRef.current = activeHistoryId; // 保持最新值，避免闭包问题

  // Toast 通知状态
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const isLoggedIn = !!token;
  const isValid = sourceImages.length > 0 && sourceImages.some(img => !img.uploading) && prompt.trim().length > 0;

  // 返回时检测任务状态
  // 返回时检测任务状态
  const handleBack = () => {
    if (isImproving) {
      if (confirm(lang === 'zh' ? '正在生成中，确定要退出吗？当前任务将被取消。' : 'Generation in progress. Are you sure you want to exit? Current task will be cancelled.')) {
        onBack?.();
      }
    } else {
      onBack?.();
    }
  };

  const activeTask = history.find(item => item.id === activeHistoryId);

  const ratioOptions = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

  // 模版状态
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [hoverTemplate, setHoverTemplate] = useState(null);

  // 选择模版时填充prompt
  const handleSelectTemplate = (templateId) => {
    if (selectedTemplate === templateId) {
      // 取消选择
      setSelectedTemplate(null);
      return;
    }
    const template = TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setPrompt(template.prompt);
      setHoverTemplate(null); // 选中后取消hover预览
    }
  };

  useEffect(() => {
    if (token) { fetchHistory(); fetchUserInfo(); }
    else { setHistory([]); setQuota(0); }
  }, [token]);

  const fetchHistory = async () => {
    if (!token) return;
    const productHistory = [];
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const serverHistory = data.filter(item => !item.type || item.type === 'product').map(item => ({ ...item, status: 'done', progress: 100 }));
        productHistory.push(...serverHistory);
      }
    } catch (err) { console.error('Fetch history failed:', err); }

    // 智能对账 (Smart Reconciliation)
    const runningTasks = taskManagerRef.current.getTasksByType('product')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING);

    runningTasks.forEach(localTask => {
      const match = productHistory.find(serverItem => {
        const timeMatch = serverItem.timestamp >= (localTask.startTime / 1000) - 600;
        return serverItem.prompt === localTask.prompt && timeMatch;
      });

      if (match) {
        taskManagerRef.current.completeTask(localTask.id, match.image);
      } else if (Date.now() - localTask.startTime > 30 * 60 * 1000) {
        taskManagerRef.current.failTask(localTask.id, 'Timeout: Task not found on server');
      }
    });

    // 合并正在进行中的任务 (使用 ref 获取最新状态)
    const activeRunningTasks = taskManagerRef.current.getTasksByType('product')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      .map(t => ({
        id: t.id,
        image: t.metadata?.sourceImages?.[0] || '', // 显示第一张原图作为预览
        prompt: t.prompt,
        timestamp: t.startTime / 1000,
        type: 'product',
        status: 'generating', // 保持组件内部使用 'generating' 状态
        progress: t.progress || 0
      }));

    const finalHistory = [...activeRunningTasks, ...productHistory];
    setHistory(finalHistory);
    if ((activeRunningTasks.length > 0 || finalHistory.length > 0) && !activeHistoryIdRef.current) {
      setActiveHistoryId(finalHistory[0]?.id);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const fetchUserInfo = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/user/me`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setQuota(data.quota);
        localStorage.setItem('quota', data.quota.toString());
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (err) { console.error(err); }
  };

  const handleLogin = (newToken, newUser, newQuota) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUser);
    localStorage.setItem('quota', newQuota.toString());
    setToken(newToken); setUsername(newUser); setQuota(newQuota);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('quota');
    setToken(null); setUsername('Guest'); setQuota(0);
    setSourceImages([]); setPrompt(""); setActiveHistoryId(null); setShowUserMenu(false);
  };

  // 同步任务进度
  useEffect(() => {
    const syncTaskProgress = () => {
      const runningTasks = taskManager.getTasksByType('product');
      if (runningTasks.length === 0) return;

      setHistory(prev => prev.map(h => {
        const task = runningTasks.find(t => t.id === h.id);
        if (task) {
          let newStatus = h.status;
          if (task.status === TASK_STATUS.SUCCESS) newStatus = 'done';
          else if (task.status === TASK_STATUS.ERROR) newStatus = 'failed';
          else newStatus = 'generating'; // pending or running

          return {
            ...h,
            progress: task.progress || h.progress,
            status: newStatus,
            image: task.result || h.image,
            // error: task.error
          };
        }
        return h;
      }));
    };
    const interval = setInterval(syncTaskProgress, 500);
    return () => clearInterval(interval);
  }, [taskManager]);

  const handleGenerate = async () => {
    if (!checkAuth(() => { })) return;
    if (quota <= 0) { showToast(t.generate.quotaEmpty, 'error'); return; }
    if (!isValid) return;

    const validUrls = sourceImages.filter(img => !img.uploading && img.url).map(img => img.url);
    const taskId = taskManager.createTask('product', prompt, {
      sourceImages: validUrls,
      style: config.style
    });

    const newTask = {
      id: taskId,
      status: 'generating',
      progress: 0,
      image: validUrls[0] || null, // 预览图
      prompt: prompt,
      timestamp: Date.now() / 1000
    };

    setHistory(prev => [newTask, ...prev]);
    setActiveHistoryId(taskId);

    executeProductTask(taskId, prompt, validUrls, config);
  };

  const executeProductTask = async (taskId, p, urls, cfg) => {
    taskManager.updateTask(taskId, { status: TASK_STATUS.RUNNING });

    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 1 + Math.random() * 2, 95);
      setHistory(prev => prev.map(h => h.id === taskId ? { ...h, progress: currentProgress } : h));
      taskManager.updateProgress(taskId, currentProgress);
    }, 500);

    try {
      const formData = new FormData();
      formData.append('prompt', p);
      formData.append('style', cfg.style);
      formData.append('image_urls_json', JSON.stringify(urls));

      const res = await fetch(`${API_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed');
      }

      const data = await res.json();

      if (data.status === 'SUCCESS') {
        taskManager.completeTask(taskId, data.data.image_url);
        // 更新历史
        setHistory(prev => prev.map(item =>
          item.id === taskId
            ? { ...item, image: data.data.image_url, ...data.data.history_item, status: 'done', progress: 100 }
            : item
        ));
        setQuota(data.data.remaining_quota);
        localStorage.setItem('quota', data.data.remaining_quota.toString());
      } else {
        throw new Error('API Error');
      }

    } catch (err) {
      clearInterval(progressInterval);
      taskManager.failTask(taskId, err.message);
      setHistory(prev => prev.map(item =>
        item.id === taskId ? { ...item, status: 'failed', progress: 0 } : item
      ));
      showToast(`生成失败: ${err.message}`, 'error');
    }
  };

  // --- 下载/复制 ---
  const handleDownload = async () => {
    if (!activeTask?.image) return;
    const secureUrl = toSecureUrl(activeTask.image);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `OG_AI_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast(t.toast.downloadSuccess, 'success');
    } catch (error) {
      // CORS 失败时，直接在新标签页打开让用户右键保存
      window.open(secureUrl, '_blank');
      showToast(lang === 'zh' ? '已在新标签页打开，请右键保存图片' : 'Opened in new tab, right-click to save', 'info');
    }
  };

  const handleCopy = async () => {
    if (!activeTask?.image) return;
    const secureUrl = toSecureUrl(activeTask.image);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showToast(t.toast.copySuccess, 'success');
    } catch (err) {
      // 降级方案：复制图片URL到剪贴板
      try {
        await navigator.clipboard.writeText(secureUrl);
        showToast(lang === 'zh' ? '已复制图片链接' : 'Image URL copied', 'success');
      } catch {
        showToast(t.toast.copyFail, 'error');
      }
    }
  };

  const checkAuth = (action) => { if (!isLoggedIn) { setShowLogin(true); return false; } action(); return true; };

  const handleFileChange = async (e) => {
    if (!checkAuth(() => { })) return;
    const file = e.target.files[0]; if (!file) return;
    const tempId = Date.now();
    setSourceImages(prev => [...prev, { id: tempId, preview: URL.createObjectURL(file), url: null, uploading: true }]);
    try {
      const formData = new FormData(); formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
      if (!res.ok) throw new Error('Upload Failed');
      const data = await res.json();
      setSourceImages(prev => prev.map(img => img.id === tempId ? { ...img, url: data.url, uploading: false } : img));
    } catch (err) { showToast("上传失败", 'error'); setSourceImages(prev => prev.filter(img => img.id !== tempId)); }
    e.target.value = '';
  };

  const handleRemoveImage = (id) => { setSourceImages(prev => prev.filter(img => img.id !== id)); };

  const handleImprovePrompt = () => {
    if (!prompt.trim()) return; setIsImproving(true);
    setTimeout(() => { setIsImproving(false); setPrompt(prompt + " (Professional Studio Lighting, 8k Resolution)"); }, 1200);
  };

  return (
    <div className="w-full h-full bg-[#050505] text-white font-sans flex flex-col overflow-hidden selection:bg-[#FF8A3D] selection:text-white">
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onLogin={handleLogin} t={t} />
      <FullscreenViewer isOpen={showFullscreen} image={activeTask?.image} onClose={() => setShowFullscreen(false)} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <main className="flex-1 flex flex-col md:flex-row gap-0 min-h-0 relative overflow-auto md:overflow-hidden">
        <div className="w-full md:w-[380px] bg-[#0a0a0a] border-b md:border-b-0 md:border-r border-white/5 flex flex-col z-20 shadow-[0_4px_24px_rgba(0,0,0,0.4)] md:shadow-[4px_0_24px_rgba(0,0,0,0.4)]">
          <div className="flex-1 overflow-visible md:overflow-y-auto p-4 md:p-6 custom-scrollbar space-y-6 md:space-y-8">
            <div className="space-y-3">
              <SectionLabel icon={<UploadCloud size={14} />}>{t.upload.title}</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {sourceImages.map((img, index) => (
                  <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden group border border-white/10 bg-[#141414]">
                    <img src={img.preview} className="w-full h-full object-cover" alt={`upload-${index}`} />
                    <div className="absolute top-1 left-1 w-5 h-5 bg-black/60 backdrop-blur text-white text-[10px] flex items-center justify-center rounded-md font-bold border border-white/10">{index + 1}</div>
                    {img.uploading ? <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-4 h-4 text-[#FF8A3D] animate-spin" /></div> : <button onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id); }} className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>}
                  </div>
                ))}
                <div onClick={() => fileInputRef.current.click()} className="aspect-square rounded-lg border border-dashed border-white/10 hover:border-[#FF8A3D]/50 hover:bg-white/[0.02] flex flex-col items-center justify-center cursor-pointer transition-all group"><Plus className="text-white/30 group-hover:text-[#FF8A3D] transition-colors" size={24} /><span className="text-[10px] text-white/30 mt-1">{t.upload.desc}</span></div>
              </div>
              <input id="file-upload" ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center"><SectionLabel icon={<Edit3 size={14} />}>{t.prompt.label}</SectionLabel><button onClick={handleImprovePrompt} disabled={isImproving || !prompt} className="text-[10px] text-[#FF8A3D] hover:text-[#ff9752] flex items-center gap-1 bg-[#FF8A3D]/10 px-2 py-1 rounded transition-colors disabled:opacity-50"><Sparkles size={10} /> {isImproving ? t.prompt.enhancing : t.prompt.enhance}</button></div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={t.prompt.placeholder} className="w-full h-28 min-h-[70px] max-h-[300px] bg-[#141414] border border-white/10 rounded-xl p-3 text-xs text-white/90 placeholder:text-white/20 resize-y focus:outline-none focus:border-[#FF8A3D]/50 transition-colors custom-scrollbar" style={{ resize: 'vertical' }} />
              </div>
              <div className="space-y-5">
                <TemplateSection
                  label={t.template}
                  templates={TEMPLATES}
                  activeId={selectedTemplate}
                  hoverId={hoverTemplate}
                  lang={lang}
                  onSelect={handleSelectTemplate}
                  onHover={setHoverTemplate}
                />
              </div>
            </div>
          </div>

          <div className="p-4 md:p-6 border-t border-white/5 bg-[#0a0a0a]">
            <button onClick={handleGenerate} disabled={isLoggedIn && !isValid} className={`w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${isLoggedIn && !isValid ? 'bg-[#1a1a1a] text-white/30 cursor-not-allowed border border-white/5' : 'bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white hover:opacity-90 shadow-orange-900/20'}`}>
              {!isLoggedIn ? <><Lock size={14} /> {t.generate.loginRequired}</> : quota <= 0 ? t.generate.quotaEmpty : !isValid ? t.generate.disabled : <><Sparkles size={16} /> {t.generate.idle} <span className="opacity-50 text-[10px] ml-1">(-1)</span></>}
            </button>
          </div>
        </div>

        {/* Middle Canvas */}
        <div className="flex-1 bg-[#050505] p-4 md:p-6 min-w-0 flex flex-col min-h-[300px] md:min-h-0">
          <div className="flex-1 rounded-2xl bg-[#0a0a0a] border border-white/5 relative overflow-hidden flex items-center justify-center group min-h-[250px]">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

            {activeTask?.status === 'generating' && (
              <div className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center pointer-events-none">
                <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-4"><div className="h-full bg-[#FF8A3D] transition-all duration-300" style={{ width: `${activeTask.progress}%` }}></div></div>
                <div className="text-[#FF8A3D] font-mono text-2xl animate-pulse">{Math.round(activeTask.progress)}%</div>
                <div className="text-white/40 text-xs mt-2 uppercase tracking-widest">{t.status.generating}</div>
              </div>
            )}

            <div className="relative w-full h-full p-8 flex items-center justify-center">
              {!activeTask?.image && activeTask?.status !== 'generating' ? (
                <div className="text-center opacity-20 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl border border-dashed border-white/30 flex items-center justify-center"><ImageIcon size={32} /></div>
                  <p className="text-sm font-medium tracking-wide">{t.status.ready}</p>
                </div>
              ) : (
                <div className={`relative w-full h-full flex items-center justify-center transition-all duration-500 ${activeTask?.status === 'generating' ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                  {activeTask?.image && <img src={toSecureUrl(activeTask.image)} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt="Result" />}
                  {activeTask?.status === 'failed' && <div className="text-red-500 flex flex-col items-center gap-2"><AlertCircle size={32} /><span>{t.status.failed}</span></div>}
                </div>
              )}
            </div>

            {activeTask?.status === 'done' && activeTask?.image && (
              <div className="absolute bottom-8 flex items-center gap-3 p-2 rounded-full bg-[#1e1e1e]/80 border border-white/10 shadow-2xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                <ActionBtn icon={<Download size={18} />} onClick={handleDownload} tooltip={t.actions.download} />
                <ActionBtn icon={<Maximize2 size={18} />} onClick={() => setShowFullscreen(true)} tooltip={t.actions.fullscreen} />
                <div className="w-[1px] h-4 bg-white/10"></div>
                <ActionBtn icon={<Copy size={18} />} onClick={handleCopy} tooltip={t.actions.copy} />
              </div>
            )}
          </div>
        </div>

        {/* Right History Panel - 移动端隐藏 */}
        <div className="hidden lg:flex w-[220px] bg-[#0a0a0a] border-l border-white/5 flex-col z-20">
          <div className="p-5 border-b border-white/5"><SectionLabel icon={<History size={14} />}>{t.gallery.title}</SectionLabel></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => setActiveHistoryId(item.id)}
                className={`aspect-square rounded-xl overflow-hidden border cursor-pointer relative group bg-[#111] transition-all hover:shadow-lg hover:shadow-orange-900/10
                  ${activeHistoryId === item.id ? 'border-[#FF8A3D] ring-1 ring-[#FF8A3D]/50' : 'border-white/5 hover:border-[#FF8A3D]/50'}
                `}
              >
                {item.status === 'generating' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[#1a1a1a]">
                    <Loader2 className="animate-spin text-[#FF8A3D] mb-2" size={20} />
                    <span className="text-[10px] text-white/50 font-mono">{Math.round(item.progress)}%</span>
                  </div>
                ) : item.status === 'failed' ? (
                  <div className="w-full h-full flex items-center justify-center bg-red-900/20 text-red-500"><AlertCircle size={20} /></div>
                ) : (
                  <img src={toSecureUrl(item.image)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="thumb" />
                )}
                {item.status === 'done' && <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent"><p className="text-[9px] text-white/80 line-clamp-1">{item.prompt}</p></div>}
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
        textarea {
          scrollbar-gutter: stable;
        }
        textarea::-webkit-resizer { 
          background-color: #141414;
          background-image: linear-gradient(135deg, transparent 50%, #444 50%, #444 55%, transparent 55%, transparent 60%, #444 60%, #444 65%, transparent 65%);
          background-size: 8px 8px;
          background-position: bottom right;
          background-repeat: no-repeat;
          border-radius: 0 0 10px 0;
          cursor: ns-resize;
        }
      `}</style>
    </div>
  );
};

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

// 参考模版选择组件
const TemplateSection = ({ label, templates, activeId, hoverId, lang, onSelect, onHover }) => {
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e, tplId) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // 计算位置，确保不超出屏幕左边（预览框宽度约200px）
    let xPos = rect.left + rect.width / 2;
    const previewWidth = 220; // 预览框大致宽度
    if (xPos < previewWidth / 2 + 10) {
      xPos = previewWidth / 2 + 10;
    }
    setHoverPos({
      x: xPos,
      y: rect.top - 10
    });
    onHover(tplId);
  };

  const hoverTemplate = templates.find(t => t.id === hoverId);

  return (
    <div className="relative">
      <div className="text-[10px] text-white/40 font-bold uppercase mb-2">{label}</div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {templates.map(tpl => (
          <div
            key={tpl.id}
            className="relative flex-shrink-0"
            onMouseEnter={(e) => handleMouseEnter(e, tpl.id)}
            onMouseLeave={() => onHover(null)}
          >
            <button
              onClick={() => onSelect(tpl.id)}
              className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all ${activeId === tpl.id ? 'bg-[#FF8A3D]/20 border-[#FF8A3D]' : 'bg-[#141414] border-transparent hover:border-white/20'}`}
            >
              <img
                src={tpl.image}
                alt={tpl.name[lang]}
                className="w-12 h-12 object-cover rounded"
              />
              <span className={`text-[9px] font-medium ${activeId === tpl.id ? 'text-[#FF8A3D]' : 'text-white/50'}`}>
                {tpl.name[lang]}
              </span>
            </button>
          </div>
        ))}
      </div>
      {/* Hover 放大预览 - 使用 fixed 定位 */}
      {hoverId && activeId !== hoverId && hoverTemplate && (
        <div
          className="fixed z-[100] pointer-events-none animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: hoverPos.x,
            top: hoverPos.y,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-3 shadow-2xl">
            <img
              src={hoverTemplate.image}
              alt={hoverTemplate.name[lang]}
              className="max-w-[200px] max-h-[280px] object-contain rounded-lg"
            />
            <p className="text-[10px] text-white/70 mt-2 text-center font-medium">{hoverTemplate.name[lang]}</p>
          </div>
        </div>
      )}
    </div>
  );
};

const ActionBtn = ({ icon, onClick, tooltip }) => (
  <button onClick={onClick} className="p-2.5 rounded-full hover:bg-white/10 text-white transition-colors relative group/btn">
    {icon}
    {/* 自定义 tooltip - 立即显示 */}
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#252526] text-[#cccccc] text-xs rounded shadow-md border border-[#454545]
      hidden group-hover/btn:block whitespace-nowrap z-[100]">
      {tooltip}
    </div>
  </button>
);

// ==========================================
// 🚀 主 App 组件 - 页面路由管理
// ==========================================
const App = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [lang, setLang] = useState('zh');
  const [showLoginModal, setShowLoginModal] = useState(false);

  // 全局用户状态
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'Guest');
  const [quota, setQuota] = useState(() => {
    const saved = localStorage.getItem('quota');
    return saved ? parseInt(saved, 10) : 0;
  });

  // 从后端实时获取配额
  useEffect(() => {
    if (!token) return;

    const fetchQuota = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/user/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.quota !== quota) {
            setQuota(data.quota);
            localStorage.setItem('quota', data.quota.toString());
          }
        }
      } catch (err) {
        console.error('获取配额失败:', err);
      }
    };

    // 立即获取一次
    fetchQuota();

    // 每 5 秒刷新一次
    const interval = setInterval(fetchQuota, 5000);

    return () => clearInterval(interval);
  }, [token]);

  // 动态更新浏览器标签标题
  useEffect(() => {
    document.title = lang === 'zh'
      ? 'OG AI - 你的专属AI设计师'
      : 'OG AI - Your personal AI designer';
  }, [lang]);

  const t = TRANSLATIONS[lang];

  const handleLogin = (newToken, newUser, newQuota) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUser);
    localStorage.setItem('quota', newQuota.toString());
    setToken(newToken);
    setUsername(newUser);
    setQuota(newQuota);
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('quota');
    setToken(null);
    setUsername('Guest');
    setQuota(0);
    setCurrentPage('home');
  };

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  // 渲染当前页面内容
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={handleNavigate} token={token} lang={lang} />;
      case 'gallery':
        return <GalleryPage token={token} lang={lang} onNavigate={handleNavigate} />;
      case 'retouch':
        return <AIRetouchStudioContent lang={lang} token={token} onNavigate={handleNavigate} />;
      case 'portrait':
        return <PortraitStudioContent lang={lang} token={token} onNavigate={handleNavigate} />;
      case 'video':
        return <VideoStudioContent lang={lang} token={token} onNavigate={handleNavigate} />;
      case 'create':
        return <BasicCreateStudioContent lang={lang} token={token} onNavigate={handleNavigate} />;
      case 'product':
      default:
        return <AIPhotoStudioContent lang={lang} token={token} onNavigate={handleNavigate} />;
    }
  };

  return (
    <>
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLogin}
        t={t}
      />
      <Layout
        currentPage={currentPage}
        onNavigate={handleNavigate}
        lang={lang}
        setLang={setLang}
        username={username}
        quota={quota}
        isLoggedIn={!!token}
        onLogin={() => setShowLoginModal(true)}
        onLogout={handleLogout}
      >
        {renderPage()}
      </Layout>
    </>
  );
};

// ==========================================
// 📂 图库页面组件（包装 GalleryModal 为全屏页面）
// ==========================================
const GalleryPage = ({ token, lang, onNavigate }) => {
  const [history, setHistory] = useState([]);
  const [filter, setFilter,] = useState('all');
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filterOptions = [
    { id: 'all', label: { zh: '全部', en: 'All' } },
    { id: 'product', label: { zh: '商品摄影', en: 'Product' } },
    { id: 'retouch', label: { zh: '智能修图', en: 'Retouch' } },
    { id: 'portrait', label: { zh: '人像写真', en: 'Portrait' } },
    { id: 'video', label: { zh: '视频生成', en: 'Video' } },
    { id: 'create', label: { zh: '基础创作', en: 'Create' } }
  ];

  const fetchAllHistory = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (itemId) => {
    if (!token || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/history/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setHistory(prev => prev.filter(item => item.id !== itemId));
        setDeleteConfirm(null);
        if (selectedImage?.id === itemId) setSelectedImage(null);
      }
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  useEffect(() => {
    if (token) fetchAllHistory();
  }, [token]);

  const filteredHistory = history.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'product') return !item.type || item.type === 'product';
    return item.type === filter;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 顶部筛选栏 */}
      <div className="flex items-center gap-2 p-3 md:p-4 border-b border-white/5 bg-[#0a0a0a]/50">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {filterOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                ${filter === opt.id ? 'bg-[#FF8A3D] text-white' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}
            >
              {opt.label[lang]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-white/30">{filteredHistory.length} {lang === 'zh' ? '张' : 'images'}</span>
      </div>

      {/* 图片内容区 */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-[#FF8A3D]" />
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/30">
            <FolderOpen size={48} className="mb-4" />
            <p>{lang === 'zh' ? '暂无图片' : 'No images'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
            {filteredHistory.map(item => (
              <div
                key={item.id}
                className="aspect-square rounded-xl overflow-hidden border border-white/10 cursor-pointer group relative bg-[#111] hover:border-[#FF8A3D]/50 transition-all"
              >
                <img
                  src={toSecureUrl(item.image)}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  alt=""
                  onClick={() => setSelectedImage(item)}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-red-600 text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={14} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent" onClick={() => setSelectedImage(item)}>
                  <p className="text-[10px] text-white/70 line-clamp-1">{item.prompt}</p>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full mt-1 inline-block
                    ${item.type === 'retouch' ? 'bg-purple-500/30 text-purple-300' :
                      item.type === 'portrait' ? 'bg-cyan-500/30 text-cyan-300' :
                        item.type === 'create' ? 'bg-green-500/30 text-green-300' :
                          'bg-orange-500/30 text-orange-300'}`}>
                    {item.type === 'retouch' ? (lang === 'zh' ? '修图' : 'Retouch') :
                      item.type === 'portrait' ? (lang === 'zh' ? '人像' : 'Portrait') :
                        item.type === 'create' ? (lang === 'zh' ? '创作' : 'Create') :
                          (lang === 'zh' ? '商品' : 'Product')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[1002] bg-black/80 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-4">{lang === 'zh' ? '确认删除' : 'Confirm Delete'}</h3>
            <p className="text-white/60 text-sm mb-8">{lang === 'zh' ? '确定要删除这张图片吗？此操作无法撤销。' : 'Are you sure you want to delete this image? This action cannot be undone.'}</p>
            <div className="flex gap-4">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={deleting} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {lang === 'zh' ? '删除' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 图片预览 - 从顶栏下方开始 */}
      {selectedImage && (
        <div className="fixed top-14 md:top-16 bottom-0 left-0 right-0 z-[50] bg-black/95 flex items-center justify-center p-4 md:p-8" onClick={() => setSelectedImage(null)}>
          {/* 关闭按钮 - 简洁风格 */}
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-white/80 hover:text-white transition-colors"
          >
            <X size={28} />
          </button>
          <img src={toSecureUrl(selectedImage.image)} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} alt="" />
        </div>
      )}
    </div>
  );
};

// ==========================================
// 🔄 各工作区的内容组件包装器（临时，后续可拆分）
// ==========================================
const AIPhotoStudioContent = ({ lang, token, onNavigate }) => (
  <AIPhotoStudio onBack={() => onNavigate('home')} lang={lang} setLang={() => { }} />
);

const AIRetouchStudioContent = ({ lang, token, onNavigate }) => (
  <AIRetouchStudio onBack={() => onNavigate('home')} lang={lang} setLang={() => { }} />
);

const PortraitStudioContent = ({ lang, token, onNavigate }) => (
  <PortraitStudio onBack={() => onNavigate('home')} lang={lang} setLang={() => { }} />
);

const VideoStudio = ({ onBack, lang, setLang }) => {
  const t = TRANSLATIONS[lang];
  const taskManager = useTaskManager();
  const taskManagerRef = useRef(taskManager);
  taskManagerRef.current = taskManager; // 保持最新引用

  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'Guest');
  const [quota, setQuota] = useState(() => {
    const saved = localStorage.getItem('quota');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [showLogin, setShowLogin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });

  // 核心状态
  const [prompt, setPrompt] = useState('');
  const [referImages, setReferImages] = useState([]); // 多参考图
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  // 初始化时立即从 TaskManager 读取运行中的任务，避免页面切换时数据消失
  const [history, setHistory] = useState(() => {
    const runningTasks = taskManager.getTasksByType('video')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      .map(t => ({
        id: t.id,
        image: t.metadata?.referImages?.[0] || '',
        prompt: t.prompt,
        timestamp: t.startTime / 1000,
        type: 'video',
        status: t.status === TASK_STATUS.PENDING ? 'pending' : 'running',
        progress: t.progress || 0
      }));
    return runningTasks;
  });
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const activeHistoryIdRef = useRef(activeHistoryId);
  activeHistoryIdRef.current = activeHistoryId; // 保持最新值，避免闭包问题

  const isLoggedIn = !!token;
  const isValid = prompt.trim().length > 0;

  const handleBack = () => {
    onBack?.();
  };

  const handleLogin = (newToken, newUser, newQuota) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUser);
    localStorage.setItem('quota', newQuota.toString());
    setToken(newToken); setUsername(newUser); setQuota(newQuota);
    setShowLogin(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('quota');
    setToken(null); setUsername('Guest'); setQuota(0);
    setHistory([]); setActiveHistoryId(null);
  };

  // 加载历史记录
  const fetchHistory = async () => {
    if (!token) return;
    const createHistory = [];
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const serverHistory = data.filter(item => item.type === 'video').map(item => {
          let st = 'running';
          let prog = 50;
          if (item.status === 'SUCCESS') { st = 'done'; prog = 100; }
          else if (item.status === 'FAILED') { st = 'error'; }
          else if (item.status === 'ON_QUEUE') { st = 'pending'; prog = 10; }
          return { ...item, status: st, progress: prog };
        });
        createHistory.push(...serverHistory);
      }
    } catch (err) { console.error('Fetch history failed:', err); }

    // 智能对账：清理僵尸任务 (Smart Reconciliation)
    const runningTasks = taskManagerRef.current.getTasksByType('video')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING);

    runningTasks.forEach(localTask => {
      const match = createHistory.find(serverItem => {
        const timeMatch = serverItem.timestamp >= (localTask.startTime / 1000) - 600;
        return serverItem.prompt === localTask.prompt && timeMatch;
      });

      if (match) {
        if (match.status === 'done') {
          taskManagerRef.current.completeTask(localTask.id, match.image);
        } else if (match.status === 'error') {
          taskManagerRef.current.failTask(localTask.id, 'Server reported failure');
        }
      } else if (Date.now() - localTask.startTime > 30 * 60 * 1000) {
        taskManagerRef.current.failTask(localTask.id, 'Timeout: Task not found on server');
      }
    });

    const activeRunningTasks = taskManagerRef.current.getTasksByType('video')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      .map(t => ({
        id: t.id,
        image: t.metadata?.referImages?.[0] || '', // 如有参考图则显示第一张，否则可能为空
        prompt: t.prompt,
        timestamp: t.startTime / 1000,
        type: 'video',
        status: t.status === TASK_STATUS.PENDING ? 'pending' : 'running',
        progress: t.progress || 0
      }));

    // 过滤掉服务器历史中已经正在本地运行的任务，防止UI出现双份
    const filteredServerHistory = createHistory.filter(serverItem => {
      const isMatched = activeRunningTasks.some(localTask => {
        const timeMatch = serverItem.timestamp >= (localTask.timestamp) - 600;
        return serverItem.prompt === localTask.prompt && timeMatch;
      });
      return !isMatched;
    });

    const finalHistory = [...activeRunningTasks, ...filteredServerHistory];
    setHistory(finalHistory);
    if ((activeRunningTasks.length > 0 || finalHistory.length > 0) && !activeHistoryIdRef.current) {
      setActiveHistoryId(finalHistory[0]?.id);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000); // 加快刷新
    return () => clearInterval(interval);
  }, [token]);

  // 同步任务进度
  useEffect(() => {
    const syncTaskProgress = () => {
      const runningTasks = taskManager.getTasksByType('video');
      if (runningTasks.length === 0) return;

      setHistory(prev => prev.map(h => {
        const task = runningTasks.find(t => t.id === h.id);
        if (task) {
          let newStatus = h.status;
          if (task.status === TASK_STATUS.SUCCESS) newStatus = 'done';
          else if (task.status === TASK_STATUS.ERROR) newStatus = 'error';
          else if (task.status === TASK_STATUS.RUNNING) newStatus = 'running';
          else newStatus = 'pending';

          return {
            ...h,
            progress: task.progress || h.progress,
            status: newStatus,
            image: task.result || h.image,
            error: task.error || h.error
          };
        }
        return h;
      }));
    };
    const interval = setInterval(syncTaskProgress, 500);
    return () => clearInterval(interval);
  }, [taskManager]);

  // 上传图片
  const uploadImage = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return data.url;
  };

  const handleAddImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) { setShowLogin(true); return; }

    setIsUploadingImage(true);
    try {
      const url = await uploadImage(file);
      setReferImages(prev => [...prev, url]);
    } catch { showToast('上传失败', 'error'); }
    setIsUploadingImage(false);
    e.target.value = '';
  };

  const handleRemoveImage = (index) => {
    setReferImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!isValid || !token) return;
    if (quota <= 0) { showToast(t.toast.noQuota, 'error'); return; }

    const taskName = lang === 'zh' ? '视频生成' : 'Video Generation';
    const taskId = taskManager.createTask('video', prompt, {
      referImages
    });

    // 立即添加到历史
    const newItem = {
      id: taskId,
      image: referImages[0] || null, // 优先显示参考图作为占位
      prompt: prompt,
      timestamp: Date.now() / 1000,
      type: 'video',
      status: 'pending',
      progress: 0
    };
    setHistory(prev => [newItem, ...prev]);
    setActiveHistoryId(taskId);

    executeCreateTask(taskId, prompt, referImages);
  };

  // 异步执行创作任务
  const executeCreateTask = async (taskId, p, rImgs) => {
    taskManager.updateTask(taskId, { status: TASK_STATUS.RUNNING });
    // setIsGenerating(false); // Removed

    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 1 + Math.random() * 2, 95);
      setHistory(prev => prev.map(h => h.id === taskId ? { ...h, progress: currentProgress } : h));
      taskManager.updateProgress(taskId, currentProgress);
    }, 500);

    try {
      const formData = new FormData();
      formData.append('prompt', p);
      formData.append('image_urls_json', JSON.stringify(rImgs));

      const res = await fetch(`${API_BASE_URL}/api/video`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        let errMsg = 'Generation failed';
        try {
          const errData = await res.json();
          errMsg = errData.detail || errData.message || errMsg;
        } catch (e) {
          errMsg = `Server error: ${res.status}`;
        }
        throw new Error(errMsg);
      }

      // 视频是后台异步生成的，不需要在这里获取 image_url
      // 智能对账系统 (Smart Reconciliation) 会通过轮询 /api/history 自动发现并完成该任务
      showToast(lang === 'zh' ? '视频生成已在后台启动，这可能需要几分钟...' : 'Video generation started in background...', 'success');

    } catch (err) {
      clearInterval(progressInterval);
      taskManager.failTask(taskId, err.message);
      setHistory(prev => prev.map(h => h.id === taskId ? { ...h, status: 'error', error: err.message } : h));
      showToast(err.message, 'error');
    }
  };

  const currentImage = history.find(h => h.id === activeHistoryId)?.image || (activeHistoryId ? null : result);

  const handleDownload = async () => {
    if (!currentImage) return;
    const secureUrl = toSecureUrl(currentImage);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `create_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast(t.toast.downloadSuccess);
    } catch (error) {
      // 降级方案：在新标签页打开
      window.open(secureUrl, '_blank');
      showToast(lang === 'zh' ? '已在新标签页打开，请右键保存图片' : 'Opened in new tab, right-click to save', 'info');
    }
  };

  const handleCopy = async () => {
    if (!currentImage) return;
    const secureUrl = toSecureUrl(currentImage);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showToast(t.toast.copySuccess);
    } catch (err) {
      // 降级方案：复制图片URL到剪贴板
      try {
        await navigator.clipboard.writeText(secureUrl);
        showToast(lang === 'zh' ? '已复制图片链接' : 'Image URL copied', 'success');
      } catch {
        showToast(t.toast.copyFail, 'error');
      }
    }
  };

  return (
    <div className="w-full h-full bg-[#050505] text-white font-sans flex flex-col overflow-hidden">
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onLogin={handleLogin} t={t} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row gap-0 min-h-0 overflow-hidden">
        {/* Left Panel */}
        <div className="w-full md:w-[380px] bg-[#0a0a0a] border-r border-white/5 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Prompt 输入 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
                <Edit3 size={14} /> {lang === 'zh' ? '创意描述' : 'Prompt'} <span className="text-red-400">*</span>
              </div>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={lang === 'zh' ? '描述你想要生成的视频...' : 'Describe the video you want to create...'}
                className="w-full h-32 bg-[#111] border border-white/10 rounded-xl p-4 text-sm text-white placeholder:text-white/30 resize-none focus:border-[#10B981] focus:outline-none transition-colors"
              />
            </div>

            {/* 参考图片（选填） */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
                  <ImageIcon size={14} /> {lang === 'zh' ? '首尾帧图片（选填）' : 'Start & End Frames (Optional)'}
                </div>
                <span className="text-[10px] text-white/30">{referImages.length}/2</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {referImages.map((url, i) => (
                  <div key={i} className="aspect-square rounded-lg overflow-hidden relative group border border-white/10">
                    <img src={toSecureUrl(url)} className="w-full h-full object-cover" alt="" />
                    <button onClick={() => handleRemoveImage(i)} className="absolute top-1 right-1 p-1 bg-red-500/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {referImages.length < 2 && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-white/10 hover:border-[#10B981]/50 flex items-center justify-center cursor-pointer transition-colors relative">
                    {isUploadingImage ? (
                      <div className="flex flex-col items-center justify-center text-[#10B981]">
                        <Loader2 size={20} className="animate-spin mb-1" />
                        <span className="text-[10px] font-medium">{lang === 'zh' ? '上传中...' : 'Uploading'}</span>
                      </div>
                    ) : (
                      <>
                        <Plus size={20} className="text-white/30" />
                        <input type="file" accept="image/*" className="hidden" onChange={handleAddImage} disabled={isUploadingImage} />
                      </>
                    )}
                  </label>
                )}
              </div>
              <p className="text-[10px] text-white/30">{lang === 'zh' ? '无图=文生视频 | 1张图=首帧参考 | 2张图=首尾帧约束' : '0 images=Text2Video | 1 image=Start Frame | 2 images=Start&End'}</p>
            </div>
          </div>

          {/* 生成按钮 */}
          <div className="p-4 border-t border-white/5">
            <button
              onClick={handleGenerate}
              disabled={!isValid || !isLoggedIn}
              className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all
                ${isValid && isLoggedIn
                  ? 'bg-gradient-to-r from-[#10B981] to-[#059669] hover:opacity-90 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
            >
              <><Sparkles size={18} /> {lang === 'zh' ? '开始创作' : 'Create'}</>
            </button>
          </div>
        </div>

        {/* Center: Result */}
        <div className="flex-1 bg-[#050505] p-6 flex flex-col">
          <div className="flex-1 rounded-2xl bg-[#0a0a0a] border border-white/5 relative overflow-hidden flex items-center justify-center group">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

            {activeHistoryId && (() => {
              const activeTask = history.find(h => h.id === activeHistoryId);
              if (activeTask && (activeTask.status === 'pending' || activeTask.status === 'running')) {
                return (
                  <div className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center pointer-events-none">
                    <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-4">
                      <div className="h-full bg-[#10B981] transition-all duration-300" style={{ width: `${activeTask.progress}%` }}></div>
                    </div>
                    <div className="text-[#10B981] font-mono text-2xl animate-pulse">{Math.round(activeTask.progress)}%</div>
                    <div className="text-white/40 text-xs mt-2">{lang === 'zh' ? '正在创作中...' : 'Creating...'}</div>
                  </div>
                );
              }
              // 修复：如果任务失败，显示错误信息
              if (activeTask && activeTask.status === 'error') {
                return (
                  <div className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center pointer-events-none">
                    <AlertCircle size={48} className="text-red-500 mb-4" />
                    <div className="text-red-400 text-sm">{activeTask.error || 'Creation Failed'}</div>
                  </div>
                );
              }
              return null;
            })()}

            <div className="relative w-full h-full p-8 flex items-center justify-center">
              {currentImage ? (
                <img src={toSecureUrl(currentImage)} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt="Result" />
              ) : (
                <div className="text-center opacity-20 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl border border-dashed border-white/30 flex items-center justify-center">
                    <Edit3 size={32} />
                  </div>
                  <p className="text-sm font-medium">{lang === 'zh' ? '视频生成就绪' : 'Video Generation Ready'}</p>
                </div>
              )}
            </div>

            {currentImage && (
              <div className="absolute bottom-8 flex items-center gap-3 p-2 rounded-full bg-[#1e1e1e]/80 border border-white/10 shadow-2xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                <ActionBtn icon={<Download size={18} />} onClick={handleDownload} tooltip={t.actions.download} />
                <ActionBtn icon={<Maximize2 size={18} />} onClick={() => setShowFullscreen(true)} tooltip={t.actions.fullscreen} />
                <div className="w-[1px] h-4 bg-white/10"></div>
                <ActionBtn icon={<Copy size={18} />} onClick={handleCopy} tooltip={t.actions.copy} />
              </div>
            )}
          </div>
        </div>

        <FullscreenViewer isOpen={showFullscreen} image={currentImage} onClose={() => setShowFullscreen(false)} />

        {/* Right History Panel */}
        <div className="hidden lg:flex w-[200px] bg-[#0a0a0a] border-l border-white/5 flex-col">
          <div className="p-4 border-b border-white/5">
            <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
              <History size={14} /> {t.gallery.title}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => setActiveHistoryId(item.id)}
                className={`aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all relative
                  ${activeHistoryId === item.id ? 'border-[#10B981] ring-2 ring-[#10B981]/30' : 'border-white/5 hover:border-white/20'}`}
              >
                {item.image && <img src={toSecureUrl(item.image)} className={`w-full h-full object-cover transition-opacity ${item.status === 'done' ? 'opacity-100' : 'opacity-40'}`} alt="" />}

                {/* 进度覆盖层 */}
                {(item.status === 'pending' || item.status === 'running') && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                    <Loader2 size={16} className="text-[#10B981] animate-spin mb-1" />
                    <span className="text-[10px] text-[#10B981] font-mono">{Math.round(item.progress || 0)}%</span>
                  </div>
                )}

                {/* 失败覆盖层 */}
                {item.status === 'error' && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <AlertCircle size={16} className="text-red-500" />
                  </div>
                )}
              </div>
            ))}
            {history.length === 0 && (
              <div className="text-center text-white/20 text-xs py-8">{t.gallery.empty}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};


const VideoStudioContent = ({ lang, token, onNavigate }) => (
  <VideoStudio onBack={() => onNavigate('home')} lang={lang} setLang={() => { }} />
);

const BasicCreateStudioContent = ({ lang, token, onNavigate }) => (
  <BasicCreateStudio onBack={() => onNavigate('home')} lang={lang} setLang={() => { }} />
);

// 用 TaskProvider 包裹整个应用
const AppWithProviders = () => (
  <TaskProvider>
    <App />
  </TaskProvider>
);

export default AppWithProviders;
