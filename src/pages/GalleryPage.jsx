import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, Download, FolderOpen, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { deleteUserHistoryItem, fetchUserHistory } from '../api/history';
import { isCompletedHistoryItem, toSecureUrl } from '../utils/media';

const GalleryPage = ({ token, lang }) => {
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const filterOptions = [
    { id: 'all', label: { zh: '全部', en: 'All' } },
    { id: 'product', label: { zh: '商品摄影', en: 'Product' } },
    { id: 'retouch', label: { zh: '智能修图', en: 'Retouch' } },
    { id: 'portrait', label: { zh: '人像写真', en: 'Portrait' } },
    { id: 'video', label: { zh: '视频生成', en: 'Video' } },
    { id: 'create', label: { zh: '自由创作', en: 'Create' } }
  ];

  const fetchAllHistory = async (isSilent = false) => {
    if (!token) return;
    if (!isSilent && history.length === 0) setLoading(true);
    try {
      const data = await fetchUserHistory(token);
      setHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!token || deleting) return;
    setDeleting(true);
    try {
      await deleteUserHistoryItem(token, itemId);
      setHistory((prev) => prev.filter((item) => item.id !== itemId));
      setDeleteConfirm(null);
      if (selectedImage?.id === itemId) setSelectedImage(null);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
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
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(secureUrl, '_blank');
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchAllHistory();
    const interval = setInterval(() => fetchAllHistory(true), 5000);
    return () => clearInterval(interval);
  }, [token]);

  const filteredHistory = history.filter((item) => {
    if (!isCompletedHistoryItem(item)) return false;
    if (filter === 'all') return true;
    if (filter === 'product') return !item.type || item.type === 'product';
    return item.type === filter;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 p-3 md:p-4 border-b border-white/5 bg-[#0a0a0a]/50">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                filter === opt.id ? 'bg-[#FF8A3D] text-white' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {opt.label[lang]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-white/30">{filteredHistory.length} {lang === 'zh' ? '张' : 'images'}</span>
      </div>

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
            {filteredHistory.map((item) => (
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

      {deleteConfirm && (
        <div className="fixed inset-0 z-[1002] bg-black/80 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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

      {selectedImage && (
        <div className="fixed inset-0 z-[2000] bg-black/95 flex flex-col md:flex-row animate-in fade-in duration-300" onClick={() => setSelectedImage(null)}>
          <div className="flex-1 relative flex items-center justify-center p-4 md:p-12 min-h-0">
            <img
              src={toSecureUrl(selectedImage.image)}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform duration-500"
              onClick={(e) => e.stopPropagation()}
              alt=""
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="md:hidden absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div
            className="w-full md:w-[380px] h-full bg-[#111] border-l border-white/5 flex flex-col animate-in slide-in-from-right duration-500"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-16 flex items-center justify-between px-6 border-b border-white/5 shrink-0">
              <h3 className="text-white font-bold flex items-center gap-2">
                <AlertCircle size={18} className="text-[#FF8A3D]" />
                {lang === 'zh' ? '图片详情' : 'Image Details'}
              </h3>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-2 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest">{lang === 'zh' ? '创意描述 (Prompt)' : 'Prompt'}</label>
                  <button
                    onClick={() => {
                      const cleanP = selectedImage.prompt ? selectedImage.prompt.replace(/^\[.*?\]\s*/, '') : '';
                      navigator.clipboard.writeText(cleanP);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className={`flex items-center gap-1.5 text-[10px] transition-all font-bold ${copied ? 'text-green-500' : 'text-[#FF8A3D] hover:text-[#FF8A3D]/80'}`}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? (lang === 'zh' ? '已复制' : 'Copied') : (lang === 'zh' ? '复制' : 'Copy')}
                  </button>
                </div>
                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl text-sm text-white/80 leading-relaxed italic max-h-[200px] overflow-y-auto break-words whitespace-pre-wrap">
                  {selectedImage.prompt ? selectedImage.prompt.replace(/^\[.*?\]\s*/, '') : (lang === 'zh' ? '暂无描述' : 'No prompt')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                  <div className="text-[10px] font-bold text-white/20 uppercase tracking-wider">{lang === 'zh' ? '画幅比例' : 'Aspect Ratio'}</div>
                  <div className="text-sm font-mono text-white/80">{selectedImage.ratio || selectedImage.aspect_ratio || selectedImage.size || '-'}</div>
                </div>
                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                  <div className="text-[10px] font-bold text-white/20 uppercase tracking-wider">{lang === 'zh' ? '分辨率' : 'Resolution'}</div>
                  <div className="text-sm font-mono text-white/80">{selectedImage.size && selectedImage.size.includes('x') ? selectedImage.size : '-'}</div>
                </div>
              </div>

              <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-3">
                <div className="text-[10px] font-bold text-white/20 uppercase tracking-wider">{lang === 'zh' ? '生成模型' : 'Model'}</div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FF8A3D]/10 flex items-center justify-center">
                    <Sparkles size={20} className="text-[#FF8A3D]" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{selectedImage.model || '-'}</div>
                    <div className="text-[10px] text-white/30 uppercase tracking-tighter">AI Generation Engine</div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex flex-col gap-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/20">{lang === 'zh' ? '创建时间' : 'Created At'}</span>
                  <span className="text-white/40">{selectedImage.timestamp ? new Date(selectedImage.timestamp * 1000).toLocaleString() : '-'}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/20">{lang === 'zh' ? '任务类型' : 'Task Type'}</span>
                  <span className="text-[#FF8A3D]/60 font-bold uppercase">{selectedImage.type || 'create'}</span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-white/5 shrink-0 flex gap-3">
              <button
                onClick={() => handleDownload(selectedImage.image)}
                className="flex-1 h-12 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <Download size={18} /> {lang === 'zh' ? '下载图片' : 'Download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GalleryPage;
