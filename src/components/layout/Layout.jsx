import React, { useState, useEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import {
    Home, Camera, Wand2, User, Edit3, FolderOpen,
    ChevronLeft, ChevronRight, LogOut, Zap, Globe, Menu, X, PanelLeftClose, PanelLeft,
    MessageSquare, Send, Loader2, Film, Shield
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ==========================================
// 🎯 Sidebar Context
// ==========================================
const SidebarContext = createContext();

export const useSidebar = () => useContext(SidebarContext);

// ==========================================
// 💬 反馈弹窗组件
// ==========================================
const FeedbackModal = ({ isOpen, onClose, lang, username }) => {
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async () => {
        if (!content.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: username || 'anonymous', content })
            });
            if (res.ok) {
                setSubmitted(true);
                setTimeout(() => {
                    onClose();
                    setContent('');
                    setSubmitted(false);
                }, 1500);
            }
        } catch (err) {
            console.error('Submit feedback failed:', err);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {submitted ? (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-white">
                            {lang === 'zh' ? '感谢您的反馈！' : 'Thank you for your feedback!'}
                        </h3>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/5">
                                <MessageSquare size={20} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">
                                    {lang === 'zh' ? '意见反馈' : 'Feedback'}
                                </h3>
                                <p className="text-xs text-white/40">
                                    {lang === 'zh' ? '您的建议对我们很重要' : 'Your suggestions matter to us'}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-white/60 mb-2">
                                    {lang === 'zh' ? '反馈内容' : 'Your Feedback'}
                                </label>
                                <textarea
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                    placeholder={lang === 'zh' ? '请描述您的建议或遇到的问题...' : 'Describe your suggestion or issue...'}
                                    rows={5}
                                    className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:border-white/50 focus:outline-none transition-colors resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
                            >
                                {lang === 'zh' ? '取消' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || !content.trim()}
                                className="flex-1 py-3 rounded-xl bg-og-gradient text-white text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Send size={16} />
                                )}
                                {lang === 'zh' ? '提交' : 'Submit'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
// ==========================================
// ⚡ 积分历史弹窗组件
// ==========================================
const QuotaLogsModal = ({ isOpen, onClose, lang }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        const fetchLogs = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_BASE_URL}/api/user/quota-logs`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setLogs(data);
                }
            } catch (err) {
                console.error('Failed to fetch quota logs:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, [isOpen]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/5">
                            <Zap size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">
                                {lang === 'zh' ? '积分明细' : 'Quota History'}
                            </h3>
                            <p className="text-xs text-white/40">
                                {lang === 'zh' ? '最近的使用与充值记录' : 'Recent transaction details'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="animate-spin text-white/40" size={24} />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-10 text-white/40 text-sm">
                            {lang === 'zh' ? '暂无记录' : 'No records found'}
                        </div>
                    ) : (
                        logs.map(log => {
                            let typeBadge = null;
                            if (log.type === 'refund') {
                                typeBadge = <span className="ml-2 px-1.5 py-0.5 rounded-md bg-yellow-500/20 text-yellow-400 text-[10px] whitespace-nowrap">{lang === 'zh' ? '已退回' : 'Refunded'}</span>;
                            } else if (log.amount > 0) {
                                typeBadge = <span className="ml-2 px-1.5 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[10px] whitespace-nowrap">{lang === 'zh' ? '获得' : 'Gained'}</span>;
                            }

                            return (
                                <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div>
                                        <div className="text-sm text-white/90 font-medium flex items-center">
                                            {log.reason}
                                            {typeBadge}
                                        </div>
                                        <div className="text-xs text-white/40 mt-1">
                                            {new Date(log.timestamp * 1000).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-sm font-bold font-mono ${log.amount > 0 ? 'text-green-400' : 'text-white'}`}>
                                            {log.amount > 0 ? '+' : ''}{log.amount}
                                        </div>
                                        {log.balance_after !== undefined && (
                                            <div className="text-[10px] text-white/30 font-mono mt-1">
                                                {lang === 'zh' ? '余额:' : 'Balance:'} {log.balance_after}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

// ==========================================
// 📋 导航菜单配置
// ==========================================
const NAV_ITEMS = [
    { id: 'home', icon: Home, label: { zh: '首页', en: 'Home' } },
    { id: 'create', icon: Edit3, label: { zh: '创作', en: 'Create' }, gradient: 'from-[#10B981] to-[#059669]' },
    { id: 'product', icon: Camera, label: { zh: '商品', en: 'Product' }, gradient: 'from-[#FF8A3D] to-[#E65100]' },
    { id: 'retouch', icon: Wand2, label: { zh: '修图', en: 'Retouch' }, gradient: 'from-[#8B5CF6] to-[#6D28D9]' },
    { id: 'portrait', icon: User, label: { zh: '人像', en: 'Portrait' }, gradient: 'from-[#06B6D4] to-[#0891B2]' },
    { id: 'video', icon: Film, label: { zh: '视频', en: 'Video' }, gradient: 'from-[#EF4444] to-[#B91C1C]' },
    { id: 'gallery', icon: FolderOpen, label: { zh: '图库', en: 'Gallery' } },
];

// ==========================================
// 🎨 Sidebar 组件
// ==========================================
export const Sidebar = ({
    currentPage,
    onNavigate,
    lang,
    isExpanded,
    onToggle,
    isMobileOpen,
    onMobileClose,
    username,
    role
}) => {
    const [showFeedback, setShowFeedback] = useState(false);

    return (
        <>
            {/* 反馈弹窗 */}
            <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} lang={lang} username={username} />

            {/* 移动端遮罩 */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 md:hidden"
                    onClick={onMobileClose}
                />
            )}

            {/* 侧边栏 - 固定宽度，icon+文字纵向排列 */}
            <aside
                className={`
          fixed top-0 left-0 h-full bg-[#0a0a0a] border-r border-white/5 z-30
          flex flex-col transition-all duration-300 ease-in-out w-16
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
            >
                {/* Logo 区域 */}
                <div className="h-12 md:h-14 flex items-center justify-center border-b border-white/5">
                    <img
                        src="https://ai-shot.oss-cn-hangzhou.aliyuncs.com/logo/ailogo.png"
                        alt="Logo"
                        className="w-7 h-7 object-contain"
                    />
                </div>

                {/* 导航菜单 - 纵向icon+文字 */}
                <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentPage === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    onNavigate(item.id);
                                    onMobileClose?.();
                                }}
                                className={`
                  w-full flex flex-col items-center gap-1 py-2.5 rounded-lg transition-all relative overflow-hidden group
                  ${isActive
                                        ? 'bg-white/10 text-white font-medium shadow-sm'
                                        : 'text-white/80 hover:text-white hover:bg-white/5'
                                    }
                `}
                            >
                                {isActive && <div className="absolute left-0 top-1/4 bottom-1/4 w-[3px] rounded-r-full bg-og-gradient shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>}
                                <Icon size={18} className={`${isActive ? 'text-white drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'opacity-90 group-hover:opacity-100 group-hover:drop-shadow-[0_0_3px_rgba(255,255,255,0.3)]'}`} />
                                <span className="text-[10px] font-normal tracking-wide">
                                    {item.label[lang]}
                                </span>
                            </button>
                        );
                    })}

                    {/* 管理后台入口 - 仅admin可见 */}
                    {role === 'admin' && (
                        <button
                            onClick={() => {
                                onNavigate('admin');
                                onMobileClose?.();
                            }}
                            className={`
                                w-full flex flex-col items-center gap-1 py-2.5 rounded-lg transition-all relative overflow-hidden group
                                ${currentPage === 'admin'
                                    ? 'bg-white/10 text-white font-medium shadow-sm'
                                    : 'text-white/80 hover:text-white hover:bg-white/5'
                                }
                            `}
                        >
                            {currentPage === 'admin' && <div className="absolute left-0 top-1/4 bottom-1/4 w-[3px] rounded-r-full bg-og-gradient shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>}
                            <Shield size={18} className={`${currentPage === 'admin' ? 'text-white drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'opacity-90 group-hover:opacity-100 group-hover:drop-shadow-[0_0_3px_rgba(255,255,255,0.3)]'}`} />
                            <span className="text-[10px] font-normal tracking-wide">
                                {lang === 'zh' ? '管理' : 'Admin'}
                            </span>
                        </button>
                    )}
                </nav>

                {/* 底部反馈按钮 */}
                <div className="p-2 border-t border-white/5">
                    <button
                        onClick={() => setShowFeedback(true)}
                        className="w-full flex flex-col items-center gap-1 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/5 transition-all group"
                    >
                        <div className="relative">
                            <MessageSquare size={18} className="opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-transform group-hover:drop-shadow-[0_0_3px_rgba(255,255,255,0.3)]" />
                            {/* 动态脉冲点 */}
                            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        </div>
                        <span className="text-[10px] font-normal tracking-wide">
                            {lang === 'zh' ? '反馈' : 'Feedback'}
                        </span>
                    </button>
                </div>

                {/* 移动端关闭按钮 */}
                <button
                    onClick={onMobileClose}
                    className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/10 text-white md:hidden"
                >
                    <X size={18} />
                </button>
            </aside>
        </>
    );
};

