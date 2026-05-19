import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, FolderOpen, History, Layout as LayoutIcon, Link, Loader2, Sparkles, Zap, Film } from 'lucide-react';
import { fetchUserHistory } from '../api/history';
import { isCompletedHistoryItem, toSecureUrl } from '../utils/media';

const HomePage = ({ onNavigate, token, lang }) => {
  const [recentHistory, setRecentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const fetchRecentHistory = async () => {
      if (!token) return;
      setLoadingHistory(true);
      try {
        const serverData = await fetchUserHistory(token);
        setRecentHistory(serverData.filter(isCompletedHistoryItem).slice(0, 8));
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchRecentHistory();
  }, [token]);

  return (
    <>
      <Helmet>
        <title>{lang === 'zh' ? 'OG AI - 首页 | AI商品摄影与智能修图' : 'OG AI - Home | AI Photography & Editing'}</title>
        <meta
          name="description"
          content={lang === 'zh'
            ? 'OG AI - 专业的AI商品摄影和智能修图平台。一键生成高质量商品图片，AI智能修图，个人写真制作。'
            : 'OG AI - Professional AI photography and editing platform. Generate high-quality product images with one click.'}
        />
      </Helmet>
      <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-white/5 rounded-full blur-[150px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-white/5 rounded-full blur-[150px]" />
        </div>

        <div className="relative z-10 mb-8">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {lang === 'zh' ? '开始创作' : 'Start Creating'}
          </h1>
          <p className="text-white/50 text-sm md:text-base">
            {lang === 'zh' ? '选择一个功能，开启 AI 创意之旅' : 'Choose a feature to start your AI creative journey'}
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-10">
          {[
            {
              id: 'quick-create',
              icon: <Zap size={28} />,
              title: { zh: '快速创作', en: 'Quick Create' },
              desc: { zh: '商品摄影、智能修图、人像写真，一站搞定。', en: 'Product shots, retouching, portraits in one place.' },
              gradient: 'from-[#FF8A3D] to-[#E65100]'
            },
            {
              id: 'create',
              icon: <LayoutIcon size={28} />,
              title: { zh: '无限画布', en: 'Infinite Canvas' },
              desc: { zh: '自由创作空间，文生图、图生图任意组合。', en: 'Free creative space with text & image generation.' },
              gradient: 'from-[#10B981] to-[#059669]',
              desktopOnly: true
            },
            {
              id: 'models',
              icon: <Sparkles size={28} />,
              title: { zh: '模型广场', en: 'Models Plaza' },
              desc: { zh: '探索海量AI模型，找到最适合你的创作工具。', en: 'Explore AI models for your creative needs.' },
              gradient: 'from-[#8B5CF6] to-[#6D28D9]'
            },
            {
              id: 'api-keys',
              icon: <Link size={28} />,
              title: { zh: 'API 管理', en: 'API Keys' },
              desc: { zh: '管理API密钥，集成AI能力到你的应用。', en: 'Manage API keys and integrate AI into your apps.' },
              gradient: 'from-[#06B6D4] to-[#0891B2]'
            },
            {
              id: 'drama',
              icon: <Film size={28} />,
              title: { zh: '短剧创作', en: 'Short Drama' },
              desc: { zh: '一句话生成完整短剧视频，AI自动编剧、分镜、拍摄。', en: 'One sentence to a full short drama video.' },
              gradient: 'from-[#F43F5E] to-[#BE123C]'
            }
          ].map((item) => (
            <div
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`group relative p-5 md:p-6 rounded-xl border transition-all duration-300 cursor-pointer bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05] hover:scale-[1.02] ${item.desktopOnly ? 'hidden md:block' : ''}`}
            >
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-3 shadow-lg text-white group-hover:scale-110 transition-transform duration-300`}>
                {item.icon}
              </div>
              <h3 className="text-base md:text-lg font-bold mb-1 text-white">{item.title[lang]}</h3>
              <p className="text-white/40 text-xs md:text-sm line-clamp-2">{item.desc[lang]}</p>
              <ArrowRight size={16} className="absolute top-5 right-5 text-white/20 group-hover:text-white/80 group-hover:translate-x-1 transition-all" />
            </div>
          ))}
        </div>

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
                {recentHistory.map((item) => (
                  <div
                    key={item.id}
                    className="aspect-square rounded-xl overflow-hidden border border-white/10 group relative bg-[#111] hover:border-[#FF8A3D]/50 transition-all cursor-pointer"
                    onClick={() => onNavigate('gallery')}
                  >
                    <img src={toSecureUrl(item.image)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="" />
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-[10px] text-white/70 line-clamp-1">{item.prompt}</p>
                      <span
                        className={`text-[8px] px-1.5 py-0.5 rounded-full mt-1 inline-block ${
                          item.type === 'retouch'
                            ? 'bg-emerald-500/30 text-purple-300'
                            : item.type === 'portrait'
                              ? 'bg-cyan-500/30 text-cyan-300'
                              : item.type === 'create'
                                ? 'bg-green-500/30 text-green-300'
                                : 'bg-orange-500/30 text-orange-300'
                        }`}
                      >
                        {item.type === 'retouch'
                          ? (lang === 'zh' ? '修图' : 'Retouch')
                          : item.type === 'portrait'
                            ? (lang === 'zh' ? '人像' : 'Portrait')
                            : item.type === 'create'
                              ? (lang === 'zh' ? '创作' : 'Create')
                              : (lang === 'zh' ? '商品' : 'Product')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

export default HomePage;

