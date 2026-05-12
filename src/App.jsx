import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Image as ImageIcon, Settings, Sparkles, UploadCloud,
  History, Download, Maximize2, Palette,
  Monitor, BoxSelect, Copy, Camera, User, Edit3, Globe,
  LogOut, X, Loader2, Check, Lock, AlertCircle, RefreshCw, Zap, Plus, Minus, Trash2, CheckCircle,
  Home, ArrowRight, Wand2, ArrowLeft, FolderOpen, Filter,
  Video, PlayCircle, Film, ChevronDown, ArrowUp, Cpu, Square, Link, Layout as LayoutIcon,
  Hash
} from 'lucide-react';
import { Layout } from './components/layout/Layout';
import { TaskProvider, useTaskManager, TASK_STATUS } from './context/TaskContext';
import AdminPanel from './pages/AdminPanel';
import GalleryPage from './pages/GalleryPage';
import HomePage from './pages/HomePage';
import ApiKeysPage from './pages/ApiKeysPage';
import AdminModelsPage from './pages/AdminModelsPage';
import ModelsPlazaPage from './pages/ModelsPlazaPage';
import InfiniteCanvas, { getNewNodePositions, NODE_DEFAULT_W, NODE_DEFAULT_H } from './components/InfiniteCanvas';
import ChatGptIcon from './assets/ChatGPT.svg';
import MidjourneyIcon from './assets/midjourney.svg';
import { API_BASE_URL, LOGO_URL } from './config/app';
import { PORTRAIT_TEMPLATES, TEMPLATES, TRANSLATIONS } from './config/studioData';
import { getCurrentPageFromLocation, navigateToPage } from './router/routes';
import { isCompletedHistoryItem, toSecureUrl } from './utils/media';
import { storage } from './utils/storage';

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