// ==========================================
// 🎨 Header 组件
// ==========================================
export const Header = ({
    username,
    quota,
    isLoggedIn,
    onLogin,
    onLogout,
    lang,
    setLang,
    onMobileMenuOpen,
    sidebarExpanded
}) => {
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showQuotaLogs, setShowQuotaLogs] = useState(false);

    return (
        <header
            className={`
        h-12 md:h-14 flex items-center justify-between px-4 md:px-6 
        bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 
        fixed top-0 right-0 z-30 transition-all duration-300
        left-0 md:left-16
      `}
        >
            {/* 左侧：移动端菜单按钮 */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onMobileMenuOpen}
                    className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white md:hidden"
                >
                    <Menu size={20} />
                </button>

            </div>

            <QuotaLogsModal isOpen={showQuotaLogs} onClose={() => setShowQuotaLogs(false)} lang={lang} />

            {/* 右侧：用户区域 */}
            <div className="flex items-center gap-3 ml-auto">
                {/* 语言切换 */}
                <button
                    onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
                    className="p-1.5 hover:bg-white/10 rounded-full transition-colors flex items-center gap-1 text-xs font-normal text-white/80 hover:text-white tracking-wide"
                >
                    <Globe size={14} className="opacity-90 hover:opacity-100" />
                    <span className="hidden sm:inline">{lang === 'zh' ? 'EN' : '中'}</span>
                </button>

                <div className="w-[1px] h-5 bg-white/10"></div>

                {isLoggedIn ? (
                    <div
                        className="relative"
                        onMouseEnter={() => setShowUserMenu(true)}
                        onMouseLeave={() => setShowUserMenu(false)}
                    >
                        <button className="flex items-center gap-1.5 hover:bg-white/5 p-1 rounded-full transition-colors border border-white/5 bg-[#141414]">
                            <div className="flex items-center gap-1 px-2">
                                <Zap size={12} className="text-white/90" fill="currentColor" />
                                <span className="text-xs text-white/90 font-mono font-normal tracking-wide">{quota}</span>
                            </div>
                            <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                                <span className="text-[10px] font-normal tracking-wide text-white">{username?.slice(0, 3)}</span>
                            </div>
                        </button>
                        {showUserMenu && (
                            <div className="absolute top-full right-0 pt-2 z-50">
                                <div className="w-40 bg-[#141414] border border-white/10 rounded-xl shadow-2xl py-2">
                                    <div className="px-4 py-2 border-b border-white/5">
                                        <span className="text-[11px] text-white/40 font-mono">{username}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            setShowQuotaLogs(true);
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-xs text-white/80 hover:bg-white/5 hover:text-white flex items-center gap-2 mt-1 transition-colors"
                                    >
                                        <Zap size={14} /> {lang === 'zh' ? '积分明细' : 'Quota History'}
                                    </button>
                                    <button
                                        onClick={onLogout}
                                        className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-white/5 flex items-center gap-2 transition-colors"
                                    >
                                        <LogOut size={14} /> {lang === 'zh' ? '退出登录' : 'Logout'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={onLogin}
                        className="px-3 py-1.5 rounded-full bg-og-gradient text-white text-xs font-medium hover:opacity-90 transition-opacity tracking-wide"
                    >
                        {lang === 'zh' ? '登录' : 'Login'}
                    </button>
                )}
            </div>
        </header>
    );
};

// ==========================================
// 🎨 Layout 容器组件
// ==========================================
export const Layout = ({
    children,
    currentPage,
    onNavigate,
    lang,
    setLang,
    username,
    quota,
    isLoggedIn,
    onLogin,
    onLogout,
    role,
    isImmersive = false // 新增 prop
}) => {
    const [sidebarExpanded, setSidebarExpanded] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            {/* Sidebar */}
            {!isImmersive && (
                <Sidebar
                    currentPage={currentPage}
                    onNavigate={onNavigate}
                    lang={lang}
                    isExpanded={sidebarExpanded}
                    onToggle={() => setSidebarExpanded(!sidebarExpanded)}
                    isMobileOpen={mobileMenuOpen}
                    onMobileClose={() => setMobileMenuOpen(false)}
                    username={username}
                    role={role}
                />
            )}

            {/* Header */}
            {!isImmersive && (
                <Header
                    username={username}
                    quota={quota}
                    isLoggedIn={isLoggedIn}
                    onLogin={onLogin}
                    onLogout={onLogout}
                    lang={lang}
                    setLang={setLang}
                    onMobileMenuOpen={() => setMobileMenuOpen(true)}
                    sidebarExpanded={sidebarExpanded}
                />
            )}

            {/* 主内容区 - 固定高度 */}
            <main
                className={`
          fixed bottom-0 right-0 transition-all duration-300
          ${isImmersive ? 'top-0 left-0 z-[100]' : 'top-12 md:top-14 left-0 md:left-16'}
        `}
            >
                {children}
            </main>
        </div>
    );
};

export default Layout;