const FullscreenViewer = ({ isOpen, image, onClose }) => {
  if (!isOpen || !image) return null;
  const secureImage = toSecureUrl(image);
  return (
    <div className="fixed top-0 bottom-0 left-0 right-0 z-[50] bg-black/95 flex items-center justify-center p-4 md:p-8" onClick={onClose}>
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

    // 乐观扣分：立即显示积分减少
    const optimisticQuota = Math.max(0, quota - 1);
    setQuota(optimisticQuota);
    localStorage.setItem('quota', optimisticQuota.toString());
    window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: optimisticQuota } }));

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
      // 通知顶层 App 立即刷新 Header 积分显示
      window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: data.data.remaining_quota } }));

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
// 🎨 自定义交互组件
// ==========================================
const CustomSelect = ({ value, onChange, options, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find(o => o.value === value) || options[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-xs text-white/40 mb-1.5 block">{label}</label>
      <div 
        className={`w-full bg-[#111] border ${isOpen ? 'border-[#10B981]' : 'border-white/10 hover:border-white/20'} rounded-xl p-3 text-sm text-white cursor-pointer flex items-center justify-between transition-all`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center gap-2">
          {selected.icon && <span className="text-white/40">{selected.icon}</span>}
          {selected.label}
        </span>
        <ChevronDown size={14} className={`text-white/40 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#10B981]' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl shadow-black/80 py-1 max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`px-3 py-2.5 mx-1 my-0.5 rounded-lg text-sm cursor-pointer transition-colors flex items-center justify-between
                ${value === opt.value ? 'text-[#10B981] bg-[#10B981]/10 font-medium' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              <div className="flex items-center gap-2">
                {opt.icon && <span className={value === opt.value ? 'text-[#10B981]' : 'text-white/40'}>{opt.icon}</span>}
                {opt.label}
              </div>
              {value === opt.value && <Check size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SegmentedControl = ({ value, onChange, options, label }) => {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-white/40 block">{label}</label>
      <div className="flex bg-[#111] p-1 rounded-xl border border-white/10">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-2 text-sm rounded-lg transition-all duration-200 font-medium ${
              value === opt.value 
                ? 'bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20' 
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const calculateSize = (ratio, level) => {
  if (ratio === 'auto') return { w: 0, h: 0, str: 'auto' };
  const [wRatio, hRatio] = ratio.split(':').map(Number);
  
  let targetPixels;
  if (level === '1K') targetPixels = 1048576; // 1024 * 1024
  else if (level === '2K') targetPixels = 4194304; // 2048 * 2048
  else if (level === '4K') targetPixels = 8294400; // max allowed rule

  // 1. Initial guess based on exact target
  let idealH = Math.sqrt((targetPixels * hRatio) / wRatio);
  let idealW = idealH * (wRatio / hRatio);

  // Clamp ideal to max side 3840
  if (idealW > 3840) {
    idealW = 3840;
    idealH = idealW * (hRatio / wRatio);
  }
  if (idealH > 3840) {
    idealH = 3840;
    idealW = idealH * (wRatio / hRatio);
  }

  // 2. Start from Math.floor to multiples of 16
  let bestW = Math.floor(idealW / 16) * 16;
  let bestH = Math.floor(idealH / 16) * 16;
  let bestPixels = bestW * bestH;

  // 3. Simple local search to maximize pixels without exceeding 8294400 or max side 3840
  const candidates = [
    { w: bestW + 16, h: bestH },
    { w: bestW, h: bestH + 16 },
    { w: bestW + 16, h: bestH + 16 },
    { w: bestW, h: bestH }
  ];

  let maxAllowed = Math.min(targetPixels, 8294400); // 4K can reach max

  for (let c of candidates) {
    if (c.w <= 3840 && c.h <= 3840) {
      let pixels = c.w * c.h;
      if (pixels <= maxAllowed && pixels > bestPixels) {
        bestW = c.w;
        bestH = c.h;
        bestPixels = pixels;
      }
    }
  }

  // 4. Enforce global MIN limit
  if (bestPixels < 655360) {
    let scale = Math.sqrt(655360 / bestPixels);
    bestW = Math.ceil((bestW * scale) / 16) * 16;
    bestH = Math.ceil((bestH * scale) / 16) * 16;
    while (bestW * bestH < 655360) {
      bestW += 16;
      bestH += 16;
    }
  }

  // 5. Enforce aspect ratio <= 3:1 limit
  if (bestW / bestH > 3) {
    bestW = bestH * 3;
    bestW = Math.floor(bestW / 16) * 16;
  }
  if (bestH / bestW > 3) {
    bestH = bestW * 3;
    bestH = Math.floor(bestH / 16) * 16;
  }

  return { w: bestW, h: bestH, str: `${bestW}x${bestH}` };
};

const getRatioBox = (ratioStr, active) => {
  if (ratioStr === 'auto') return <Sparkles size={14} className={active ? "text-[#10B981]" : "text-white/40"} />;
  const [w, h] = ratioStr.split(':').map(Number);
  const max = Math.max(w, h);
  const rw = (w / max) * 14;
  const rh = (h / max) * 14;
  return (
    <div 
      className={`border-2 rounded-[3px] transition-colors ${active ? 'border-[#10B981]' : 'border-white/40'}`} 
      style={{ width: Math.max(6, rw), height: Math.max(6, rh) }} 
    />
  );
};

const RATIOS = ['auto', '21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16'];
const RES_LEVELS = [
  { id: '1K', label: { zh: '标清 1K', en: '1K SD' } },
  { id: '2K', label: { zh: '高清 2K', en: '2K HD' } },
  { id: '4K', label: { zh: '超清 4K', en: '4K UHD' }, premium: true }
];
const QUALITIES = [
  { id: 'auto', label: { zh: '自动', en: 'Auto' } },
  { id: 'low', label: { zh: '低', en: 'Low' } },
  { id: 'medium', label: { zh: '中', en: 'Med' } },
  { id: 'high', label: { zh: '高', en: 'High' } }
];

// ==========================================
// ✏️ 自由创作组件
// ==========================================
const BasicCreateStudio = ({ onBack, lang, setLang, isImmersive, onToggleImmersive }) => {
  const t = TRANSLATIONS[lang];
  const taskManager = useTaskManager();
  const taskManagerRef = useRef(taskManager);
  taskManagerRef.current = taskManager; // 保持最新引用
  const isSubmittingRef = useRef(false);

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
  const [model, setModel] = useState('gpt-image-2');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [resLevel, setResLevel] = useState('2K');
  const [quality, setQuality] = useState('auto');
  const [numImages, setNumImages] = useState(1);
  const [mjMode, setMjMode] = useState('fast');
  const [mjVersion, setMjVersion] = useState('v8.1');

  // gpt-image-2 仅支持 1K，切到该模型时强制回到 1K
  const lockedTo1K = model === 'gpt-image-2';
  useEffect(() => {
    if (lockedTo1K && resLevel !== '1K') setResLevel('1K');
  }, [lockedTo1K, resLevel]);

  // Nano Banana 2
  const isNanoBanana2 = model === 'nano-banana-2' || model === 'nano-banana-2-2k' || model === 'nano-banana-2-4k';
  const NANO_BANANA_2_COST_PER_IMAGE = 30;

  // Pro Model
  const PRO_COST_PER_IMAGE = 22;
  const isProModel = model === 'gpt-image-2-pro';

  // Midjourney
  const isMjModel = model === 'midjourney';
  const MJ_COST_BY_MODE = { relax: 22, fast: 42, turbo: 62 };
  const MJ_VERSIONS = [
    { id: 'v8.1', label: 'V8.1', sub: '最新' },
    { id: 'v7',   label: 'V7',   sub: '稳定' },
    { id: 'v6.1', label: 'V6.1', sub: '经典' },
    { id: 'v5.2', label: 'V5.2', sub: '写实' },
    { id: 'niji 6', label: 'Niji 6', sub: '动漫' },
  ];
  const mjCostPerTask = MJ_COST_BY_MODE[mjMode] || 42;

  // 单张积分价（和后端 pricing 保持一致）
  const costPerImage = (() => {
    if (isNanoBanana2) return NANO_BANANA_2_COST_PER_IMAGE;
    if (isProModel) return PRO_COST_PER_IMAGE;
    if (model === 'gpt-image-2-high') return 13;
    return 7; // gpt-image-2
  })();

  const currentDimensions = calculateSize(aspectRatio, resLevel);
  const pointsPerImage = isMjModel ? mjCostPerTask : costPerImage;
  const totalPoints = (numImages || 1) * pointsPerImage;

  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);

  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  // 画布节点状态
  const [canvasNodes, setCanvasNodes] = useState([]);

  // 从 IndexedDB 异步加载历史节点
  useEffect(() => {
    const loadSavedNodes = async () => {
      const savedNodes = await storage.loadNodes();
      if (savedNodes && savedNodes.length > 0) {
        setCanvasNodes(savedNodes);
      } else {
        // 如果数据库没东西，则从运行中的任务尝试恢复
        const runningTasks = taskManager.getTasksByType('create')
          .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
          .map((t, i) => ({
            id: t.id,
            x: 100 + (i % 3) * 380,
            y: 100 + Math.floor(i / 3) * 380,
            w: NODE_DEFAULT_W,
            h: NODE_DEFAULT_H,
            image: null,
            prompt: t.prompt,
            status: t.status === TASK_STATUS.PENDING ? 'pending' : 'running',
            progress: t.progress || 0,
            zIndex: 1,
          }));
        if (runningTasks.length > 0) setCanvasNodes(runningTasks);
      }
      setIsStorageLoaded(true);
    };
    loadSavedNodes();
  }, []);

  // 异步保存画布状态到 IndexedDB
  useEffect(() => {
    if (isStorageLoaded) {
      storage.saveNodes(canvasNodes);
    }
  }, [canvasNodes, isStorageLoaded]);

  // 为了兼容原有逻辑，history 作为 canvasNodes 的别名
  const history = canvasNodes;
  const setHistory = setCanvasNodes;

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

  // 加载历史记录（仅用于认领画布里已存在的本地任务产出；不再自动同步服务器历史到画布）
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

    // 智能对账：只认领画布中已存在的本地任务（不向画布添加新节点）
    const runningTasks = taskManagerRef.current.getTasksByType('create')
      .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING);

    runningTasks.forEach(localTask => {
      const matches = createHistory.filter(serverItem => {
        const timeMatch = serverItem.timestamp >= (localTask.startTime / 1000) - 600;
        const cleanPrompt = serverItem.prompt ? serverItem.prompt.replace(/^\[.*?\]\s*/, '') : '';
        const localP = localTask.prompt ? localTask.prompt.substring(0, 50).trim() : '';
        return timeMatch && (cleanPrompt.startsWith(localP) || localP === '');
      });

      if (matches.length > 0) {
        const completedMatch = matches.find(m => m.image);
        if (completedMatch) {
          // 如果是 MJ 任务，尝试收集所有 4 张图
          const isMj = localTask.metadata?.model === 'midjourney';
          if (isMj) {
            const allImages = matches.filter(m => m.image).map(m => m.image).slice(0, 4);
            if (allImages.length >= 1) {
              taskManagerRef.current.completeTask(localTask.id, allImages);
            }
          } else {
            taskManagerRef.current.completeTask(localTask.id, completedMatch.image);
          }
        }
      } else if (Date.now() - localTask.startTime > 30 * 60 * 1000) {
        taskManagerRef.current.failTask(localTask.id, 'Timeout: Task not found on server');
      }
    });
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

      setCanvasNodes(prev => prev.map(node => {
        // 用 taskId 匹配画布节点和任务管理器的任务
        const task = runningTasks.find(t => t.id === node.taskId || t.id === node.id);
        if (task) {
          let newStatus = node.status;
          if (task.status === TASK_STATUS.SUCCESS) newStatus = 'done';
          else if (task.status === TASK_STATUS.ERROR) newStatus = 'error';
          else if (task.status === TASK_STATUS.RUNNING) newStatus = 'running';
          else newStatus = 'pending';

          return {
            ...node,
            progress: task.progress || node.progress,
            status: newStatus,
            image: Array.isArray(task.result) ? (task.result[node.slotIndex || 0] || node.image) : (task.result || node.image),
            error: task.error || node.error
          };
        }
        return node;
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
    if (!isValid || !token || isSubmittingRef.current) return;
    if (quota <= 0) { showToast(t.toast.noQuota, 'error'); return; }
    isSubmittingRef.current = true;

    // 乐观扣分：立即在前端显示扣减后的积分（后端会真正扣分，API返回后用真实值覆盖）
    const optimisticQuota = Math.max(0, quota - totalPoints);
    setQuota(optimisticQuota);
    localStorage.setItem('quota', optimisticQuota.toString());
    window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: optimisticQuota } }));

    // 直接使用用户在 UI 中选择的 model id（gpt-image-2 / gpt-image-2-high）
    // Nano Banana 2：按用户选择的分辨率切换到对应的 model id（同家族三档）
    let finalModel = model;
    if (model === 'nano-banana-2' || model === 'nano-banana-2-2k' || model === 'nano-banana-2-4k') {
      if (resLevel === '4K') finalModel = 'nano-banana-2-4k';
      else if (resLevel === '2K') finalModel = 'nano-banana-2-2k';
      else finalModel = 'nano-banana-2';
    }

    const taskId = taskManager.createTask('create', prompt, {
      referImages, model: finalModel, size: currentDimensions.str, quality, n: numImages
    });

    // 在画布上创建 N 个加载占位节点
    const n = isMjModel ? (numImages || 1) * 4 : (numImages || 1);
    // 动态获取当前画布视角的中心点
    const center = canvasRef.current?.getViewportCenter() || { x: 500, y: 300 };
    const nodeW = 512;
    const nodeH = currentDimensions.w && currentDimensions.h ? 512 * (currentDimensions.h / currentDimensions.w) : 512;
    const positions = getNewNodePositions(n, canvasNodes, center, nodeW, nodeH);
    const newNodes = [];
    for (let i = 0; i < n; i++) {
      newNodes.push({
        id: `${taskId}_${i}`,
        taskId: taskId,
        x: positions[i].x,
        y: positions[i].y,
        w: nodeW,
        h: nodeH,
        image: null,
        referImages: [...referImages],
        prompt: prompt,
        timestamp: Date.now() / 1000,
        type: 'create',
        status: 'pending',
        progress: 0,
        slotIndex: isMjModel ? (i % 4) : i,
        zIndex: 1,
      });
    }
    setCanvasNodes(prev => [...prev, ...newNodes]);
    setActiveHistoryId(taskId);
    setPrompt(''); // 发送后清空输入框
    setTimeout(() => {
      const ta = document.getElementById('main-prompt-input');
      if (ta) ta.style.height = 'auto';
    }, 10);

    executeCreateTask(taskId, prompt, referImages, { model: finalModel, size: currentDimensions.str, quality, n: numImages });
    isSubmittingRef.current = false;
  };

  // 异步执行创作任务（提交 + 轮询模式，支持长时间生成）
  const executeCreateTask = async (taskId, p, rImgs, params) => {
    taskManager.updateTask(taskId, { status: TASK_STATUS.RUNNING });

    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 0.5 + Math.random() * 1, 95);
      setCanvasNodes(prev => prev.map(node =>
        node.taskId === taskId ? { ...node, progress: currentProgress } : node
      ));
      taskManager.updateProgress(taskId, currentProgress);
    }, 1000);

    try {
      // 1. 提交任务
      const formData = new FormData();
      formData.append('prompt', p);
      formData.append('image_urls_json', JSON.stringify(rImgs));
      
      let res;
      if (params.model === 'midjourney') {
        formData.append('aspect_ratio', aspectRatio === 'auto' ? '1:1' : aspectRatio);
        formData.append('mj_mode', mjMode);
        formData.append('mj_version', mjVersion);
        res = await fetch(`${API_BASE_URL}/api/create/mj`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
          keepalive: true
        });
      } else {
        if (params.model) formData.append('model', params.model);
        if (params.size) formData.append('size', params.size);
        if (params.quality) formData.append('quality', params.quality);
        if (params.n) formData.append('n', params.n.toString());
        formData.append('type', 'create');

        res = await fetch(`${API_BASE_URL}/api/create`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
      }

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

      const submitData = await res.json();
      const serverTaskId = submitData.data.taskId;

      // 保存 serverTaskId 到画布节点，以便 fetchHistory 时能通过 ID 过滤重复项
      setCanvasNodes(prev => prev.map(node =>
        node.taskId === taskId ? { ...node, serverTaskId } : node
      ));

      // 更新积分（预扣分已在后端完成）
      if (submitData.data.remaining_quota !== undefined) {
        setQuota(submitData.data.remaining_quota);
        localStorage.setItem('quota', submitData.data.remaining_quota.toString());
        window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: submitData.data.remaining_quota } }));
      }

      // 2. 轮询任务状态（每 3 秒查询一次，最长等 15 分钟）
      const maxPollTime = 15 * 60 * 1000; // 15 分钟
      const pollStart = Date.now();

      while (Date.now() - pollStart < maxPollTime) {
        await new Promise(resolve => setTimeout(resolve, 3000));

        try {
          const statusRes = await fetch(`${API_BASE_URL}/api/create/status/${serverTaskId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (!statusRes.ok) continue;

          const statusData = await statusRes.json();

          if (statusData.status === 'SUCCESS') {
            clearInterval(progressInterval);
            const imageUrl = statusData.image_url;
            const imageUrls = statusData.image_urls || (imageUrl ? [imageUrl] : []);

            taskManager.completeTask(taskId, imageUrls.length > 1 ? imageUrls : imageUrl);
            // 将每张图片分配到对应的画布节点
            setCanvasNodes(prev => prev.map(node => {
              if (node.taskId !== taskId) return node;
              const idx = node.slotIndex || 0;
              const url = imageUrls[idx] || imageUrls[0] || imageUrl;
              return {
                ...node,
                image: url,
                image_urls: imageUrls,
                status: 'done',
                progress: 100,
              };
            }));

            if (activeHistoryId === taskId) setResult(imageUrl);
            return; // 成功，退出
          }

          if (statusData.status === 'FAILED') {
            throw new Error(lang === 'zh' ? '图片生成失败，请重试' : 'Image generation failed, please retry');
          }
          // ON_QUEUE 状态 → 继续轮询
        } catch (pollErr) {
          if (pollErr.message.includes('生成失败') || pollErr.message.includes('generation failed')) {
            throw pollErr;
          }
          // 网络抖动等 → 忽略，继续轮询
        }
      }

      // 超过15分钟仍未完成
      throw new Error(lang === 'zh' ? '生成超时，请稍后在历史记录中查看' : 'Generation timed out');

    } catch (err) {
      clearInterval(progressInterval);
      taskManager.failTask(taskId, err.message);
      setCanvasNodes(prev => prev.map(node =>
        node.taskId === taskId ? { ...node, status: 'error', error: err.message } : node
      ));
      showToast(err.message, 'error');
    } finally {
      // 任务结束（无论成功或失败），静默同步最新积分（解决失败返还积分不同步问题）
      try {
        const userRes = await fetch(`${API_BASE_URL}/api/user/me`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (userRes.ok) {
          const userData = await userRes.json();
          window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: userData.quota } }));
        }
      } catch (e) {}
    }
  };

  const currentImage = history.find(h => h.id === activeHistoryId)?.image || (activeHistoryId ? null : result);

  const [showParams, setShowParams] = useState(false);
  const [showMode, setShowMode] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [hoveringNodeImage, setHoveringNodeImage] = useState(null);
  const isHoveringDropzoneRef = useRef(false);

  const canvasRef = useRef(null);
  const paramsRef = useRef(null);
  const paramsBtnRef = useRef(null);
  const modeRef = useRef(null);
  const modeBtnRef = useRef(null);
  const modelRef = useRef(null);
  const modelBtnRef = useRef(null);
  
  useEffect(() => {
    const handleClick = (e) => {
      if (paramsRef.current && !paramsRef.current.contains(e.target) && paramsBtnRef.current && !paramsBtnRef.current.contains(e.target)) {
        setShowParams(false);
      }
      if (modeRef.current && !modeRef.current.contains(e.target) && modeBtnRef.current && !modeBtnRef.current.contains(e.target)) {
        setShowMode(false);
      }
      if (modelRef.current && !modelRef.current.contains(e.target) && modelBtnRef.current && !modelBtnRef.current.contains(e.target)) {
        setShowModel(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleDownload = async (imgUrl) => {
    if (!imgUrl) return;
    const secureUrl = toSecureUrl(imgUrl);
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
      window.open(secureUrl, '_blank');
      showToast(lang === 'zh' ? '已在新标签页打开，请右键保存图片' : 'Opened in new tab, right-click to save', 'info');
    }
  };

  const handleCopy = async (imgUrl) => {
    if (!imgUrl) return;
    const secureUrl = toSecureUrl(imgUrl);
    try {
      const response = await fetch(secureUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showToast(t.toast.copySuccess);
    } catch (err) {
      try {
        await navigator.clipboard.writeText(secureUrl);
        showToast(lang === 'zh' ? '已复制图片链接' : 'Image URL copied', 'success');
      } catch {
        showToast(t.toast.copyFail, 'error');
      }
    }
  };

  return (
    <div className={`w-full h-full bg-[#050505] text-white font-sans flex flex-col overflow-hidden relative ${isImmersive ? 'fixed inset-0 z-[9999]' : ''}`}>
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onLogin={handleLogin} t={t} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <FullscreenViewer isOpen={showFullscreen} image={result} onClose={() => setShowFullscreen(false)} />

      {/* Main Content: Infinite Canvas */}
      <main className="flex-1 overflow-hidden w-full relative">
        <InfiniteCanvas
          ref={canvasRef}
          nodes={canvasNodes.map(n => ({ ...n, image: n.image ? toSecureUrl(n.image) : null }))}
          onNodesChange={setCanvasNodes}
          isImmersive={isImmersive}
          onToggleImmersive={onToggleImmersive}
          onNodeDragMove={(e, node) => {
            if (!node || !node.image) return;
            const dropzone = document.getElementById('upload-dropzone');
            if (dropzone) {
              const rect = dropzone.getBoundingClientRect();
              const isHovering = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
              if (isHovering !== isHoveringDropzoneRef.current) {
                isHoveringDropzoneRef.current = isHovering;
                if (isHovering) {
                  setHoveringNodeImage(node.image);
                } else {
                  setHoveringNodeImage(null);
                }
              }
            }
          }}
          onNodeDragEnd={(e, node) => {
            isHoveringDropzoneRef.current = false;
            setHoveringNodeImage(null);
            
            const dropzone = document.getElementById('upload-dropzone');
            if (dropzone && node && node.image) {
              const rect = dropzone.getBoundingClientRect();
              // Check if mouse released within the dropzone rect
              if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                // Prevent duplicate
                if (referImages.includes(node.image)) return;
                
                setReferImages(prev => {
                  if (prev.includes(node.image)) return prev;
                  return [...prev, node.image];
                });
              }
            }
          }}
          onNodeAction={(action, node) => {
            if (!node) return;
            if (action === 'download') handleDownload(node.image);
            else if (action === 'fullscreen') { setResult(node.image); setShowFullscreen(true); }
            else if (action === 'delete') {
              setCanvasNodes(prev => prev.filter(n => n.id !== node.id));
            }
          }}
          onDoubleClickNode={(node) => {
            if (node.image) { setResult(node.image); setShowFullscreen(true); }
          }}
          onMetaUpdate={(nodeId, updates) => {
            setCanvasNodes(prev => prev.map(n => n.id === nodeId ? { ...n, ...updates } : n));
          }}
        />
      </main>

      {/* Sticky Input Bar */}
      <div className={`absolute bottom-0 left-0 w-full pb-6 px-4 md:px-8 flex justify-center pointer-events-none z-40 transition-all duration-300`}>
        <div className="w-full max-w-4xl pointer-events-auto flex flex-col gap-2 relative">
          <div className="bg-[#1c1c1e] rounded-[24px] p-3 pb-4 flex flex-col relative transition-all border border-transparent shadow-none">
            
            {/* Input Row */}
            <div className="flex items-start gap-3 px-1 pb-3 pt-1">
              <div className="flex flex-wrap gap-2 shrink-0">
                <label id="upload-dropzone" className="w-[52px] h-[52px] rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer transition-colors shrink-0">
                  <Plus size={20} className="text-white/30" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleAddImage} />
                </label>
                {referImages.map((url, i) => (
                  <div key={i} className="relative w-[52px] h-[52px] rounded-xl border border-white/10 overflow-hidden group shadow-sm shrink-0 animate-in zoom-in-90 duration-200">
                    <img src={toSecureUrl(url)} className="w-full h-full object-cover" alt="ref" />
                    <button onClick={() => handleRemoveImage(i)} className="absolute top-1 right-1 p-1 bg-black/60 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                  </div>
                ))}
                {/* 悬停时的缩略图预览 */}
                {hoveringNodeImage && !referImages.includes(hoveringNodeImage) && (
                  <div className="relative w-[52px] h-[52px] rounded-xl border-2 border-[#00C4B6] border-dashed overflow-hidden opacity-80 shrink-0 animate-in fade-in zoom-in-95 duration-200">
                    <img src={toSecureUrl(hoveringNodeImage)} className="w-full h-full object-cover" alt="ref-preview" />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <div className="bg-[#00C4B6] rounded-full p-1 shadow-lg">
                        <Check size={12} className="text-white" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <textarea
                id="main-prompt-input"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={lang === 'zh' ? '今天我们要生成点什么？' : 'What are we creating today?'}
                className="flex-1 bg-transparent border-none text-white text-[14px] placeholder:text-white/30 resize-none outline-none py-2 max-h-40 min-h-[52px] custom-scrollbar leading-relaxed"
                rows={1}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = (e.target.scrollHeight) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (isValid && isLoggedIn) handleGenerate();
                  }
                }}
              />
            </div>

            {/* Tags and Actions Row */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                {/* 模式选择 (Mode) */}
                <div className="relative z-50">
                  <button 
                    ref={modeBtnRef}
                    onClick={() => setShowMode(!showMode)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all text-[14px] font-medium ${showMode ? 'bg-[#2a2a2e] text-white' : 'bg-transparent text-[#00C4B6] hover:bg-white/5'}`}
                  >
                    <ImageIcon size={16} className={showMode ? "text-white" : "text-[#00C4B6]"} />
                    <span className={showMode ? "text-white" : "text-[#00C4B6]"}>图片生成</span>
                    <ChevronDown size={14} className={`ml-0.5 transition-transform ${showMode ? 'rotate-180 text-white/60' : 'text-[#00C4B6]/60'}`} />
                  </button>
                  {showMode && (
                    <div ref={modeRef} className="absolute bottom-[calc(100%+8px)] left-0 w-[170px] bg-[#1c1c1e] border border-white/5 rounded-xl shadow-2xl p-1.5 animate-in slide-in-from-bottom-2 fade-in duration-200">
                      <button onClick={() => setShowMode(false)} className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-white bg-white/5 rounded-lg">
                        <span className="text-[#00C4B6]">图片生成</span><Check size={14} className="text-[#00C4B6]" />
                      </button>
                      <button className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-white/40 hover:bg-white/5 rounded-lg cursor-not-allowed">
                        <span>视频生成</span><span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/60">敬请期待</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 参数设置 (Params) */}
                <div className="relative z-50">
                  <button 
                    ref={paramsBtnRef}
                    onClick={() => setShowParams(!showParams)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] transition-all text-[12px] font-medium border
                      ${showParams ? 'bg-[#2a2a2e] border-white/20 text-white' : 'bg-[#222225] border-white/10 text-white/70 hover:bg-white/5'}`}
                  >
                    <span className="opacity-70">{aspectRatio === 'auto' ? '1:1' : aspectRatio}</span>
                    {!isMjModel ? (
                      <>
                        <span className="opacity-40 mx-0.5">|</span>
                        <span>{RES_LEVELS.find(r => r.id === resLevel)?.label[lang] || resLevel}</span>
                        <span className="opacity-40 mx-0.5">|</span>
                        <span className="opacity-70">{QUALITIES.find(q => q.id === quality)?.label[lang] || quality}</span>
                      </>
                    ) : (
                      <>
                        <span className="opacity-40 mx-0.5">|</span>
                        <span className="opacity-70 capitalize">{mjMode === 'relax' ? 'Relax' : mjMode === 'fast' ? 'Fast' : 'Turbo'}</span>
                        <span className="opacity-40 mx-0.5">|</span>
                        <span className="opacity-70">{MJ_VERSIONS.find(v => v.id === mjVersion)?.label || mjVersion}</span>
                      </>
                    )}
                    <span className="opacity-40 mx-0.5">|</span>
                    <span className="text-[#00C4B6]">x{numImages || 1}</span>
                  </button>

                  {/* Invisible bridge to prevent hover/click loss if needed */}
                  <div className={`absolute bottom-full left-0 w-full h-2 ${showParams ? 'block' : 'hidden'}`}></div>
                  
                  {/* Popover (Left Aligned with the button) */}
                  {showParams && (
                    <div ref={paramsRef} className="absolute bottom-[calc(100%+8px)] left-0 w-[380px] bg-[#1c1c1e] border border-white/5 rounded-[20px] shadow-2xl p-5 z-50 animate-in slide-in-from-bottom-2 fade-in duration-200 cursor-default" onClick={e => e.stopPropagation()}>
                      {/* 比例 */}
                      <div className="space-y-3 mb-6">
                        <label className="text-[11px] text-white/40">{lang === 'zh' ? '选择比例' : 'Aspect Ratio'}</label>
                        <div className="flex justify-between gap-1">
                          {RATIOS.map(r => (
                            <button key={r} onClick={(e) => { e.stopPropagation(); setAspectRatio(r); }} className={`flex flex-col items-center justify-center gap-1.5 w-11 h-[52px] rounded-lg transition-all ${aspectRatio === r ? 'bg-white/10 text-white shadow-sm' : 'bg-transparent hover:bg-white/5 text-white/40 hover:text-white'}`}>
                              <div className="h-4 flex items-center justify-center opacity-90 scale-90">{getRatioBox(r, false)}</div>
                              <span className="text-[10px]">{r === 'auto' ? (lang === 'zh' ? '智能' : 'Auto') : r}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 分辨率 - gpt-image-2 仅支持 1K，MJ 不支持，该模型下隐藏 */}
                      {(!lockedTo1K && !isMjModel) && (
                        <div className="space-y-3 mb-6">
                          <label className="text-[11px] text-white/40">{lang === 'zh' ? '选择分辨率' : 'Resolution'}</label>
                          <div className="flex gap-2">
                            {RES_LEVELS.map(res => (
                              <button key={res.id} onClick={(e) => { e.stopPropagation(); setResLevel(res.id); }} className={`flex-1 py-2.5 rounded-xl text-[13px] transition-all flex items-center justify-center gap-1 ${resLevel === res.id ? 'bg-[#2c2c2e] text-white shadow-sm' : 'bg-transparent text-white/40 border border-white/5 hover:bg-white/5 hover:text-white'}`}>
                                {res.label[lang]}
                                {res.premium && <Sparkles size={12} className={resLevel === res.id ? "text-[#00C4B6]" : "text-[#00C4B6]/50"} />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 尺寸预览 */}
                      {!isMjModel && (
                        <div className="space-y-3 mb-6">
                          <label className="text-[11px] text-white/40">{lang === 'zh' ? '尺寸' : 'Size'}</label>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-[#121212] rounded-lg px-3 py-2 flex items-center justify-between">
                              <span className="text-white/30 text-xs">W</span>
                              <span className="text-xs font-mono text-white/80">{currentDimensions.w || 'Auto'}</span>
                            </div>
                            <div className="text-white/20 shrink-0"><X size={12}/></div>
                            <div className="flex-1 bg-[#121212] rounded-lg px-3 py-2 flex items-center justify-between">
                              <span className="text-white/30 text-xs">H</span>
                              <span className="text-xs font-mono text-white/80">{currentDimensions.h || 'Auto'}</span>
                            </div>
                            <span className="text-white/30 text-[10px] font-bold shrink-0 ml-1">PX</span>
                          </div>
                        </div>
                      )}

                      {/* MJ 的模式和版本选择 */}
                      {isMjModel && (
                        <div className="space-y-6 mb-6">
                          <div className="space-y-3">
                            <label className="text-[11px] text-white/40">{lang === 'zh' ? 'MJ 模式' : 'Mode'}</label>
                            <div className="flex bg-[#121212] rounded-lg p-1 h-[32px]">
                              {['relax', 'fast', 'turbo'].map(m => (
                                <button key={m} onClick={(e) => { e.stopPropagation(); setMjMode(m); }} className={`flex-1 rounded-md text-[11px] transition-colors ${mjMode === m ? 'bg-[#2c2c2e] text-white shadow-sm' : 'text-white/40 hover:text-white'}`}>
                                  {m === 'relax' ? 'Relax' : m === 'fast' ? 'Fast' : 'Turbo'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-3">
                            <label className="text-[11px] text-white/40">{lang === 'zh' ? 'MJ 版本' : 'Version'}</label>
                            <div className="flex bg-[#121212] rounded-lg p-1 h-[32px] overflow-x-auto custom-scrollbar">
                              {MJ_VERSIONS.map(v => (
                                <button key={v.id} onClick={(e) => { e.stopPropagation(); setMjVersion(v.id); }} className={`flex-1 min-w-[50px] rounded-md text-[11px] transition-colors whitespace-nowrap px-2 ${mjVersion === v.id ? 'bg-[#2c2c2e] text-white shadow-sm' : 'text-white/40 hover:text-white'}`}>
                                  {v.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 质量 & 数量 */}
                      <div className="grid grid-cols-2 gap-4">
                        {!isMjModel && (
                          <div className="space-y-3">
                            <label className="text-[11px] text-white/40 block h-[16px] leading-[16px]">{lang === 'zh' ? '生成质量' : 'Quality'}</label>
                            <div className="flex bg-[#121212] rounded-lg p-1 h-[32px]">
                              {QUALITIES.map(q => (
                                <button key={q.id} onClick={(e) => { e.stopPropagation(); setQuality(q.id); }} className={`flex-1 rounded-md text-[11px] transition-colors ${quality === q.id ? 'bg-[#2c2c2e] text-white shadow-sm' : 'text-white/40 hover:text-white'}`}>
                                  {q.label[lang]}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <div className={`space-y-3 ${isMjModel ? 'col-span-2' : ''}`}>
                          <label className="text-[11px] text-white/40 block h-[16px] leading-[16px]">{lang === 'zh' ? '生成数量' : 'Count'}</label>
                          <div className="flex items-center justify-between bg-[#121212] rounded-lg p-1 h-[32px]">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setNumImages(Math.max(1, (numImages || 1) - 1)); }}
                              className="w-8 h-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-md transition-colors"
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="text"
                              value={numImages}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                if (val === '') { setNumImages(''); return; }
                                setNumImages(Math.min(10, Math.max(1, parseInt(val))));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={() => { if (!numImages) setNumImages(1); }}
                              className="w-8 text-[13px] font-mono text-white bg-transparent text-center outline-none"
                            />
                            <button 
                              onClick={(e) => { e.stopPropagation(); setNumImages(Math.min(10, (numImages || 1) + 1)); }}
                              className="w-8 h-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-md transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* 模型选择 (Model) 移到了右侧 */}
                <div className="relative z-50">
                  <button 
                    ref={modelBtnRef}
                    onClick={() => setShowModel(!showModel)}
                    className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${showModel ? 'bg-[#2a2a2e] text-white shadow-sm' : 'bg-white/5 hover:bg-white/10 text-white/70'}`}
                    title={isNanoBanana2 ? 'Nano Banana 2' : (isMjModel ? 'Midjourney' : (model === 'gpt-image-2-high' ? 'GPT Image 2 High' : (model === 'gpt-image-2-pro' ? 'GPT Image 2 Pro' : 'GPT Image 2')))}
                  >
                    {isNanoBanana2 ? (
                      <span className="text-base">🍌</span>
                    ) : isMjModel ? (
                      <img src={MidjourneyIcon} alt="MJ" className={`w-4 h-4 ${showModel ? 'opacity-100' : 'opacity-70'}`} />
                    ) : (
                      <img src={ChatGptIcon} alt="GPT" className={`w-4 h-4 ${showModel ? 'opacity-100' : 'opacity-70'}`} />
                    )}
                  </button>
                  {showModel && (
                    <div ref={modelRef} className="absolute bottom-[calc(100%+8px)] right-0 w-[280px] bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-2 fade-in duration-200">
                      {[
                          { id: 'gpt-image-2', name: 'GPT Image 2' },
                          { id: 'gpt-image-2-high', name: 'GPT Image 2 High', tag: '高分辨率' },
                          { id: 'gpt-image-2-pro', name: 'GPT Image 2 Pro', tag: '快速', badge: 'Pro', minQuota: PRO_COST_PER_IMAGE },
                          { id: 'nano-banana-2', name: 'Nano Banana 2', badge: 'NEW', minQuota: NANO_BANANA_2_COST_PER_IMAGE, desc: '1K/2K/4K · 30 积分/张' },
                          { id: 'midjourney', name: 'Midjourney', badge: 'MJ', minQuota: Math.min(...Object.values(MJ_COST_BY_MODE)) },
                      ].map(m => {
                        const disabled = m.minQuota !== undefined && quota < m.minQuota;
                        const isActive = model === m.id || (m.id === 'nano-banana-2' && isNanoBanana2);
                        return (
                          <button
                            key={m.id}
                            disabled={disabled}
                            onClick={() => {
                              if (disabled) {
                                showToast(`积分不足 ${m.minQuota}，无法使用 ${m.name}`, 'error');
                                return;
                              }
                              if (m.id === 'nano-banana-2' && !isNanoBanana2) {
                                setResLevel('1K');
                              }
                              setModel(m.id);
                              setShowModel(false);
                            }}
                            className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${isActive ? 'bg-white/[0.03]' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5'}`}
                          >
                            <div className="flex items-center gap-3">
                              {m.id === 'midjourney' ? (
                                <img src={MidjourneyIcon} className="w-5 h-5" alt="midjourney" />
                              ) : m.id === 'nano-banana-2' ? (
                                <span className="text-lg leading-none">🍌</span>
                              ) : (
                                <img src={ChatGptIcon} className="w-5 h-5" alt="gpt" />
                              )}
                              <div className="flex flex-col items-start gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="text-xs font-bold text-white/80">{m.name}</div>
                                  {m.tag && (
                                    <span className={`text-[9px] font-bold px-1.5 py-[2px] rounded-md text-white shadow-sm border border-white/10 ${m.id === 'gpt-image-2-pro' ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`}>
                                      {m.tag}
                                    </span>
                                  )}
                                </div>
                                {disabled && (
                                  <div className="text-[10px] text-white/40">积分不足</div>
                                )}
                              </div>
                            </div>
                            {isActive && <Check size={14} className="text-[#00C4B6]" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleGenerate}
                  disabled={!isValid || !isLoggedIn}
                  className={`shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 transition-all shadow-md
                    ${isValid && isLoggedIn ? 'bg-white text-black hover:bg-white/90' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
                >
                  <Sparkles size={14} className={isValid && isLoggedIn ? "text-black" : "text-white/30"} />
                  <span className="text-[13px] font-medium">{totalPoints}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
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

    // 乐观扣分：立即显示积分减少
    const optimisticQuota = Math.max(0, quota - 1);
    setQuota(optimisticQuota);
    localStorage.setItem('quota', optimisticQuota.toString());
    window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: optimisticQuota } }));

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
        // 通知顶层 App 立即刷新 Header 积分显示
        window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: data.data.remaining_quota } }));

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

// ==========================================
// 🔒 滑块验证组件
// ==========================================
const SliderCaptcha = ({ onVerified, t }) => {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [verified, setVerified] = useState(false);
  const startX = useRef(0);

  const THRESHOLD = 0.85; // 拖到85%即算通过

  const handleStart = (clientX) => {
    if (verified) return;
    setDragging(true);
    startX.current = clientX - offsetX;
  };

  const handleMove = (clientX) => {
    if (!dragging || verified) return;
    const track = trackRef.current;
    if (!track) return;
    const maxX = track.offsetWidth - 44;
    const x = Math.min(Math.max(0, clientX - startX.current), maxX);
    setOffsetX(x);
  };

  const handleEnd = async () => {
    if (!dragging || verified) return;
    setDragging(false);
    const track = trackRef.current;
    if (!track) return;
    const maxX = track.offsetWidth - 44;
    if (offsetX / maxX >= THRESHOLD) {
      setVerified(true);
      setOffsetX(maxX);
      // 从后端获取验证token
      try {
        const res = await fetch(`${API_BASE_URL}/auth/captcha-config`);
        const data = await res.json();
        onVerified?.(data.captcha_token);
      } catch {
        onVerified?.('client-verified');
      }
    } else {
      setOffsetX(0);
    }
  };

  React.useEffect(() => {
    const onMouseMove = (e) => handleMove(e.clientX);
    const onMouseUp = () => handleEnd();
    const onTouchMove = (e) => handleMove(e.touches[0].clientX);
    const onTouchEnd = () => handleEnd();
    if (dragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onTouchEnd);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  });

  const reset = () => { setVerified(false); setOffsetX(0); };

  return (
    <div className="mb-1">
      <div
        ref={trackRef}
        className={`relative h-11 rounded-lg overflow-hidden select-none ${verified ? 'bg-green-500/10 border border-green-500/30' : 'bg-[#0a0a0a] border border-white/10'}`}
      >
        {/* 填充进度 */}
        <div
          className={`absolute inset-y-0 left-0 transition-colors ${verified ? 'bg-green-500/20' : 'bg-[#FF8A3D]/10'}`}
          style={{ width: offsetX + 44 }}
        />
        {/* 提示文字 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {verified ? (
            <span className="text-xs text-green-400 font-medium flex items-center gap-1">
              <Check size={14} /> {t.auth.verified}
            </span>
          ) : (
            <span className="text-xs text-white/30">{t.auth.slideToVerify}</span>
          )}
        </div>
        {/* 滑块 */}
        <div
          className={`absolute top-0.5 bottom-0.5 w-10 rounded-md flex items-center justify-center cursor-grab active:cursor-grabbing transition-shadow ${verified ? 'bg-green-500 shadow-lg shadow-green-500/30' : 'bg-[#FF8A3D] shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40'}`}
          style={{ left: offsetX, transition: dragging ? 'none' : 'left 0.3s ease' }}
          onMouseDown={(e) => handleStart(e.clientX)}
          onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        >
          {verified ? <Check size={16} className="text-white" /> : <ArrowRight size={16} className="text-white" />}
        </div>
      </div>
    </div>
  );
};

const LoginModal = ({ isOpen, onClose, onLogin, t }) => {
  const [activeTab, setActiveTab] = useState('password'); // 'password' | 'phone'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');

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
      setUsername(''); setPassword(''); setPhone(''); setCode('');
      setError(''); setCountdown(0); setCaptchaToken(''); setInviteCode('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 账号密码登录
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) { setError('请输入用户名和密码'); return; }
    setLoading(true); setError('');
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      const res = await fetch(`${API_BASE_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '登录失败');
      // 保存 role 到 localStorage
      if (data.role) localStorage.setItem('role', data.role);
      onLogin(data.access_token, data.username, data.quota);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // 发送验证码（需要滑块验证）
  const handleSendCode = async () => {
    if (!phone || phone.length !== 11) { setError('请输入正确的11位手机号'); return; }
    if (!captchaToken) { setError('请先完成滑块验证'); return; }
    setSending(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, captcha_token: captchaToken })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '发送失败');
      setCountdown(60);
    } catch (err) { setError(err.message); }
    finally { setSending(false); }
  };

  // 验证码登录
  const handlePhoneLogin = async (e) => {
    e.preventDefault();
    if (!phone || !code) { setError('请输入手机号和验证码'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, invite_code: inviteCode || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '验证失败');
      if (data.role) localStorage.setItem('role', data.role);
      onLogin(data.access_token, data.username, data.quota);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-[400px] bg-[#141414] border border-white/10 rounded-2xl shadow-2xl p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"><X size={18} /></button>
        
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <OGLogo />
          <div className="text-center">
            <h2 className="text-xl font-bold text-white tracking-tight">{t.auth.productName}</h2>
            <p className="text-xs text-white/40 mt-1">{t.auth.subtitle}</p>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex bg-[#0a0a0a] rounded-lg p-1 mb-6">
          <button
            onClick={() => { setActiveTab('password'); setError(''); }}
            className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${activeTab === 'password' ? 'bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
          >{t.auth.tabPassword}</button>
          <button
            onClick={() => { setActiveTab('phone'); setError(''); }}
            className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${activeTab === 'phone' ? 'bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
          >{t.auth.tabPhone}</button>
        </div>

        {/* 账号密码登录表单 */}
        {activeTab === 'password' && (
          <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
            <div>
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">{t.auth.username}</label>
              <input
                type="text" value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none transition-all placeholder:text-white/20"
                placeholder={t.auth.placeholderUsername}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">{t.auth.password}</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 pr-10 text-sm text-white focus:border-[#FF8A3D] focus:outline-none transition-all placeholder:text-white/20"
                  placeholder={t.auth.placeholderPassword}
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                  {showPwd ? <Lock size={16} /> : <Lock size={16} />}
                </button>
              </div>
            </div>
            {error && <div className="text-red-400 text-xs flex items-center gap-1 bg-red-500/10 p-2 rounded"><AlertCircle size={12} />{error}</div>}
            <button type="submit" disabled={loading} className="w-full h-11 mt-1 bg-gradient-to-r from-[#FF8A3D] to-[#E65100] hover:opacity-90 text-white font-bold rounded-lg text-sm transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : t.auth.submit}
            </button>
          </form>
        )}

        {/* 手机验证码登录表单 */}
        {activeTab === 'phone' && (
          <form onSubmit={handlePhoneLogin} className="flex flex-col gap-4">
            <div>
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">{t.auth.phone}</label>
              <input
                type="tel" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className="w-full h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none transition-all placeholder:text-white/20"
                placeholder={t.auth.placeholderPhone}
              />
            </div>
            {/* 滑块验证 */}
            <SliderCaptcha onVerified={(token) => setCaptchaToken(token)} t={t} />
            {/* 验证码 */}
            <div>
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">{t.auth.code}</label>
              <div className="flex gap-3">
                <input
                  type="text" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="flex-1 h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none transition-all placeholder:text-white/20"
                  placeholder={t.auth.placeholderCode}
                />
                <button
                  type="button" onClick={handleSendCode}
                  disabled={sending || countdown > 0 || !captchaToken}
                  className={`w-28 h-11 rounded-lg text-xs font-bold transition-all ${(countdown > 0 || !captchaToken) ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-[#FF8A3D]/20 text-[#FF8A3D] hover:bg-[#FF8A3D]/30'}`}
                >
                  {sending ? t.auth.sending : countdown > 0 ? `${countdown}s` : t.auth.sendCode}
                </button>
              </div>
            </div>
            {/* 邀请码（选填） */}
            <div>
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">{t.auth.inviteCode}</label>
              <input
                type="text" value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase())}
                className="w-full h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none transition-all placeholder:text-white/20"
                placeholder={t.auth.placeholderInviteCode}
              />
            </div>
            {error && <div className="text-red-400 text-xs flex items-center gap-1 bg-red-500/10 p-2 rounded"><AlertCircle size={12} />{error}</div>}
            <button type="submit" disabled={loading} className="w-full h-11 mt-1 bg-gradient-to-r from-[#FF8A3D] to-[#E65100] hover:opacity-90 text-white font-bold rounded-lg text-sm transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : t.auth.submit}
            </button>
          </form>
        )}
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


// ==========================================
// 🚀 快速创作组件 (整合商品、修图、人像)
// ==========================================
const QuickCreateStudio = ({ onBack, lang, token }) => {
  const t = TRANSLATIONS[lang];
  const taskManager = useTaskManager();
  

  const [quota, setQuota] = useState(() => parseInt(localStorage.getItem('quota') || '0'));
  
  const [mode, setMode] = useState('image'); 
  const [isLoggedIn] = useState(!!token && token !== 'null');
  const [showLogin, setShowLogin] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const [prompt, setPrompt] = useState('');
  const [referImages, setReferImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  
  const [model, setModel] = useState('gpt-image-2');
  const [aspectRatio, setAspectRatio] = useState('auto');
  const [resLevel, setResLevel] = useState('1K');
  const [quality, setQuality] = useState('auto');

  // GPT Image 2 Pro：固定 22 积分/张
  const PRO_COST_PER_IMAGE = 22;
  const isProModel = model === 'gpt-image-2-pro';

  // Midjourney：按模式计费，每次生成 4 张子图
  const MJ_COST_BY_MODE = { relax: 22, fast: 42, turbo: 62 };
  const MJ_IMAGES_PER_TASK = 4;
  const MJ_VERSIONS = [
    { id: 'v8.1', label: 'V8.1', sub: '最新' },
    { id: 'v7',   label: 'V7',   sub: '稳定' },
    { id: 'v6.1', label: 'V6.1', sub: '经典' },
    { id: 'v5.2', label: 'V5.2', sub: '写实' },
    { id: 'niji 6', label: 'Niji 6', sub: '动漫' },
  ];
  const isMjModel = model === 'midjourney';
  const [mjMode, setMjMode] = useState('fast'); // relax / fast / turbo
  const [mjVersion, setMjVersion] = useState('v8.1');
  const mjCostPerTask = MJ_COST_BY_MODE[mjMode] || 42;

  // gpt-image-2 仅支持 1K，切到该模型时强制回到 1K，同时在 UI 隐藏分辨率切换
  // Pro / MJ 不锁 1K：Pro 支持任意 WxH；MJ 根本没分辨率选项（后面会整块隐藏）
  const lockedTo1K = model === 'gpt-image-2';
  useEffect(() => {
    if (lockedTo1K && resLevel !== '1K') setResLevel('1K');
  }, [lockedTo1K, resLevel]);

  // Nano Banana 2：三档分辨率 = 三个 model id，统一 30 积分/张
  const isNanoBanana2 = model === 'nano-banana-2' || model === 'nano-banana-2-2k' || model === 'nano-banana-2-4k';
  const NANO_BANANA_2_COST_PER_IMAGE = 30;

  // 积分不足时如果曾选中 Pro，自动回退到基础模型，避免卡住
  useEffect(() => {
    if (isProModel && quota < PRO_COST_PER_IMAGE) {
      setModel('gpt-image-2');
    }
  }, [isProModel, quota]);

  // MJ 积分不足最低档（relax=2）时回退
  useEffect(() => {
    const minMj = Math.min(...Object.values(MJ_COST_BY_MODE));
    if (isMjModel && quota < minMj) {
      setModel('gpt-image-2');
    }
  }, [isMjModel, quota]);
  
  const [retouchMode, setRetouchMode] = useState('general');
  const [strength, setStrength] = useState('medium');
  const [suggestion, setSuggestion] = useState('');
  const [productStyle, setProductStyle] = useState('Luxurious');

  // 批量生成数量 (1 - 50)
  const [count, setCount] = useState(1);
  const MAX_COUNT = 50;
  const PRO_MAX_COUNT = 10; // Pro 模型原生 n 上限
  const MJ_MAX_COUNT = 5;   // MJ 一次出 4 张，count 代表批次数，限制 5（最多 20 张）
  const NANO_BANANA_2_MAX_COUNT = 10; // 一次性最多 10 张（按 n 计费）
  const effectiveMax = model === 'gpt-image-2-pro' ? PRO_MAX_COUNT
                     : model === 'midjourney' ? MJ_MAX_COUNT
                     : isNanoBanana2 ? NANO_BANANA_2_MAX_COUNT
                     : MAX_COUNT;
  const clampCount = (n) => Math.max(1, Math.min(effectiveMax, Math.floor(Number(n) || 1)));
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  // 切到 Pro 时如果当前 count 超过 10，自动夹到 10；MJ 类似；Nano Banana 2 也限 10
  useEffect(() => {
    if (model === 'gpt-image-2-pro' && Number(count) > PRO_MAX_COUNT) {
      setCount(PRO_MAX_COUNT);
    } else if (model === 'midjourney' && Number(count) > MJ_MAX_COUNT) {
      setCount(MJ_MAX_COUNT);
    } else if (isNanoBanana2 && Number(count) > NANO_BANANA_2_MAX_COUNT) {
      setCount(NANO_BANANA_2_MAX_COUNT);
    }
  }, [model, count]);

  const [history, setHistory] = useState([]);
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const activeHistoryIdRef = useRef(activeHistoryId);
  activeHistoryIdRef.current = activeHistoryId; // 保持最新值，避免闭包问题
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);

  const [showModelMenu, setShowModelMenu] = useState(false);
  const activeTask = history.find(h => h.id === activeHistoryId);

  // 删除二次确认：存待删除的任务项；null 时隐藏弹窗
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 挂载时清理僵尸任务：页面重载后，仍停留在 pending/running 且超过 3 分钟的本地任务
  // 大概率是上次会话被用户关闭前已在服务端完成的任务，直接从任务管理器里删掉
  useEffect(() => {
    const STALE_MS = 3 * 60 * 1000;
    const now = Date.now();
    const stale = taskManager.getTasksByType('quick-create').filter(t => {
      if (t.status !== TASK_STATUS.PENDING && t.status !== TASK_STATUS.RUNNING) return false;
      return now - t.startTime > STALE_MS;
    });
    stale.forEach(t => taskManager.removeTask(t.id));
    // 只在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 模拟进度动画：running/pending 任务按 ease-out 曲线逼近 99%（各任务独立的 expectedMs 50~60s），
  // 真实 API 返回 (completeTask) 时直接跳到 100%
  // 注意：progress 直接对齐按 startedAt 计算出的 target，而不是每 tick +1 逐步爬升，
  // 否则页面切换导致组件重挂载时，本地 progress 被重置为 0，会出现"进度从 0 重新爬"的观感
  useEffect(() => {
    const interval = setInterval(() => {
      setHistory(prev => {
        if (!prev.some(h => h.status === 'pending' || h.status === 'running')) return prev;
        let changed = false;
        const next = prev.map(h => {
          if (h.status !== 'pending' && h.status !== 'running') return h;
          const started = h.startedAt || (h.timestamp ? h.timestamp * 1000 : Date.now());
          const elapsed = Math.max(0, Date.now() - started);
          const expected = h.expectedMs || 45000;
          const t = Math.min(elapsed / expected, 1);
          // ease-out: 前期快后期慢，上限 99
          const target = Math.min(99, Math.round(100 * (1 - Math.pow(1 - t, 1.8))));
          const cur = h.progress || 0;
          if (target > cur) {
            changed = true;
            return { ...h, progress: target };
          }
          return h;
        });
        return changed ? next : prev;
      });
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // 对齐 BasicCreateStudio：按 aspectRatio + resLevel 计算合法 size（auto 则由后端处理）
  const currentDimensions = calculateSize(aspectRatio, resLevel);
  const dispW = currentDimensions.w || 1024;
  const dispH = currentDimensions.h || 1024;

  useEffect(() => {
    if (!token || token === 'null') return;
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          // 只把服务端确认完成的记录当作 done；ON_QUEUE 不展示（由本地 running 任务驱动）
          // FAILED 的条目需要保留做对账，把本地占位任务同步为 error
          const filtered = data
            .filter(item => ['product', 'retouch', 'portrait', 'create'].includes(item.type || 'create'))
            .filter(item => {
              const st = item.status;
              if (!st) return !!item.image;
              return st === 'SUCCESS' || st === 'DONE';
            })
            .map(item => ({ ...item, status: 'done', progress: 100 }));

          // 服务端显式标 FAILED 的条目（仅用于对账，不进入展示列表）
          const failedRecords = data.filter(item => item.status === 'FAILED');

          // 进行中任务（源自任务管理器，带 batchId / startedAt）
          const running = taskManager.getTasksByType('quick-create').map(t => ({
            id: t.id, image: t.result || '', prompt: t.prompt,
            status: t.status === TASK_STATUS.PENDING ? 'pending'
                  : t.status === TASK_STATUS.SUCCESS ? 'done'
                  : t.status === TASK_STATUS.ERROR ? 'error'
                  : 'running',
            progress: t.progress || 0,
            type: t.metadata?.mode, timestamp: t.startTime / 1000,
            startedAt: t.startTime,
            batchId: t.metadata?.batchId, batchIndex: t.metadata?.batchIndex, batchTotal: t.metadata?.batchTotal,
            error: t.error,
            result: t.result,
            serverTaskId: t.metadata?.serverTaskId,
            serverBatchId: t.metadata?.serverBatchId
          }));

          // batch 对账：同一 serverBatchId 下，服务端若返 N 张，按 batch_index 对齐到占位任务
          // 命中的占位任务转为 done 并填入图片；被消费掉的 filtered 条目不再单独展示
          const consumedFilteredIds = new Set();
          running.forEach(r => {
            if (!r.serverBatchId) return;
            if (r.status !== 'pending' && r.status !== 'running') return;
            const matched = filtered.find(f =>
              f.batch_id === r.serverBatchId &&
              f.batch_index === r.batchIndex &&
              !consumedFilteredIds.has(f.id)
            );
            if (matched) {
              consumedFilteredIds.add(matched.id);
              // 同步任务管理器与本地视图
              taskManager.completeTask(r.id, matched.image);
              r.status = 'done';
              r.progress = 100;
              r.image = matched.image;
              // 保留服务端记录 id 以便 handleDeleteImage 调 DELETE
              r.serverRecordId = matched.id;
            }
          });

          // FAILED 对账：同 batch_id 的占位任务全部标为 error
          failedRecords.forEach(fr => {
            if (!fr.batch_id) return;
            running.forEach(r => {
              if (r.serverBatchId === fr.batch_id && (r.status === 'pending' || r.status === 'running')) {
                taskManager.failTask(r.id, '生成失败，请重试');
                r.status = 'error';
                r.error = '生成失败，请重试';
              }
            });
          });

          // 去重：如果服务端记录 id 等于我们已有的 serverTaskId，则过滤掉，保留本地 task 展示
          const localServerIds = new Set(running.map(r => r.serverTaskId).filter(Boolean));
          const filteredDedup = filtered.filter(f =>
            !localServerIds.has(f.id) && !consumedFilteredIds.has(f.id)
          );

          // 兜底和解：本地 running 任务若超过 2 分钟且至少有一条服务端 record 的时间戳落在它启动后的窗口内且类型匹配，
          // 认为它实际已完成，从任务管理器中移除（避免僵尸转圈）
          const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000;
          const nowMs = Date.now();
          running.forEach(r => {
            if (r.status !== 'pending' && r.status !== 'running') return;
            const age = nowMs - (r.startedAt || nowMs);
            if (age < RECONCILE_MIN_AGE_MS) return;

            // batch 专属：已拿到 serverBatchId 说明后端已开始处理；若同 batch 所有返图已被其他占位任务对齐消费，
            // 而当前占位任务仍然没 match，说明服务端这一张确实失败（n 部分成功场景）
            if (r.serverBatchId && age > 3 * 60 * 1000) {
              const batchReturned = filtered.filter(f => f.batch_id === r.serverBatchId).length;
              const batchPlaceholders = running.filter(x => x.serverBatchId === r.serverBatchId).length;
              if (batchReturned > 0 && batchReturned < batchPlaceholders) {
                // 有其他占位任务成功了，但这个没对齐到 → 确认失败
                taskManager.failTask(r.id, '此张未生成成功');
                r.status = 'error';
                r.error = '此张未生成成功';
                return;
              }
            }

            const match = filtered.find(f => {
              if (r.type && f.type !== r.type && !(r.type === 'image' && f.type === 'create')) return false;
              const dt = (f.timestamp || 0) * 1000 - (r.startedAt || 0);
              return dt >= -5000 && dt <= age + 5000;
            });
            if (match) {
              taskManager.removeTask(r.id);
            } else if (age > 10 * 60 * 1000) {
              // 超过 10 分钟仍无匹配，视为异常
              taskManager.failTask(r.id, '任务超时');
            }
          });

          // 保留本地已有的进度/状态，不被 running 重建覆盖
          setHistory(prev => {
            const prevById = new Map(prev.map(h => [h.id, h]));
            const runningMerged = running.map(r => {
              const old = prevById.get(r.id);
              if (!old) return r;
              return {
                ...r,
                // 对账命中后 r.status=done / r.image 有值：优先使用 r 的值
                status: r.status,
                progress: r.status === 'done' ? 100 : Math.max(old.progress || 0, r.progress || 0),
                image: r.image || old.image,
                startedAt: old.startedAt || r.startedAt,
                serverTaskId: r.serverTaskId || old.serverTaskId,
                serverBatchId: r.serverBatchId || old.serverBatchId,
                serverRecordId: r.serverRecordId || old.serverRecordId,
                expectedMs: old.expectedMs // 保留本地首次计算的期望时长
              };
            });

            const ids = new Set([...runningMerged.map(r => r.id), ...filteredDedup.map(f => f.id)]);
            const combined = [...runningMerged, ...filteredDedup]
              .reduce((acc, cur) => {
                if (!acc.find(x => x.id === cur.id)) acc.push(cur);
                return acc;
              }, [])
              .sort((a, b) => b.timestamp - a.timestamp);

            if (combined.length > 0 && !activeHistoryIdRef.current) {
              setActiveHistoryId(combined[0].id);
            } else if (activeHistoryIdRef.current && !ids.has(activeHistoryIdRef.current)) {
              setActiveHistoryId(combined[0]?.id || null);
            }
            return combined;
          });
        }
      } catch (err) { console.error(err); }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, [token, taskManager]);

  const handleFileUpload = async (e) => {
    if (!isLoggedIn) { setShowLogin(true); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setReferImages(prev => mode === 'retouch' || mode === 'portrait' ? [data.url] : [...prev, data.url].slice(-4));
    } catch (err) { showToast('上传失败', 'error'); }
    finally { setIsUploading(false); e.target.value = ''; }
  };

  const handleGenerate = async () => {
    if (!isLoggedIn) { setShowLogin(true); return; }
    if (isBatchRunning) { showToast('正在批量生成中，请稍候', 'error'); return; }

    const total = clampCount(count);
    // 按模型算总积分：
    // - Pro: 2/张；n 张
    // - MJ:  按 mode 2/3/5 积分每"次"（每次出 4 张），共 total 次
    // - Nano Banana 2: 30/张，n 张（不分 1K/2K/4K）
    // - 其他: 4K=2/张，否则 1/张
    if (mode === 'image' && model === 'gpt-image-2-pro') {
      const totalCost = total * PRO_COST_PER_IMAGE;
      if (quota < totalCost) {
        showToast(`积分不足，需要 ${totalCost} 积分，当前 ${quota}`, 'error');
        return;
      }
    } else if (mode === 'image' && model === 'midjourney') {
      const totalCost = total * mjCostPerTask;
      if (quota < totalCost) {
        showToast(`积分不足，需要 ${totalCost} 积分，当前 ${quota}`, 'error');
        return;
      }
    } else if (mode === 'image' && isNanoBanana2) {
      const totalCost = total * NANO_BANANA_2_COST_PER_IMAGE;
      if (quota < totalCost) {
        showToast(`积分不足，需要 ${totalCost} 积分，当前 ${quota}`, 'error');
        return;
      }
    } else {
      // gpt-image-2 = 7 / gpt-image-2-high = 13（与分辨率无关，分辨率只影响可用尺寸）
      // retouch/portrait/product 等后端都走 gpt-image-2，按 7 算
      const pointsPerImage = mode === 'image' && model === 'gpt-image-2-high' ? 13 : 7;
      const totalCost = total * pointsPerImage;
      if (quota < totalCost) { showToast(`积分不足，需要 ${totalCost} 积分，当前 ${quota}`, 'error'); return; }
    }

    if ((mode === 'retouch' || mode === 'portrait' || mode === 'product') && referImages.length === 0) {
      showToast('请先上传参考图片', 'error'); return;
    }
    if (mode === 'image' && !prompt.trim()) {
      showToast('请输入提示词', 'error'); return;
    }

    // 捕获当前参数快照，避免批量过程中用户修改状态导致串台
    // Nano Banana 2：按用户选择的分辨率映射到具体的 model id（同家族三档）
    let effectiveModel = model;
    if (mode === 'image' && isNanoBanana2) {
      if (resLevel === '4K') effectiveModel = 'nano-banana-2-4k';
      else if (resLevel === '2K') effectiveModel = 'nano-banana-2-2k';
      else effectiveModel = 'nano-banana-2';
    }
    const snapshot = {
      mode, referImages: [...referImages], model: effectiveModel, aspectRatio, resLevel, quality,
      retouchMode: mode === 'portrait' ? 'portrait' : retouchMode,
      strength, suggestion, productStyle, prompt, mjMode, mjVersion
    };

    // 生成一个批次 ID，方便后续按 batchId 筛选（但 UI 不再做批量聚合视图，只是单张切换）
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // ---------- Midjourney 专属分支 ----------
    // MJ 一次调用产出 4 张，total 表示"批次数"。前端为每个批次创建 4 个占位任务，
    // 共享一个 serverBatchId，让 fetchHistory 按 batch_index 0..3 对齐返图。
    if (mode === 'image' && snapshot.model === 'midjourney') {
      const baseTs = Date.now();
      const allTaskIds = [];
      const batchTaskMap = []; // [{localBatchId, taskIds[4]}]
      for (let b = 0; b < total; b++) {
        const localBatchId = `batch_${Date.now()}_${b}_${Math.random().toString(36).slice(2, 6)}`;
        const group = [];
        for (let sub = 0; sub < MJ_IMAGES_PER_TASK; sub++) {
          const taskId = taskManager.createTask('quick-create', prompt, {
            ...snapshot, batchId: localBatchId, batchIndex: sub, batchTotal: MJ_IMAGES_PER_TASK
          });
          group.push(taskId);
          allTaskIds.push(taskId);
          const expectedMs = 120000 + Math.floor(Math.random() * 30000); // MJ 慢，期望 2-2.5 分钟
          const newItem = {
            id: taskId, image: '', prompt, status: 'pending', progress: 0,
            type: mode, timestamp: (baseTs + b * 10 + sub) / 1000,
            startedAt: baseTs,
            batchId: localBatchId, batchIndex: sub, batchTotal: MJ_IMAGES_PER_TASK,
            expectedMs
          };
          setHistory(prev => [newItem, ...prev]);
        }
        batchTaskMap.push({ localBatchId, taskIds: group });
      }
      setActiveHistoryId(allTaskIds[0]);
      if (total > 1) {
        setIsBatchRunning(true);
        showToast(`已提交 ${total} 次 · 共 ${total * MJ_IMAGES_PER_TASK} 张`);
      }

      // 串行发起 N 次 MJ 请求（MJ 账号并发度有限，不并发）
      (async () => {
        for (const { taskIds: group } of batchTaskMap) {
          await executeMjBatch(group, snapshot);
        }
        if (total > 1) {
          setIsBatchRunning(false);
          showToast(`批量生成完成（${total} 次 · ${total * MJ_IMAGES_PER_TASK} 张）`);
        }
      })();
      return;
    }

    // 先把所有任务入队（pending 态），然后并发下发
    const taskIds = [];
    const baseTs = Date.now();
    for (let i = 0; i < total; i++) {
      const taskId = taskManager.createTask('quick-create', prompt, { ...snapshot, batchId, batchIndex: i, batchTotal: total });
      taskIds.push(taskId);
      // 每张的期望时长 50~60s 随机，制造更真实的分阶段完成感
      const expectedMs = 50000 + Math.floor(Math.random() * 10000);
      const newItem = {
        id: taskId, image: '', prompt, status: 'pending', progress: 0,
        type: mode, timestamp: (baseTs + i) / 1000,  // 越靠后的索引时间戳越大（排在前面）
        startedAt: baseTs,
        batchId, batchIndex: i, batchTotal: total,
        expectedMs
      };
      setHistory(prev => [newItem, ...prev]);
    }
    // 默认选中第一张（批次中的第 1/N），用户可点击缩略图切换
    setActiveHistoryId(taskIds[0]);

    // image 模式：一次 /api/create 请求带 n=total，服务端返回 N 张，由本地按 batchIndex 分发
    if (mode === 'image') {
      if (total > 1) {
        setIsBatchRunning(true);
        showToast(`已提交 ${total} 张`);
      }
      executeBatchCreate(taskIds, snapshot, total).finally(() => {
        if (total > 1) {
          setIsBatchRunning(false);
          showToast(`批量生成完成（${total} 张）`);
        }
      });
      return;
    }

    if (total === 1) {
      executeTask(taskIds[0], snapshot);
      return;
    }

    // 其他模式（retouch/portrait/product）服务端接口不支持 n 参数，仍走前端并发下发，
    // 每张一次请求；这些接口同步返回图片，等待时间较短，影响有限
    setIsBatchRunning(true);
    showToast(`已提交 ${total} 个任务`);

    const CONCURRENCY = 3;
    let cursor = 0;
    const worker = async () => {
      while (cursor < taskIds.length) {
        const i = cursor++;
        try {
          await executeTask(taskIds[i], snapshot);
        } catch (e) {
          console.error('batch task error', e);
        }
      }
    };
    const workers = Array.from({ length: Math.min(CONCURRENCY, taskIds.length) }, () => worker());
    Promise.all(workers).then(() => {
      setIsBatchRunning(false);
      showToast(`批量生成完成（${total} 张）`);
    });
  };

  // MJ 批次：一次 /api/create/mj 调用对应 4 个占位任务，同步 serverBatchId 让 fetchHistory 对齐
  const executeMjBatch = async (taskIds, snapshot) => {
    const runStartedAt = Date.now();
    taskIds.forEach(tid => taskManager.updateTask(tid, { status: TASK_STATUS.RUNNING }));
    setHistory(prev => prev.map(h => taskIds.includes(h.id)
      ? { ...h, status: 'running', startedAt: runStartedAt, progress: 0 } : h
    ));

    try {
      const formData = new FormData();
      formData.append('prompt', snapshot.prompt || '');
      formData.append('image_urls_json', JSON.stringify(snapshot.referImages || []));
      formData.append('aspect_ratio', snapshot.aspectRatio || 'auto');
      formData.append('mj_mode', snapshot.mjMode || 'fast');
      formData.append('mj_version', snapshot.mjVersion || 'v8.1');

      const res = await fetch(`${API_BASE_URL}/api/create/mj`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
        keepalive: true
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || '生成失败');

      if (data.data?.remaining_quota !== undefined) {
        setQuota(data.data.remaining_quota);
        localStorage.setItem('quota', data.data.remaining_quota.toString());
        window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: data.data.remaining_quota } }));
      }

      const serverTaskId = data.data?.taskId;
      const serverBatchId = data.data?.batchId;
      if (!serverTaskId) throw new Error('生成失败');

      setHistory(prev => prev.map(h => taskIds.includes(h.id)
        ? { ...h, serverTaskId, serverBatchId } : h
      ));
      taskIds.forEach(tid => {
        taskManager.updateTask(tid, {
          metadata: {
            ...(taskManager.tasks.find(t => t.id === tid)?.metadata || {}),
            serverTaskId, serverBatchId
          }
        });
      });
    } catch (err) {
      taskIds.forEach(tid => taskManager.failTask(tid, err.message));
      setHistory(prev => prev.map(h => taskIds.includes(h.id)
        ? { ...h, status: 'error', error: err.message } : h
      ));
      showToast(err.message || '生成失败', 'error');
    }
  };

  // image 模式：单次请求 n=total，服务端把同 batch 的 N 张以 batch_index 展开写入 history，
  // 本地占位任务按 batch_index 对齐；轮询命中就把图片填入各自占位条目
  const executeBatchCreate = async (taskIds, snapshot, total) => {
    const runStartedAt = Date.now();
    taskIds.forEach(tid => {
      taskManager.updateTask(tid, { status: TASK_STATUS.RUNNING });
    });
    setHistory(prev => prev.map(h => taskIds.includes(h.id)
      ? { ...h, status: 'running', startedAt: runStartedAt, progress: 0 }
      : h
    ));

    // Pro 模型：走独立路由 /api/create/pro（TTAPI 异步通道 gpt-image-2-plus），固定 2 积分/张
    // 服务端立即返回 taskId/batchId，真实生成在后台跑；前端由 fetchHistory 按 batchId/batchIndex 对齐返图
    if (snapshot.model === 'gpt-image-2-pro') {
      try {
        const formData = new FormData();
        formData.append('prompt', snapshot.prompt);
        formData.append('image_urls_json', JSON.stringify(snapshot.referImages));
        // size 复用通用比例 + 分辨率（gpt-image-2-plus 支持任意 WxH，宽高可被 16 整除，比例 1:3~3:1）
        formData.append('size', calculateSize(snapshot.aspectRatio, snapshot.resLevel).str);
        formData.append('n', String(Math.min(10, total)));

        const res = await fetch(`${API_BASE_URL}/api/create/pro`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
          keepalive: true
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.detail || '生成失败';
          throw new Error(msg);
        }

        if (data.data?.remaining_quota !== undefined) {
          setQuota(data.data.remaining_quota);
          localStorage.setItem('quota', data.data.remaining_quota.toString());
          window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: data.data.remaining_quota } }));
        }

        const serverTaskId = data.data?.taskId;
        const serverBatchId = data.data?.batchId;
        if (!serverTaskId) throw new Error(data.message || '生成失败');

        // 记录 serverTaskId/serverBatchId 到所有占位任务，供 fetchHistory 对账用
        setHistory(prev => prev.map(h => taskIds.includes(h.id)
          ? { ...h, serverTaskId, serverBatchId }
          : h
        ));
        taskIds.forEach(tid => {
          taskManager.updateTask(tid, {
            metadata: {
              ...(taskManager.tasks.find(t => t.id === tid)?.metadata || {}),
              serverTaskId,
              serverBatchId
            }
          });
        });
        // 真实 image 由 fetchHistory 轮询命中后填入各占位 task（按 batch_index 对齐）
      } catch (err) {
        taskIds.forEach(tid => taskManager.failTask(tid, err.message));
        setHistory(prev => prev.map(h => taskIds.includes(h.id)
          ? { ...h, status: 'error', error: err.message }
          : h
        ));
        showToast(err.message || '生成失败', 'error');
      }
      return;
    }

    try {
      const formData = new FormData();
      formData.append('prompt', snapshot.prompt);
      formData.append('image_urls_json', JSON.stringify(snapshot.referImages));
      formData.append('model', snapshot.model);
      formData.append('aspect_ratio', snapshot.aspectRatio);
      formData.append('quality', snapshot.quality);
      // 用 calculateSize 基于 aspectRatio + resLevel 算出合法 size；auto 比例下传 'auto'
      formData.append('size', calculateSize(snapshot.aspectRatio, snapshot.resLevel).str);
      formData.append('n', String(total));

      const res = await fetch(`${API_BASE_URL}/api/create`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
        keepalive: true
      });

      if (!res.ok) throw new Error('API failed');
      const data = await res.json();

      if (data.data?.remaining_quota !== undefined) {
        setQuota(data.data.remaining_quota);
        localStorage.setItem('quota', data.data.remaining_quota.toString());
        window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: data.data.remaining_quota } }));
      }

      const serverTaskId = data.data?.taskId;
      const serverBatchId = data.data?.batchId;
      if (!serverTaskId) throw new Error(data.message || '生成失败');

      // 记录 serverTaskId/serverBatchId 到所有占位任务，供 fetchHistory 对账用
      setHistory(prev => prev.map(h => taskIds.includes(h.id)
        ? { ...h, serverTaskId, serverBatchId }
        : h
      ));
      taskIds.forEach(tid => {
        taskManager.updateTask(tid, {
          metadata: {
            ...(taskManager.tasks.find(t => t.id === tid)?.metadata || {}),
            serverTaskId,
            serverBatchId
          }
        });
      });
      // 实际 image 由 fetchHistory 轮询命中后填入各占位 task（按 batch_index 对齐）
    } catch (err) {
      // 整批失败：全部占位任务标记 error
      taskIds.forEach(tid => taskManager.failTask(tid, err.message));
      setHistory(prev => prev.map(h => taskIds.includes(h.id)
        ? { ...h, status: 'error', error: err.message }
        : h
      ));
    }
  };

  const executeTask = async (taskId, snapshot) => {
    // snapshot 为批量任务快照；未传入时使用当前状态（重试按钮）
    const s = snapshot || {
      mode, referImages, model, aspectRatio, resLevel, quality,
      retouchMode: mode === 'portrait' ? 'portrait' : retouchMode,
      strength, suggestion, productStyle, prompt
    };
    const runStartedAt = Date.now();
    taskManager.updateTask(taskId, { status: TASK_STATUS.RUNNING });
    setHistory(prev => prev.map(h => h.id === taskId ? { ...h, status: 'running', startedAt: runStartedAt, progress: 0 } : h));
    try {
      let endpoint = '/api/create';
      const formData = new FormData();

      if (s.mode === 'retouch' || s.mode === 'portrait') {
        endpoint = '/api/retouch';
        formData.append('image_url', s.referImages[0]);
        formData.append('mode', s.mode === 'portrait' ? 'portrait' : s.retouchMode);
        formData.append('strength', s.strength);
        formData.append('suggestion', s.suggestion);
      } else if (s.mode === 'product') {
        endpoint = '/api/generate';
        formData.append('image_urls_json', JSON.stringify(s.referImages));
        formData.append('prompt', s.prompt);
        formData.append('style', s.productStyle);
      } else {
        formData.append('prompt', s.prompt);
        formData.append('image_urls_json', JSON.stringify(s.referImages));
        formData.append('model', s.model);
        formData.append('aspect_ratio', s.aspectRatio);
        formData.append('quality', s.quality);
        formData.append('size', calculateSize(s.aspectRatio, s.resLevel).str);
      }

      // keepalive 让请求在用户关闭标签页后依然能送达服务端；用户侧主动断开不会触发退分
      // 注意：keepalive 请求体大小上限约 64KB，当前 formData 字段均为短文本/URL，不超限
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
        keepalive: true
      });

      if (!res.ok) throw new Error('API failed');
      const data = await res.json();

      // 同步积分（预扣分已在服务端完成）
      if (data.data?.remaining_quota !== undefined) {
        setQuota(data.data.remaining_quota);
        localStorage.setItem('quota', data.data.remaining_quota.toString());
        window.dispatchEvent(new CustomEvent('quota-updated', { detail: { quota: data.data.remaining_quota } }));
      }

      // /api/retouch, /api/generate, /api/portrait 直接同步返回图片
      const immediateImage = data.data?.image_url || data.image;
      if (immediateImage) {
        taskManager.completeTask(taskId, immediateImage);
        setHistory(prev => prev.map(h => h.id === taskId ? { ...h, image: immediateImage, status: 'done', progress: 100 } : h));
        return;
      }

      // /api/create 返回服务端 taskId，需要轮询最终状态
      const serverTaskId = data.data?.taskId;
      if (!serverTaskId) {
        throw new Error(data.message || '生成失败');
      }

      // 保存 serverTaskId 到 history 与任务管理器元数据，方便 fetchHistory 去重
      setHistory(prev => prev.map(h => h.id === taskId ? { ...h, serverTaskId } : h));
      taskManager.updateTask(taskId, {
        metadata: { ...(taskManager.tasks.find(t => t.id === taskId)?.metadata || {}), serverTaskId }
      });

      // 轮询 /api/create/status/{serverTaskId}，最多 15 分钟
      const MAX_POLL = 15 * 60 * 1000;
      const pollStart = Date.now();
      while (Date.now() - pollStart < MAX_POLL) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const statusRes = await fetch(`${API_BASE_URL}/api/create/status/${serverTaskId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!statusRes.ok) continue;
          const st = await statusRes.json();
          if (st.status === 'SUCCESS') {
            const imgUrl = st.image_url || (st.image_urls && st.image_urls[0]);
            taskManager.completeTask(taskId, imgUrl);
            setHistory(prev => prev.map(h => h.id === taskId ? { ...h, image: imgUrl, status: 'done', progress: 100 } : h));
            return;
          }
          if (st.status === 'FAILED') {
            throw new Error('生成失败，请重试');
          }
          // ON_QUEUE → 继续等
        } catch (pe) {
          if (pe.message && pe.message.includes('失败')) throw pe;
          // 网络抖动，忽略
        }
      }
      throw new Error('生成超时，请稍后在历史记录中查看');
    } catch (err) {
      taskManager.failTask(taskId, err.message);
      setHistory(prev => prev.map(h => h.id === taskId ? { ...h, status: 'error', error: err.message } : h));
    }
  };

  const handleDownload = async (url) => {
    if (!url) return;
    const secureUrl = toSecureUrl(url);
    try {
      const res = await fetch(secureUrl);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `OG_AI_${Date.now()}.png`;
      a.click();
      showToast('开始下载');
    } catch (e) {
      window.open(secureUrl, '_blank');
    }
  };

  // 删除当前图片：成功态调后端删除 + 本地清理；失败/进行中态仅本地清理
  const handleDeleteImage = async (item) => {
    if (!item || isDeleting) return;
    setIsDeleting(true);

    // 先在本地同步移除（无论成功/失败）
    const removeLocal = () => {
      taskManager.removeTask(item.id);
      setHistory(prev => {
        const next = prev.filter(h => h.id !== item.id);
        if (activeHistoryIdRef.current === item.id) {
          setActiveHistoryId(next[0]?.id || null);
        }
        return next;
      });
    };

    try {
      if (item.status === 'done') {
        // 成功任务：服务端有持久化记录，需要同时删除
        // batch 对账写入的条目用 serverRecordId；单任务/非 batch 用 serverTaskId；服务端返回条目用 item.id
        const remoteId = item.serverRecordId || item.serverTaskId || item.id;
        const res = await fetch(`${API_BASE_URL}/api/history/${remoteId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('delete failed');
      }
      removeLocal();
      showToast('已删除');
      setDeleteConfirmItem(null);
    } catch (e) {
      showToast('删除失败', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full h-full bg-[#050505] text-white font-sans flex flex-col overflow-hidden selection:bg-white/20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onLogin={() => window.location.reload()} t={t} />

      <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* 配置面板 */}
        <div className="w-full md:w-[320px] bg-[#0a0a0a] border-r border-white/5 flex flex-col overflow-y-auto scrollbar-hide z-10">
          <div className="p-5 space-y-6 flex-1">
            {/* 动态参数面板 */}
            <div className="space-y-8">
              {(mode === 'image' || mode === 'product') && (
                <div className="space-y-4">
                  <SectionLabel icon={<Edit3 size={14} />}>提示词</SectionLabel>
                  <div className="relative group">
                    <textarea
                      value={prompt}
                      onChange={e => setPrompt(e.target.value)}
                      placeholder="例如：一个极简风格的玻璃瓶在阳光下，背后的森林隐约可见..."
                      className="w-full h-36 bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-sm text-white/80 placeholder:text-white/10 focus:outline-none focus:border-transparent focus:ring-0 focus:ring-offset-0 focus:shadow-none transition-none resize-none leading-relaxed"
                    />
                    <div className="absolute bottom-3 right-3 text-[10px] text-white/10 font-mono">{prompt.length}</div>
                  </div>
                </div>
              )}

              {/* 图片上传区域 */}
              <div className="space-y-3">
                <SectionLabel icon={<UploadCloud size={14} />}>参考图</SectionLabel>
                <div className="grid grid-cols-4 gap-2">
                  {referImages.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group animate-in zoom-in-50 duration-300">
                      <img src={toSecureUrl(url)} className="w-full h-full object-cover" alt="ref" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button onClick={() => setReferImages(prev => prev.filter((_, idx) => idx !== i))} className="p-1.5 bg-red-500 rounded-lg shadow-lg"><X size={12} /></button>
                      </div>
                    </div>
                  ))}
                  {(mode === 'image' || mode === 'product' || referImages.length === 0) && (
                    <label className="aspect-square rounded-xl border-2 border-dashed border-white/5 hover:border-white/20 hover:bg-white/5 flex flex-col items-center justify-center cursor-pointer transition-all group">
                      {isUploading ? <Loader2 size={20} className="animate-spin text-white/20" /> : <Plus size={20} className="text-white/10 group-hover:text-white/40 transition-colors" />}
                      <input type="file" className="hidden" onChange={handleFileUpload} />
                    </label>
                  )}
                </div>
              </div>

              {mode === 'image' && (
                <div className="space-y-5">
                  {/* 模型选择自定义下拉框 */}
                  <div className="space-y-2.5">
                    <SectionLabel icon={<Cpu size={14} />}>选择模型</SectionLabel>
                    <div className="relative group">
                      <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white/80 flex items-center justify-between cursor-pointer hover:bg-white/[0.05] transition-all" onClick={() => setShowModelMenu(!showModelMenu)}>
                        <div className="flex items-center gap-2">
                          {model === 'midjourney' ? (
                            <img src={MidjourneyIcon} className="w-4 h-4" alt="midjourney" />
                          ) : isNanoBanana2 ? (
                            <span className="text-base leading-none">🍌</span>
                          ) : (
                            <img src={ChatGptIcon} className="w-4 h-4" alt="gpt" />
                          )}
                          <span>
                            {model === 'gpt-image-2' ? 'GPT Image 2'
                              : model === 'gpt-image-2-high' ? 'GPT Image 2 High'
                              : model === 'gpt-image-2-pro' ? 'GPT Image 2 Pro'
                              : isNanoBanana2 ? `Nano Banana 2 ${resLevel}`
                              : model === 'midjourney' ? `Midjourney ${(MJ_VERSIONS.find(v => v.id === mjVersion) || {}).label || ''}`.trim()
                              : model}
                          </span>
                        </div>
                        <ChevronDown size={14} className={`opacity-20 transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
                      </div>
                      
                      {showModelMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowModelMenu(false)}></div>
                          <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                            {[
                                { id: 'gpt-image-2', name: 'GPT Image 2' },
                                { id: 'gpt-image-2-high', name: 'GPT Image 2 High', tag: '高分辨率' },
                                { id: 'gpt-image-2-pro', name: 'GPT Image 2 Pro', tag: '快速', badge: 'Pro', minQuota: PRO_COST_PER_IMAGE },
                                { id: 'nano-banana-2', name: 'Nano Banana 2', badge: 'NEW', minQuota: NANO_BANANA_2_COST_PER_IMAGE, desc: '1K/2K/4K · 30 积分/张' },
                                { id: 'midjourney', name: 'Midjourney', badge: 'MJ', minQuota: Math.min(...Object.values(MJ_COST_BY_MODE)) },
                            ].map(m => {
                              const disabled = m.minQuota !== undefined && quota < m.minQuota;
                              const isActive = model === m.id || (m.id === 'nano-banana-2' && isNanoBanana2);
                              return (
                                <button
                                  key={m.id}
                                  disabled={disabled}
                                  onClick={() => {
                                    if (disabled) {
                                      showToast(`积分不足 ${m.minQuota}，无法使用 ${m.name}`, 'error');
                                      return;
                                    }
                                    // 切到 Nano Banana 2 时默认 1K，用户可在下方分辨率按钮切换
                                    if (m.id === 'nano-banana-2' && !isNanoBanana2) {
                                      setResLevel('1K');
                                    }
                                    setModel(m.id);
                                    setShowModelMenu(false);
                                  }}
                                  className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${isActive ? 'bg-white/[0.03]' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5'}`}
                                >
                                  <div className="flex items-center gap-3">
                                    {m.id === 'midjourney' ? (
                                      <img src={MidjourneyIcon} className="w-5 h-5" alt="midjourney" />
                                    ) : m.id === 'nano-banana-2' ? (
                                      <span className="text-lg leading-none">🍌</span>
                                    ) : (
                                      <img src={ChatGptIcon} className="w-5 h-5" alt="gpt" />
                                    )}
                                    <div className="flex flex-col items-start gap-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <div className="text-xs font-bold text-white/80">{m.name}</div>
                                        {m.tag && (
                                          <span className={`text-[9px] font-bold px-1.5 py-[2px] rounded-md text-white shadow-sm border border-white/10 ${m.id === 'gpt-image-2-pro' ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`}>
                                            {m.tag}
                                          </span>
                                        )}
                                      </div>
                                      {disabled && (
                                        <div className="text-[10px] text-white/40">积分不足</div>
                                      )}
                                    </div>
                                  </div>
                                  {isActive && <Check size={14} className="text-orange-400" />}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 比例选择网格（所有模型共用，Pro 也能随便选） */}
                  <div className="space-y-3">
                    <SectionLabel icon={<LayoutIcon size={14} />}>选择比例</SectionLabel>
                    <div className="grid grid-cols-5 gap-1.5">
                      {RATIOS.map(r => {
                        const isAuto = r === 'auto';
                        let icon = null;
                        if (isAuto) icon = <Sparkles size={14} />;
                        else {
                          const [w, h] = r.split(':').map(Number);
                          const max = Math.max(w, h);
                          icon = <div className="border border-current rounded-[1px] opacity-60" style={{ width: (w/max)*10, height: (h/max)*10 }}></div>;
                        }
                        return (
                          <button 
                            key={r} 
                            onClick={() => setAspectRatio(r)}
                            className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg border transition-all ${aspectRatio === r ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-transparent text-white/30 hover:text-white/60'}`}
                          >
                            <div className="h-4 flex items-center justify-center">{icon}</div>
                            <span className="text-[9px] font-medium uppercase">{isAuto ? '智能' : r}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* MJ 速度模式（选中 MJ 时显示） */}
                  {isMjModel && (
                    <>
                    {/* 版本选择 */}
                    <div className="space-y-3">
                      <SectionLabel icon={<Cpu size={14} />}>版本</SectionLabel>
                      <div className="grid grid-cols-5 gap-1.5">
                        {MJ_VERSIONS.map(v => (
                          <button
                            key={v.id}
                            onClick={() => setMjVersion(v.id)}
                            className={`py-2.5 rounded-lg border transition-all flex flex-col items-center gap-0.5 ${mjVersion === v.id ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/5 text-white/40 hover:text-white/70'}`}
                          >
                            <span className="text-[11px] font-bold">{v.label}</span>
                            <span className="text-[9px] opacity-60">{v.sub}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <SectionLabel icon={<Sparkles size={14} />}>速度模式</SectionLabel>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'relax', label: 'Relax', cost: MJ_COST_BY_MODE.relax, sub: '慢速省钱' },
                          { id: 'fast', label: 'Fast', cost: MJ_COST_BY_MODE.fast, sub: '推荐' },
                          { id: 'turbo', label: 'Turbo', cost: MJ_COST_BY_MODE.turbo, sub: '极速' },
                        ].map(m => {
                          const disabled = quota < m.cost;
                          return (
                            <button
                              key={m.id}
                              disabled={disabled}
                              onClick={() => !disabled && setMjMode(m.id)}
                              className={`py-3 rounded-xl border transition-all flex flex-col items-center gap-0.5 ${mjMode === m.id ? 'bg-white/10 border-white/20 text-white' : 'bg-[#141414] border-transparent text-white/40 hover:text-white/70'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <span className="text-xs font-bold">{m.label}</span>
                              <span className="text-[9px] opacity-60">{m.sub}</span>
                              <span className="text-[10px] font-mono text-orange-300/80">{m.cost} 积分/次</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-white/40 px-1">每次生成 4 张子图</div>
                    </div>
                    </>
                  )}

                  {/* 分辨率大按钮 - gpt-image-2 仅支持 1K，该模型下隐藏；Pro 支持任意 WxH 因此可选；MJ 不支持分辨率选择 */}
                  {!lockedTo1K && !isMjModel && (
                    <div className="space-y-3">
                      <SectionLabel icon={<Maximize2 size={14} />}>选择分辨率</SectionLabel>
                      <div className="grid grid-cols-3 gap-2">
                        {['1K', '2K', '4K'].map(level => (
                          <button
                            key={level}
                            onClick={() => setResLevel(level)}
                            className={`py-3 rounded-xl border font-bold text-xs transition-all flex items-center justify-center gap-2 ${resLevel === level ? 'bg-white/10 border-white/20 text-white' : 'bg-[#141414] border-transparent text-white/30 hover:text-white/50'}`}
                          >
                            {level === '1K' ? '标清 1K' : level === '2K' ? '高清 2K' : <><span className="text-white">超清 4K</span><Sparkles size={12} className="text-[#00C4B6]" /></>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 尺寸展示（MJ 不展示） */}
                  {!isMjModel && (
                    <div className="space-y-3">
                      <SectionLabel icon={<Square size={14} />}>尺寸</SectionLabel>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between">
                           <span className="text-[10px] font-bold text-white/20">W</span>
                           <span className="text-xs font-mono text-white/40">{dispW}</span>
                        </div>
                        <Link size={12} className="text-white/10" />
                        <div className="flex-1 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between">
                           <span className="text-[10px] font-bold text-white/20">H</span>
                           <span className="text-xs font-mono text-white/40">{dispH}</span>
                        </div>
                        <span className="text-[10px] font-bold text-white/20 ml-1 uppercase">PX</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {(mode === 'retouch' || mode === 'portrait') && (
                <div className="space-y-6">
                  {mode === 'retouch' && (
                    <ParamSection 
                      label="修图算法" 
                      options={['general', 'landscape', 'product']} 
                      translations={{general: '智能通用', landscape: '风景优化', product: '产品增效'}} 
                      active={retouchMode} 
                      onChange={setRetouchMode} 
                    />
                  )}
                  <ParamSection 
                    label="重绘强度" 
                    options={['low', 'medium', 'high']} 
                    translations={{low: '细腻', medium: '平衡', high: '重塑'}} 
                    active={strength} 
                    onChange={setStrength} 
                  />
                  <div className="space-y-3">
                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest px-1">细节建议</label>
                    <input 
                      value={suggestion} 
                      onChange={e => setSuggestion(e.target.value)}
                      placeholder="如：突出光影感、让色彩更鲜艳"
                      className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-xs text-white/80 focus:outline-none focus:border-transparent focus:ring-0 focus:ring-offset-0 focus:shadow-none transition-none"
                    />
                  </div>
                </div>
              )}

              {mode === 'product' && (
                <div>
                  <ParamSection 
                    label="视觉风格" 
                    options={['Luxurious', 'Minimalist', 'Outdoor', 'Cyberpunk', 'Cinematic']} 
                    translations={{Luxurious: '奢华', Minimalist: '极简', Outdoor: '户外', Cyberpunk: '赛博', Cinematic: '电影'}} 
                    active={productStyle} 
                    onChange={setProductStyle} 
                    grid
                  />
                </div>
              )}

              {/* 生成数量（最多 50 张，前端并发下发，服务端独立完成）；MJ 下为"生成次数" */}
              <div className="space-y-3">
                <SectionLabel icon={<Hash size={14} />}>{isMjModel ? '生成次数' : '生成数量'}</SectionLabel>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCount(c => clampCount((Number(c) || 1) - 1))}
                    disabled={Number(count) <= 1 || isBatchRunning}
                    className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="减少"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={count}
                    disabled={isBatchRunning}
                    onChange={e => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      if (v === '') { setCount(''); return; }
                      setCount(clampCount(v));
                    }}
                    onBlur={e => setCount(clampCount(e.target.value))}
                    className="flex-1 h-11 bg-white/[0.03] border border-white/5 rounded-xl px-3 text-sm text-white text-center font-mono focus:outline-none focus:border-white/20 transition-all disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => setCount(c => clampCount((Number(c) || 0) + 1))}
                    disabled={Number(count) >= effectiveMax || isBatchRunning}
                    className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="增加"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 生成按钮 */}
          <div className="p-6 bg-[#0a0a0a] border-t border-white/5 sticky bottom-0">
            <button
              onClick={handleGenerate}
              disabled={isBatchRunning}
              className="w-full h-12 bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] shadow-lg shadow-orange-900/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isBatchRunning ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>排队生成中...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>开始创作</span>
                  <span className="text-white/60 text-[10px] ml-1">
                    {(() => {
                      // MJ：每次 4 张，按 mode 计费
                      if (model === 'midjourney') {
                        const per = mjCostPerTask;
                        const totalCost = count * per;
                        return count > 1
                          ? `共 ${count} 次 · ${count * MJ_IMAGES_PER_TASK} 张 · 消耗${totalCost}积分`
                          : `${MJ_IMAGES_PER_TASK} 张 · 消耗${per}积分`;
                      }
                      const per = model === 'gpt-image-2-pro'
                        ? PRO_COST_PER_IMAGE
                        : isNanoBanana2
                          ? NANO_BANANA_2_COST_PER_IMAGE
                          : model === 'gpt-image-2-high' ? 13 : 7;
                      const totalCost = count * per;
                      return count > 1
                        ? `共 ${count} 张 · 消耗${totalCost}积分`
                        : `消耗${per}积分`;
                    })()}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 中间预览区域 */}
        <div className="flex-1 bg-[#050505] p-4 flex flex-col relative min-w-0">
          <div className="flex-1 rounded-2xl bg-[#0a0a0a] border border-white/5 relative flex items-center justify-center overflow-hidden group">
             <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

             {activeTask ? (
               <div className="relative w-full h-full flex items-center justify-center p-6">
                 {activeTask.status === 'done' ? (
                   <div className="relative group/result w-full h-full flex items-center justify-center">
                     <img src={toSecureUrl(activeTask.image)} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="result" />
                     <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 rounded-full bg-[#1e1e1e]/80 backdrop-blur-md border border-white/10 opacity-0 group-hover/result:opacity-100 transition-all translate-y-2 group-hover/result:translate-y-0">
                       <button onClick={() => handleDownload(activeTask.image)} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="下载"><Download size={18} /></button>
                       <button onClick={() => setShowFullscreen(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="全屏"><Maximize2 size={18} /></button>
                       <button onClick={() => setDeleteConfirmItem(activeTask)} className="p-2 hover:bg-red-600 text-white/80 hover:text-white rounded-full transition-colors" title="删除"><Trash2 size={18} /></button>
                     </div>
                   </div>
                 ) : activeTask.status === 'error' ? (
                   <div className="flex flex-col items-center gap-3 text-red-400">
                     <AlertCircle size={36} />
                     <p className="text-sm">{activeTask.error || '生成失败，请重试'}</p>
                     <div className="flex items-center gap-2 mt-2">
                       <button onClick={() => executeTask(activeTask.id)} className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs transition-all">重试</button>
                       <button onClick={() => setDeleteConfirmItem(activeTask)} className="px-4 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white rounded-lg text-xs transition-all flex items-center gap-1"><Trash2 size={12} />删除</button>
                     </div>
                   </div>
                 ) : (
                   <div className="flex flex-col items-center gap-4">
                     <div className="relative">
                       <div className="w-20 h-20 rounded-full border-4 border-white/5 border-t-white/40 animate-spin"></div>
                       <div className="absolute inset-0 flex items-center justify-center font-mono text-lg">{Math.round(activeTask.progress || 0)}%</div>
                     </div>
                     <p className="text-white/40 text-xs">
                       {activeTask.batchTotal > 1
                         ? `第 ${(activeTask.batchIndex ?? 0) + 1}/${activeTask.batchTotal} 张 · 正在创作中...`
                         : '正在创作中...'}
                     </p>
                   </div>
                 )}
               </div>
             ) : (
               <div className="text-center flex flex-col items-center gap-4 opacity-20">
                 <Wand2 size={40} />
                 <p className="text-sm font-medium">配置参数后点击"开始创作"</p>
               </div>
             )}
          </div>
        </div>

        {/* 右侧历史面板 */}
        <div className="hidden lg:flex w-[200px] bg-[#0a0a0a] border-l border-white/5 flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-bold text-white/40">
              <History size={14} />
              <span>创作记录</span>
            </div>
            {history.some(h => h.status === 'pending' || h.status === 'running') && (
              <button
                onClick={() => {
                  // 清理所有本地仍在进行中的任务（大多数是上次会话遗留的僵尸）
                  taskManager.getTasksByType('quick-create')
                    .filter(t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
                    .forEach(t => taskManager.removeTask(t.id));
                  setHistory(prev => prev.filter(h => h.status !== 'pending' && h.status !== 'running'));
                  showToast('已清理进行中任务');
                }}
                className="p-1 text-white/30 hover:text-white/60 transition-colors"
                title="清理残留的进行中任务"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
            {history.map(h => (
              <div
                key={h.id}
                onClick={() => setActiveHistoryId(h.id)}
                className={`aspect-square rounded-xl overflow-hidden cursor-pointer border transition-all relative group/thumb bg-[#111]
                  ${activeHistoryId === h.id ? 'border-[#FF8A3D] ring-1 ring-[#FF8A3D]/30' : 'border-white/5 hover:border-white/20'}`}
              >
                {h.status === 'done' && h.image ? (
                  <img src={toSecureUrl(h.image)} className="w-full h-full object-cover opacity-80 group-hover/thumb:opacity-100 transition-opacity" alt="" />
                ) : h.status === 'error' ? (
                  <div className="w-full h-full flex items-center justify-center bg-red-900/10"><AlertCircle size={16} className="text-red-500/60" /></div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[#1a1a1a]">
                    <Loader2 size={16} className="animate-spin text-[#FF8A3D] mb-1" />
                    <span className="text-[10px] text-white/40 font-mono">{Math.round(h.progress || 0)}%</span>
                  </div>
                )}
                {/* 批次编号徽标 */}
                {h.batchTotal > 1 && (
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[9px] text-white/80 font-mono">
                    {(h.batchIndex ?? 0) + 1}/{h.batchTotal}
                  </div>
                )}
                {h.status === 'done' && <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent"><p className="text-[9px] text-white/70 truncate">{h.prompt || (h.type === 'retouch' ? '修图' : '创作')}</p></div>}
              </div>
            ))}
            {history.length === 0 && <div className="text-center text-white/15 text-[10px] mt-8">暂无记录</div>}
          </div>
        </div>
      </main>

      <FullscreenViewer
        isOpen={showFullscreen}
        image={fullscreenImage || activeTask?.image}
        onClose={() => { setShowFullscreen(false); setFullscreenImage(null); }}
      />

      {/* 删除二次确认弹窗 */}
      {deleteConfirmItem && (
        <div
          className="fixed inset-0 z-[1002] bg-black/80 flex items-center justify-center"
          onClick={() => !isDeleting && setDeleteConfirmItem(null)}
        >
          <div
            className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-4">确认删除</h3>
            <p className="text-white/60 text-sm mb-8">
              {deleteConfirmItem.status === 'done'
                ? '确定要删除这张图片吗？此操作无法撤销。'
                : '确定要删除这条记录吗？此操作无法撤销。'}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteConfirmItem(null)}
                disabled={isDeleting}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors disabled:opacity-40"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteImage(deleteConfirmItem)}
                disabled={isDeleting}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                删除
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [currentPage, setCurrentPage] = useState(getCurrentPageFromLocation);
  const [lang, setLang] = useState('zh');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);

  const toggleImmersive = () => setIsImmersive(prev => !prev);

  // 全局用户状态
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'Guest');
  const [quota, setQuota] = useState(() => {
    const saved = localStorage.getItem('quota');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [role, setRole] = useState(() => localStorage.getItem('role') || 'user');

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getCurrentPageFromLocation());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 从后端实时获取配额
  useEffect(() => {
    if (!token || token === 'null') return;

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
          if (data.role && data.role !== role) {
            setRole(data.role);
            localStorage.setItem('role', data.role);
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

  // 监听子组件的积分更新事件，立即同步到 Header
  useEffect(() => {
    const handleQuotaUpdate = (e) => {
      const newQuota = e.detail?.quota;
      if (typeof newQuota === 'number') {
        setQuota(newQuota);
        localStorage.setItem('quota', newQuota.toString());
      }
    };
    window.addEventListener('quota-updated', handleQuotaUpdate);
    return () => window.removeEventListener('quota-updated', handleQuotaUpdate);
  }, []);

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
    // role 由 fetchQuota 自动同步
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('quota');
    localStorage.removeItem('role');
    setToken(null);
    setUsername('Guest');
    setQuota(0);
    setRole('user');
    navigateToPage('home', { replace: true });
    setCurrentPage('home');
  };

  const handleNavigate = (page, options) => {
    navigateToPage(page, options);
    setCurrentPage(page);
  };

  useEffect(() => {
    const isAdminPage = currentPage === 'admin' || currentPage === 'admin-models';
    const requiresLogin = currentPage === 'api-keys' || currentPage === 'models' || isAdminPage;
    if ((requiresLogin && !token) || (isAdminPage && role !== 'admin')) {
      handleNavigate('home', { replace: true });
    }
  }, [currentPage, token, role]);

  // 渲染当前页面内容
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={handleNavigate} token={token} lang={lang} />;
      case 'gallery':
        return <GalleryPage token={token} lang={lang} onNavigate={handleNavigate} />;
      case 'create':
        return <BasicCreateStudioContent 
          lang={lang} 
          token={token} 
          onNavigate={handleNavigate} 
          isImmersive={isImmersive}
          onToggleImmersive={toggleImmersive}
        />;
      case 'admin':
        return role === 'admin' ? <AdminPanel token={token} lang={lang} /> : <HomePage onNavigate={handleNavigate} token={token} lang={lang} />;
      case 'api-keys':
        return token ? <ApiKeysPage token={token} lang={lang} /> : <HomePage onNavigate={handleNavigate} token={token} lang={lang} />;
      case 'models':
        return token ? <ModelsPlazaPage token={token} lang={lang} /> : <HomePage onNavigate={handleNavigate} token={token} lang={lang} />;
      case 'admin-models':
        return role === 'admin' ? <AdminModelsPage token={token} lang={lang} /> : <HomePage onNavigate={handleNavigate} token={token} lang={lang} />;
      case 'quick-create':
      default:
        return <QuickCreateStudio onBack={() => handleNavigate('home')} lang={lang} token={token} />;
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
        role={role}
        isImmersive={isImmersive}
      >
        {renderPage()}
      </Layout>
    </>
  );
};

const BasicCreateStudioContent = ({ lang, token, onNavigate, isImmersive, onToggleImmersive }) => (
  <BasicCreateStudio
    onBack={() => onNavigate('home')}
    lang={lang}
    setLang={() => { }}
    isImmersive={isImmersive}
    onToggleImmersive={onToggleImmersive}
  />
);

// 用 TaskProvider 包裹整个应用
const AppWithProviders = () => (
  <TaskProvider>
    <App />
  </TaskProvider>
);

export default AppWithProviders;
