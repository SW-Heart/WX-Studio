import React, { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { ZoomIn, ZoomOut, Maximize, Grid3X3, MousePointer2, Hand, Download, Trash2, Maximize2, Layers, Lock, Unlock, Crop, Expand, X, Link2, Pencil, Type, Square, Upload, Eye, EyeOff, MoreHorizontal, Image as ImageIcon, Search, Check, PlusSquare, ChevronDown, AlignLeft, AlignCenter, AlignRight, Sliders, ArrowUp, Menu, ImagePlus, Video, Minus, ArrowUpRight, Circle, Triangle, Star, List, ListOrdered, Scissors } from 'lucide-react';

const GRID_SIZE = 30;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;
const NODE_DEFAULT_W = 320;
const NODE_DEFAULT_H = 320;
const NODE_GAP = 40;
const NODE_MIN_SIZE = 60;

const getNewNodePositions = (count, existingNodes, canvasCenter) => {
  const positions = [];

  // 查找现有节点中最靠右和最靠下的位置
  let maxX = -Infinity;
  let hasNodes = false;

  existingNodes.forEach(n => {
    hasNodes = true;
    maxX = Math.max(maxX, n.x + (n.w || NODE_DEFAULT_W));
  });

  // 策略：如果有节点，我们在最右侧节点的右边生成（保持一定的横向间距）
  // 如果没有节点，或者最右侧位置已经在视野中心很远，则以中心点为准
  let startX;
  const cols = Math.ceil(Math.sqrt(count));

  if (hasNodes && maxX > canvasCenter.x - 200) {
    startX = maxX + NODE_GAP;
  } else {
    startX = canvasCenter.x - ((cols * (NODE_DEFAULT_W + NODE_GAP)) / 2);
  }

  const startY = canvasCenter.y - ((Math.ceil(count / cols) * (NODE_DEFAULT_H + NODE_GAP)) / 2);

  for (let i = 0; i < count; i++) {
    positions.push({
      x: startX + (i % cols) * (NODE_DEFAULT_W + NODE_GAP),
      y: startY + Math.floor(i / cols) * (NODE_DEFAULT_H + NODE_GAP)
    });
  }
  return positions;
};

// --- Resize手柄 ---
const ResizeHandle = ({ position, zoom, onResizeStart }) => {
  const size = 6 / zoom; // 缩小手柄大小
  const offset = -size / 2;
  const s = {
    'se': { right: offset, bottom: offset, cursor: 'nwse-resize' },
    'sw': { left: offset, bottom: offset, cursor: 'nesw-resize' },
    'ne': { right: offset, top: offset, cursor: 'nesw-resize' },
    'nw': { left: offset, top: offset, cursor: 'nwse-resize' }
  }[position];

  return (
    <div
      className="absolute bg-white border-[#0ea5e9] rounded-sm z-20 shadow-sm"
      style={{
        ...s,
        width: size,
        height: size,
        borderWidth: 2 / zoom
      }}
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onResizeStart(e, position); }}
    />
  );
};

// --- 裁剪弹窗 ---
const CROP_PRESETS = [
  { label: '自由', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '2:3', ratio: 2 / 3 },
  { label: '3:2', ratio: 3 / 2 },
];

const CropModal = ({ node, onClose, onCropDone }) => {
  const imgRef = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [preset, setPreset] = useState(null);
  const [cropW, setCropW] = useState(0);
  const [cropH, setCropH] = useState(0);
  const dragRef = useRef(null);

  const onImgLoad = (e) => {
    const { naturalWidth: nw, naturalHeight: nh } = e.target;
    const maxW = 400, maxH = 500;
    const scale = Math.min(maxW / nw, maxH / nh, 1);
    const w = nw * scale, h = nh * scale;
    setImgSize({ w, h, nw, nh, scale });
    setCropRect({ x: 0, y: 0, w, h });
    setCropW(nw); setCropH(nh);
  };

  const applyPreset = (ratio) => {
    setPreset(ratio);
    if (!ratio) return;
    let cw = imgSize.w, ch = imgSize.w / ratio;
    if (ch > imgSize.h) { ch = imgSize.h; cw = ch * ratio; }
    setCropRect({ x: (imgSize.w - cw) / 2, y: (imgSize.h - ch) / 2, w: cw, h: ch });
    setCropW(Math.round(cw / imgSize.scale)); setCropH(Math.round(ch / imgSize.scale));
  };

  const onCropMouseDown = (e, type) => {
    e.stopPropagation(); e.preventDefault();
    dragRef.current = { type, startX: e.clientX, startY: e.clientY, startRect: { ...cropRect } };
    const onMove = (ev) => {
      const d = dragRef.current; if (!d) return;
      const dx = ev.clientX - d.startX, dy = ev.clientY - d.startY;
      const r = { ...d.startRect };
      if (d.type === 'move') { r.x = Math.max(0, Math.min(imgSize.w - r.w, r.x + dx)); r.y = Math.max(0, Math.min(imgSize.h - r.h, r.y + dy)); }
      else {
        if (d.type.includes('e')) r.w = Math.max(20, Math.min(imgSize.w - r.x, r.w + dx));
        if (d.type.includes('s')) r.h = Math.max(20, Math.min(imgSize.h - r.y, r.h + dy));
        if (d.type.includes('w')) { const nw2 = Math.max(20, r.w - dx); r.x = r.x + r.w - nw2; r.w = nw2; }
        if (d.type.includes('n')) { const nh2 = Math.max(20, r.h - dy); r.y = r.y + r.h - nh2; r.h = nh2; }
        if (preset) { r.h = r.w / preset; if (r.y + r.h > imgSize.h) r.h = imgSize.h - r.y; r.w = r.h * preset; }
      }
      setCropRect(r);
      setCropW(Math.round(r.w / imgSize.scale)); setCropH(Math.round(r.h / imgSize.scale));
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  const handleDone = () => {
    const sx = cropRect.x / imgSize.scale, sy = cropRect.y / imgSize.scale;
    const sw = cropRect.w / imgSize.scale, sh = cropRect.h / imgSize.scale;
    // 用 canvas 裁剪并下载
    const img = new Image(); 
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = sw; c.height = sh;
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        if (onCropDone) {
          onCropDone(c.toDataURL('image/png'));
        }
        onClose();
      } catch (err) {
        console.error("Canvas crop error:", err);
        alert("裁剪失败：图片跨域限制导致无法截取。");
        onClose();
      }
    };
    img.onerror = () => {
      console.error("Failed to load image for cropping.");
      alert("裁剪失败：图片加载错误（可能因为跨域安全限制）。");
      onClose();
    };
    img.src = node.image + (node.image.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1c1c1e] rounded-2xl shadow-2xl border border-white/10 p-6 flex gap-6 max-w-[700px]" onClick={e => e.stopPropagation()}>
        {/* 左侧图片+裁剪框 */}
        <div className="relative" style={{ width: imgSize.w || 300, height: imgSize.h || 300 }}>
          <img ref={imgRef} src={node.image} alt="" onLoad={onImgLoad} className="w-full h-full object-contain" draggable={false} />
          {imgSize.w > 0 && <>
            {/* 暗色遮罩 */}
            <div className="absolute inset-0 bg-black/50" style={{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 ${cropRect.y}px,${cropRect.x}px ${cropRect.y}px,${cropRect.x}px ${cropRect.y + cropRect.h}px,${cropRect.x + cropRect.w}px ${cropRect.y + cropRect.h}px,${cropRect.x + cropRect.w}px ${cropRect.y}px,0 ${cropRect.y}px)` }} />
            {/* 裁剪框 */}
            <div className="absolute border-2 border-white/80" style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
              onMouseDown={e => onCropMouseDown(e, 'move')} style2={{ cursor: 'move' }}>
              {/* 网格线 */}
              <div className="absolute inset-0 pointer-events-none" style={{ borderLeft: `${cropRect.w / 3}px solid transparent`, borderRight: `${cropRect.w / 3}px solid transparent` }}>
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
              </div>
              {/* 拖拽手柄 */}
              {['nw', 'ne', 'sw', 'se'].map(p => <div key={p} className="absolute w-3 h-3 bg-white rounded-full border-2 border-[#1c1c1e]" style={{ ...(p.includes('n') ? { top: -6 } : { bottom: -6 }), ...(p.includes('w') ? { left: -6 } : { right: -6 }), cursor: p === 'nw' || p === 'se' ? 'nwse-resize' : 'nesw-resize' }} onMouseDown={e => onCropMouseDown(e, p)} />)}
            </div>
          </>}
        </div>
        {/* 右侧面板 */}
        <div className="w-48 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white text-base font-semibold">裁剪</h3>
            <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
          </div>
          <div className="flex gap-2 mb-4">
            <div className="flex-1"><label className="text-[10px] text-white/40">W</label><input type="number" value={cropW} onChange={e => { const v = +e.target.value; setCropW(v); setCropRect(r => ({ ...r, w: v * imgSize.scale })); }} className="w-full bg-[#2a2a2e] border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm" /></div>
            <div className="flex items-end pb-2"><Link2 size={14} className="text-white/30" /></div>
            <div className="flex-1"><label className="text-[10px] text-white/40">H</label><input type="number" value={cropH} onChange={e => { const v = +e.target.value; setCropH(v); setCropRect(r => ({ ...r, h: v * imgSize.scale })); }} className="w-full bg-[#2a2a2e] border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm" /></div>
          </div>
          <div className="text-[11px] text-white/40 mb-2">预设比例</div>
          <div className="flex flex-col gap-1 flex-1 overflow-auto">
            {CROP_PRESETS.map(p => <button key={p.label} onClick={() => applyPreset(p.ratio)} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${preset === p.ratio ? 'bg-[#10B981]/20 text-[#10B981]' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>{p.label}</button>)}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="flex-1 px-4 py-2 bg-[#2a2a2e] text-white/70 rounded-xl text-sm hover:bg-[#333]">取消</button>
            <button onClick={handleDone} className="flex-1 px-4 py-2 bg-[#10B981] text-white rounded-xl text-sm font-medium hover:bg-[#059669]">完成</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- 画布节点 ---
const CanvasNode = ({ node, zoom, onDragStart, onResizeStart, onAction, onDoubleClick, isSelected, onSelect, onMetaUpdate }) => {
  const isLoading = node.status === 'pending' || node.status === 'running';
  const isError = node.status === 'error';
  const isDone = node.status === 'done' || node.status === 'success';
  return (
    <div className={`canvas-node absolute select-none group ${node.hidden ? 'hidden' : ''}`} style={{ left: node.x, top: node.y, width: node.w || NODE_DEFAULT_W, height: node.h || NODE_DEFAULT_H, zIndex: isSelected ? 1000 : (node.zIndex || 1) }}
      onMouseDown={e => { e.stopPropagation(); onSelect(node.id); if (e.button === 0) onDragStart(e, node.id); }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
      onDoubleClick={e => { e.stopPropagation(); if (isDone && node.image) onDoubleClick(node); }}>

      <div
        className={`w-full h-full overflow-hidden transition-shadow duration-200 ${node.type === 'text' && !isSelected ? '' : 'shadow-xl'}`}
        style={{
          cursor: 'grab',
          border: node.type === 'text' && !isSelected ? 'none' : `${(isSelected ? 2 : 1) / zoom}px solid ${isSelected ? '#0ea5e9' : 'rgba(255,255,255,0.1)'}`,
          boxShadow: isSelected ? `0 0 ${20 / zoom}px rgba(14,165,233,0.25)` : undefined,
          opacity: node.locked ? 0.8 : 1
        }}
      >
        {isLoading && (
          <div className="w-full h-full bg-[#0a0a0a] flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(16,185,129,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px', animation: 'gridShift 4s linear infinite' }} />
            <div className="absolute inset-0 overflow-hidden"><div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#10B981] to-transparent" style={{ animation: 'scanline 2s ease-in-out infinite' }} /></div>
            <div className="relative w-16 h-16 mb-3">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="url(#pg)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - (node.progress || 0) / 100)}`} className="transition-all duration-500" />
                <defs><linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#059669" /><stop offset="100%" stopColor="#10B981" /></linearGradient></defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center"><span className="text-white/90 font-mono text-sm font-bold">{Math.round(node.progress || 0)}%</span></div>
            </div>
            <div className="text-white/40 text-[10px] tracking-widest uppercase">生成中...</div>
          </div>
        )}
        {isError && (
          <div className="w-full h-full bg-[#0a0a0a] flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-2"><span className="text-red-400">✕</span></div>
            <div className="text-red-400/80 text-[10px]">失败</div>
          </div>
        )}
        {isDone && node.image && (
          <img
            src={node.image}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
            onLoad={(e) => {
              const { naturalWidth: nw, naturalHeight: nh } = e.target;
              const currentW = node.w || NODE_DEFAULT_W;
              const currentH = node.h || NODE_DEFAULT_H;
              const expectedRatio = nh / nw;
              const currentRatio = currentH / currentW;
              
              // 如果真实的自然尺寸没记录，或者当前的画框比例和真实比例不符（容差0.01），则强制拉伸外框
              if (node.realW !== nw || node.realH !== nh || Math.abs(currentRatio - expectedRatio) > 0.01) {
                const newH = currentW * expectedRatio;
                onMetaUpdate?.(node.id, { realW: nw, realH: nh, w: currentW, h: newH });
              }
            }}
          />
        )}
        {isDone && ['rect', 'ellipse', 'line', 'arrow', 'poly', 'star'].includes(node.type) && (
          <div className="w-full h-full pointer-events-none">
            {node.type === 'rect' && (
              <div className="w-full h-full border-2" style={{ borderColor: node.color || '#fff', backgroundColor: node.fill || 'transparent' }} />
            )}
            {node.type === 'ellipse' && (
              <div className="w-full h-full border-2 rounded-full" style={{ borderColor: node.color || '#fff', backgroundColor: node.fill || 'transparent' }} />
            )}
            {node.type === 'line' && (
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <line x1={node.flipX ? "100%" : "0"} y1={node.flipY ? "100%" : "0"} x2={node.flipX ? "0" : "100%"} y2={node.flipY ? "0" : "100%"} stroke={node.color || '#fff'} strokeWidth={node.strokeWidth || 4} />
              </svg>
            )}
            {node.type === 'arrow' && (
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <marker id={`arrowhead-${node.id}`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto" markerUnits="strokeWidth">
                    <polygon points="0 0, 4 2, 0 4" fill={node.color || '#fff'} />
                  </marker>
                </defs>
                <line x1={node.flipX ? "100%" : "0"} y1={node.flipY ? "100%" : "0"} x2={node.flipX ? "0" : "100%"} y2={node.flipY ? "0" : "100%"} stroke={node.color || '#fff'} strokeWidth={node.strokeWidth || 4} markerEnd={`url(#arrowhead-${node.id})`} />
              </svg>
            )}
            {node.type === 'poly' && (
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                <polygon points="50,0 100,100 0,100" fill={node.fill || 'transparent'} stroke={node.color || '#fff'} strokeWidth={node.strokeWidth || 2} vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {node.type === 'star' && (
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                <polygon points="50,5 61,38 96,38 68,59 79,91 50,71 21,91 32,59 4,38 39,38" fill={node.fill || 'transparent'} stroke={node.color || '#fff'} strokeWidth={node.strokeWidth || 2} vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {node.type === 'pencil' && node.points && (
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <polyline 
                  points={node.points.map(p => `${p[0] - node.minX},${p[1] - node.minY}`).join(' ')} 
                  fill="none" 
                  stroke={node.color || '#fff'} 
                  strokeWidth={node.strokeWidth || 4} 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  vectorEffect="non-scaling-stroke" 
                />
              </svg>
            )}
          </div>
        )}
        {isDone && node.type === 'text' && (
          <div className="w-full h-full flex items-center justify-center p-4">
            <textarea
              defaultValue={node.content || '输入文字...'}
              onChange={e => onMetaUpdate?.(node.id, { content: e.target.value })}
              className="w-full h-full bg-transparent border-none text-white text-center outline-none resize-none placeholder:text-white/20 custom-scrollbar"
              style={{
                fontSize: node.fontSize || 32,
                fontFamily: node.fontFamily || 'Inter',
                textAlign: node.textAlign || 'center',
                color: node.color || '#fff'
              }}
            />
          </div>
        )}
      </div>
      {isSelected && !node.locked && <>
        <ResizeHandle position="se" zoom={zoom} onResizeStart={(e, p) => onResizeStart(e, p, node.id)} />
        <ResizeHandle position="sw" zoom={zoom} onResizeStart={(e, p) => onResizeStart(e, p, node.id)} />
        <ResizeHandle position="ne" zoom={zoom} onResizeStart={(e, p) => onResizeStart(e, p, node.id)} />
        <ResizeHandle position="nw" zoom={zoom} onResizeStart={(e, p) => onResizeStart(e, p, node.id)} />
      </>}
    </div>
  );
};

// --- 图层面板 ---
const LayerPanel = ({ nodes, onNodesChange, onSelect, selectedId, onClose }) => {
  return (
    <div className="absolute bottom-16 left-4 w-64 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-in slide-in-from-bottom-4">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-xs font-bold text-white/80 uppercase tracking-widest flex items-center gap-2">
          <Layers size={14} className="text-[#10B981]" /> 图层管理
        </h3>
        <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-md text-white/40"><X size={14} /></button>
      </div>
      <div className="max-h-80 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {[...nodes].reverse().map(node => (
          <div
            key={node.id}
            onClick={() => onSelect(node.id)}
            className={`group flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer ${selectedId === node.id ? 'bg-[#10B981]/10 border border-[#10B981]/20' : 'hover:bg-white/5 border border-transparent'}`}
          >
            <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/5 overflow-hidden shrink-0 flex items-center justify-center">
              {node.image ? <img src={node.image} className="w-full h-full object-cover" /> : <div className="text-[10px] text-white/20">生成中</div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-white/80 truncate font-medium">{node.prompt || '未命名图层'}</div>
              <div className="text-[9px] text-white/30 font-mono uppercase">{node.status}</div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onNodesChange(prev => prev.map(n => n.id === node.id ? { ...n, hidden: !n.hidden } : n)); }}
                className={`p-1.5 rounded-md hover:bg-white/10 ${node.hidden ? 'text-red-400' : 'text-white/40'}`}
              >
                {node.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onNodesChange(prev => prev.map(n => n.id === node.id ? { ...n, locked: !n.locked } : n)); }}
                className={`p-1.5 rounded-md hover:bg-white/10 ${node.locked ? 'text-[#10B981]' : 'text-white/40'}`}
              >
                {node.locked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>
            </div>
          </div>
        ))}
        {nodes.length === 0 && <div className="py-8 text-center text-white/20 text-xs italic">暂无图层</div>}
      </div>
    </div>
  );
};

// --- 迷你地图 ---
const MiniMap = ({ nodes, viewport, onClick }) => {
  const W = 140, H = 90; if (!nodes.length) return null;
  const b = nodes.reduce((a, n) => ({ minX: Math.min(a.minX, n.x), minY: Math.min(a.minY, n.y), maxX: Math.max(a.maxX, n.x + (n.w || NODE_DEFAULT_W)), maxY: Math.max(a.maxY, n.y + (n.h || NODE_DEFAULT_H)) }), { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 });
  const p = 200, wW = Math.max(b.maxX - b.minX + p * 2, 1), wH = Math.max(b.maxY - b.minY + p * 2, 1), s = Math.min(W / wW, H / wH), ox = b.minX - p, oy = b.minY - p;
  return <div className="absolute bottom-4 right-4 rounded-lg overflow-hidden border border-white/10 bg-[#111]/80 backdrop-blur-sm shadow-lg cursor-pointer z-50" style={{ width: W, height: H }}
    onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onClick((e.clientX - r.left) / s + ox, (e.clientY - r.top) / s + oy); }}>
    {nodes.map(n => <div key={n.id} className={`absolute ${n.status === 'done' || n.status === 'success' ? 'bg-[#10B981]/60' : n.status === 'error' ? 'bg-red-500/60' : 'bg-white/20'}`} style={{ left: (n.x - ox) * s, top: (n.y - oy) * s, width: Math.max(2, (n.w || NODE_DEFAULT_W) * s), height: Math.max(2, (n.h || NODE_DEFAULT_H) * s), borderRadius: 1 }} />)}
    <div className="absolute border border-white/50" style={{ left: (viewport.x - ox) * s, top: (viewport.y - oy) * s, width: viewport.w * s, height: viewport.h * s, borderRadius: 1 }} />
  </div>;
};

const PropertyBar = ({ node, onChange }) => {
  const [activeSub, setActiveSub] = useState(null);
  if (!node) return null;

  const type = node.type;
  const props = node;

  if (type === 'pencil') {
    return (
      <div className="flex items-center gap-4 bg-[#1e1e1e] border border-white/10 rounded-2xl px-4 py-2 shadow-2xl animate-in slide-in-from-top-2 duration-200 pointer-events-auto">
        <div className="flex items-center gap-2 pr-4 border-r border-white/5">
          <div className="w-6 h-6 rounded-full border border-white/20 shadow-inner" style={{ backgroundColor: props.color || '#fff' }} />
        </div>
        <div className="flex items-center gap-3">
          <Menu size={16} className="text-white/40" />
          <span className="text-sm font-medium text-white/80 w-8">{props.width || 10}</span>
          <span className="text-xs text-white/20">Px</span>
        </div>
      </div>
    );
  }

  if (type === 'text') {
    return (
      <div className="flex items-center gap-1 bg-[#1e1e1e] border border-white/10 rounded-2xl px-1.5 py-1.5 shadow-2xl animate-in slide-in-from-top-2 duration-200 z-[100] pointer-events-auto"
        onMouseDown={e => e.stopPropagation()}>

        {/* 颜色选择器 */}
        <div className="relative">
          <button onClick={() => setActiveSub(activeSub === 'color' ? null : 'color')}
            className="w-6 h-6 rounded-full mx-2 border border-white/20 shadow-sm hover:scale-110 transition-transform"
            style={{ backgroundColor: props.color || '#fff' }} />
          {activeSub === 'color' && (
            <div className="absolute top-full mt-3 left-0 bg-[#1e1e1e] border border-white/10 rounded-2xl p-2 shadow-2xl z-[110] flex gap-2">
              {['#fff', '#000', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'].map(c => (
                <button key={c} onClick={() => { onChange({ color: c }); setActiveSub(null); }}
                  className="w-6 h-6 rounded-full border border-white/10" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-white/5 mx-1" />

        <div className="relative">
          <button onClick={() => setActiveSub(activeSub === 'font' ? null : 'font')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${activeSub === 'font' ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'}`}>
            {props.fontFamily || 'Inter'} <ChevronDown size={14} />
          </button>
          {activeSub === 'font' && (
            <div className="absolute top-full mt-3 left-0 w-64 bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl p-2 animate-in zoom-in-95 duration-150 z-[110]">
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                {['Inter', 'Roboto', 'ABeeZee', 'ADLaM Display', 'AR One Sans', 'Abel'].map(f => (
                  <button key={f} onClick={(e) => { e.stopPropagation(); onChange({ fontFamily: f }); setActiveSub(null); }}
                    className="w-full text-left px-3 py-2 hover:bg-white/5 rounded-lg text-sm transition-colors font-medium text-white/70">{f}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button onClick={() => setActiveSub(activeSub === 'size' ? null : 'size')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-mono transition-colors ${activeSub === 'size' ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'}`}>
            {props.fontSize || 32} <ChevronDown size={14} />
          </button>
          {activeSub === 'size' && (
            <div className="absolute top-full mt-3 left-0 w-24 bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl p-1 animate-in zoom-in-95 duration-150 z-[110]">
              {[16, 24, 32, 48, 64, 80, 96].map(s => (
                <button key={s} onClick={(e) => { e.stopPropagation(); onChange({ fontSize: s }); setActiveSub(null); }}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 rounded-xl text-sm font-mono text-white/60">
                  {s} {s === (props.fontSize || 32) && <Check size={12} className="text-white/40" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-white/5 mx-1" />

        <div className="flex items-center gap-1 p-1">
          <button onClick={(e) => { e.stopPropagation(); onChange({ textAlign: 'left' }); }} className={`p-1.5 rounded-lg transition-colors ${props.textAlign === 'left' ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5'}`}><AlignLeft size={16} /></button>
          <button onClick={(e) => { e.stopPropagation(); onChange({ textAlign: 'center' }); }} className={`p-1.5 rounded-lg transition-colors ${props.textAlign === 'center' ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5'}`}><AlignCenter size={16} /></button>
          <button onClick={(e) => { e.stopPropagation(); onChange({ textAlign: 'right' }); }} className={`p-1.5 rounded-lg transition-colors ${props.textAlign === 'right' ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5'}`}><AlignRight size={16} /></button>
        </div>
      </div>
    );
  }
  return null;
};

// --- 工具栏 ---
const Toolbar = ({ zoom, onZoom, onFitAll, showGrid, onToggleGrid, tool, onToolChange, lockAspect, onToggleLock, onFullscreen, showLayer, onToggleLayer, onUpload }) => {
  const [activeMenu, setActiveMenu] = useState(null);

  const ShapeMenu = () => (
    <div className="absolute top-full mt-3 left-0 min-w-[180px] bg-[#1e1e1e] border border-white/10 rounded-2xl p-2 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 z-[100]">
      {[
        { id: 'rect', icon: <Square size={16} />, label: 'Rectangle', key: 'R' },
        { id: 'line', icon: <Minus size={16} className="rotate-45" />, label: 'Line', key: 'L' },
        { id: 'arrow', icon: <ArrowUpRight size={16} />, label: 'Arrow', key: '⇧ L' },
        { id: 'ellipse', icon: <Circle size={16} />, label: 'Ellipse', key: 'O' },
        { id: 'poly', icon: <Triangle size={16} />, label: 'Polygon', key: '' },
        { id: 'star', icon: <Star size={16} />, label: 'Star', key: '' },
      ].map(item => (
        <button key={item.id} onClick={() => { onToolChange(item.id); setActiveMenu(null); }}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 rounded-xl transition-colors text-white/60 hover:text-white group">
          <div className="flex items-center gap-3">
            <span className="text-white/30 group-hover:text-white/70">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </div>
          <span className="text-[10px] font-mono text-white/20">{item.key}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-50">
      <div className="flex items-center gap-0.5 bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/10 rounded-[18px] px-1.5 py-1.5 shadow-xl">
        <button onClick={() => onToolChange('select')} className={`p-2 rounded-xl transition-all ${tool === 'select' ? 'bg-white text-black shadow-md' : 'text-white/40 hover:bg-white/5 hover:text-white/80'}`} title="选择 (V)"><MousePointer2 size={16} /></button>
        <button onClick={() => onToolChange('hand')} className={`p-2 rounded-xl transition-all ${tool === 'hand' ? 'bg-white text-black shadow-md' : 'text-white/40 hover:bg-white/5 hover:text-white/80'}`} title="抓手 (H)"><Hand size={16} /></button>
        <div className="w-px h-4 bg-white/10 mx-1" />

        <label className="p-2 text-white/40 hover:bg-white/5 hover:text-white/80 rounded-xl cursor-pointer transition-all" title="上传 (U)">
          <ImageIcon size={16} /><input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </label>

        <button onClick={() => onToggleGrid()} className={`p-2 rounded-xl transition-all ${showGrid ? 'text-white/80' : 'text-white/20 hover:bg-white/5 hover:text-white/50'}`} title="网格 (G)"><Grid3X3 size={16} /></button>

        <div className="relative group">
          <button onClick={() => setActiveMenu(activeMenu === 'shape' ? null : 'shape')}
            className={`p-2 rounded-xl transition-all ${['rect', 'line', 'arrow', 'ellipse', 'poly', 'star'].includes(tool) ? 'bg-white text-black shadow-md' : 'text-white/40 hover:bg-white/5 hover:text-white/80'}`} title="形状 (S)">
            <Square size={16} />
          </button>
          {activeMenu === 'shape' && <ShapeMenu />}
        </div>

        <button onClick={() => onToolChange('pencil')} className={`p-2 rounded-xl transition-all ${tool === 'pencil' ? 'bg-white text-black shadow-md' : 'text-white/40 hover:bg-white/5 hover:text-white/80'}`} title="画笔 (P)"><Pencil size={16} /></button>
        <button onClick={() => onToolChange('text')} className={`p-2 rounded-xl transition-all ${tool === 'text' ? 'bg-white text-black shadow-md' : 'text-white/40 hover:bg-white/5 hover:text-white/80'}`} title="文字 (T)"><Type size={16} /></button>

        <div className="w-px h-4 bg-white/10 mx-1" />

        <button onClick={() => onZoom(-ZOOM_STEP)} className="p-2 text-white/40 hover:text-white/80 rounded-xl transition-all"><ZoomOut size={16} /></button>
        <button onClick={() => onZoom(0)} className="px-1.5 text-white/60 text-[10px] font-mono min-w-[40px] text-center hover:bg-white/5 rounded-lg tracking-wide">{Math.round(zoom * 100)}%</button>
        <button onClick={() => onZoom(ZOOM_STEP)} className="p-2 text-white/40 hover:text-white/80 rounded-xl transition-all"><ZoomIn size={16} /></button>

        <div className="w-px h-4 bg-white/10 mx-1" />

        <button onClick={onFitAll} className="p-2 text-white/40 hover:bg-white/5 hover:text-white/80 rounded-xl transition-all" title="适应全部"><Maximize size={16} /></button>
        <button onClick={onFullscreen} className="p-2 text-white/40 hover:bg-white/5 hover:text-white/80 rounded-xl transition-all" title="全屏模式 (F)"><Expand size={16} /></button>

        <div className="relative group ml-0.5 border-l border-white/10 pl-1">
          <button onClick={onToggleLayer} className={`p-2 rounded-xl transition-all ${showLayer ? 'bg-white text-black shadow-md' : 'text-white/40 hover:bg-white/5 hover:text-white/80'}`} title="图层 (L)"><Layers size={16} /></button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
const InfiniteCanvas = forwardRef(({ nodes, onNodesChange, onNodeAction, onDoubleClickNode, isImmersive, onToggleImmersive, onNodeDragEnd, onNodeDragMove }, ref) => {
  const containerRef = useRef(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState('select');
  const [showGrid, setShowGrid] = useState(true);
  const [showLayer, setShowLayer] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lockAspect, setLockAspect] = useState(true);
  const [cropNode, setCropNode] = useState(null);
  const dragRef = useRef({ type: null });
  const spaceRef = useRef(false);
  const didAutoFit = useRef(false);

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    getViewportCenter: () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 500, y: 300 }; // 默认回退值
      return {
        x: (rect.width / 2 - camera.x) / camera.zoom,
        y: (rect.height / 2 - camera.y) / camera.zoom
      };
    },
    focusOn: (x, y) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCamera(prev => ({
        ...prev,
        x: rect.width / 2 - x * prev.zoom,
        y: rect.height / 2 - y * prev.zoom
      }));
    }
  }), [camera]);

  // 自动定位到最新图片
  useEffect(() => {
    if (didAutoFit.current || !nodes.length) return;
    const doneNodes = nodes.filter(n => n.status === 'done' || n.status === 'success' || n.status === 'pending' || n.status === 'running');
    if (!doneNodes.length) return;
    didAutoFit.current = true;
    // 延迟等容器挂载
    setTimeout(() => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const latest = doneNodes[doneNodes.length - 1];
      const cx = latest.x + (latest.w || NODE_DEFAULT_W) / 2;
      const cy = latest.y + (latest.h || NODE_DEFAULT_H) / 2;
      setCamera({ x: rect.width / 2 - cx, y: rect.height / 2 - cy, zoom: 1 });
    }, 100);
  }, [nodes]);

  // 快捷键
  useEffect(() => {
    const onDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' && !spaceRef.current) { e.preventDefault(); spaceRef.current = true; }
      if (e.key === 'v') setTool('select');
      if (e.key === 'h') setTool('hand');
      if (e.key === 'f' || e.key === 'F') onToggleImmersive?.();
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId) onNodeAction('delete', nodes.find(n => n.id === selectedId)); }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); setCamera(p => ({ ...p, zoom: 1 })); }
    };
    const onUp = (e) => { if (e.code === 'Space') spaceRef.current = false; };
    window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [selectedId, nodes, onNodeAction, onToggleImmersive]);

  // 滚轮：普通=平移，Ctrl/pinch=缩放
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setCamera(prev => { const d = -e.deltaY * 0.01; const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom + d)); const r = z / prev.zoom; return { x: mx - (mx - prev.x) * r, y: my - (my - prev.y) * r, zoom: z }; });
    } else {
      setCamera(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  }, []);

  useEffect(() => { const el = containerRef.current; if (!el) return; el.addEventListener('wheel', handleWheel, { passive: false }); return () => el.removeEventListener('wheel', handleWheel); }, [handleWheel]);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 2) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left - camera.x) / camera.zoom;
    const my = (e.clientY - rect.top - camera.y) / camera.zoom;

    if (e.button === 1 || tool === 'hand' || spaceRef.current) {
      setIsPanning(true);
      dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, startCamX: camera.x, startCamY: camera.y };
    } else if (e.target.closest('.property-bar-container')) {
      // 如果点击的是属性栏区域，不做任何处理，由属性栏内部 handle
      return;
    } else if (['rect', 'line', 'arrow', 'ellipse', 'poly', 'star', 'pencil'].includes(tool)) {
      const id = Date.now().toString();
      const newNode = { id, x: mx, y: my, w: 0, h: 0, type: tool, status: 'done', zIndex: nodes.length + 1, points: tool === 'pencil' ? [[0, 0]] : undefined };
      onNodesChange(prev => [...prev, newNode]);
      setSelectedId(id);
      dragRef.current = { type: 'create', nodeId: id, startX: mx, startY: my };
    } else if (tool === 'text') {
      const id = Date.now().toString();
      onNodesChange(prev => [...prev, { id, x: mx, y: my, w: 200, h: 80, type: 'text', content: '', fontSize: 32, status: 'done', zIndex: nodes.length + 1 }]);
      setSelectedId(id);
      setTool('select');
    } else {
      setSelectedId(null);
    }
  }, [tool, camera, nodes, onNodesChange]);

  const handleNodeDragStart = useCallback((e, nodeId) => {
    if (tool === 'hand' || spaceRef.current) return;
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    dragRef.current = { type: 'node', startX: e.clientX, startY: e.clientY, nodeId, nodeStartX: node.x, nodeStartY: node.y };
  }, [tool, nodes]);

  const handleResizeStart = useCallback((e, position, nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    dragRef.current = {
      type: 'resize', position, startX: e.clientX, startY: e.clientY, nodeId,
      nodeStartX: node.x, nodeStartY: node.y, nodeStartW: node.w || NODE_DEFAULT_W, nodeStartH: node.h || NODE_DEFAULT_H
    };
  }, [nodes]);

  const handleMetaUpdate = useCallback((nodeId, meta) => {
    onNodesChange(prev => prev.map(n => n.id === nodeId ? { ...n, ...meta } : n));
  }, [onNodesChange]);

  const handleMouseMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d.type) return;
    if (d.type === 'pan') {
      setCamera(prev => ({ ...prev, x: d.startCamX + (e.clientX - d.startX), y: d.startCamY + (e.clientY - d.startY) }));
    } else if (d.type === 'create') {
      const rect = containerRef.current.getBoundingClientRect();
      const mx = (e.clientX - rect.left - camera.x) / camera.zoom;
      const my = (e.clientY - rect.top - camera.y) / camera.zoom;
      onNodesChange(prev => prev.map(n => {
        if (n.id !== d.nodeId) return n;
        if (n.type === 'pencil') {
          const px = mx - d.startX;
          const py = my - d.startY;
          const points = [...(n.points || []), [px, py]];
          const minX = Math.min(0, ...points.map(p => p[0]));
          const minY = Math.min(0, ...points.map(p => p[1]));
          const maxX = Math.max(0, ...points.map(p => p[0]));
          const maxY = Math.max(0, ...points.map(p => p[1]));
          return { ...n, x: d.startX + minX, y: d.startY + minY, w: maxX - minX, h: maxY - minY, points, minX, minY };
        } else {
          let w = Math.abs(mx - d.startX);
          let h = Math.abs(my - d.startY);
          
          if (lockAspect && ['ellipse', 'poly', 'star', 'rect'].includes(n.type)) {
            const size = Math.max(w, h);
            w = size;
            h = size;
          }

          const x = mx < d.startX ? d.startX - w : d.startX;
          const y = my < d.startY ? d.startY - h : d.startY;
          const flipX = mx < d.startX;
          const flipY = my < d.startY;
          return { ...n, x, y, w, h, flipX, flipY };
        }
      }));
    } else if (d.type === 'node') {
      const dx = (e.clientX - d.startX) / camera.zoom, dy = (e.clientY - d.startY) / camera.zoom;
      onNodesChange(prev => prev.map(n => n.id === d.nodeId ? { ...n, x: d.nodeStartX + dx, y: d.nodeStartY + dy } : n));
      if (onNodeDragMove) {
         const node = nodes.find(n => n.id === d.nodeId);
         if (node) onNodeDragMove(e, node);
      }
    } else if (d.type === 'resize') {
      const dx = (e.clientX - d.startX) / camera.zoom, dy = (e.clientY - d.startY) / camera.zoom;
      onNodesChange(prev => prev.map(n => {
        if (n.id !== d.nodeId) return n;
        let nX = d.nodeStartX, nY = d.nodeStartY, nW = d.nodeStartW, nH = d.nodeStartH;
        const p = d.position;

        if (p === 'se') { nW = d.nodeStartW + dx; nH = d.nodeStartH + dy; }
        else if (p === 'sw') { nW = d.nodeStartW - dx; nH = d.nodeStartH + dy; }
        else if (p === 'ne') { nW = d.nodeStartW + dx; nH = d.nodeStartH - dy; }
        else if (p === 'nw') { nW = d.nodeStartW - dx; nH = d.nodeStartH - dy; }

        if (lockAspect || !!n.image) {
          const diffW = Math.abs(nW - d.nodeStartW);
          const diffH = Math.abs(nH - d.nodeStartH);
          let scale = 1;
          if (diffW / d.nodeStartW > diffH / d.nodeStartH) {
            scale = nW / d.nodeStartW;
          } else {
            scale = nH / d.nodeStartH;
          }
          nW = d.nodeStartW * scale;
          nH = d.nodeStartH * scale;
        }

        nW = Math.max(NODE_MIN_SIZE, nW);
        nH = Math.max(NODE_MIN_SIZE, nH);

        if ((lockAspect || !!n.image) && (nW === NODE_MIN_SIZE || nH === NODE_MIN_SIZE)) {
            const minScale = Math.max(NODE_MIN_SIZE / d.nodeStartW, NODE_MIN_SIZE / d.nodeStartH);
            nW = d.nodeStartW * minScale;
            nH = d.nodeStartH * minScale;
        }

        if (p === 'sw' || p === 'nw') nX = d.nodeStartX + d.nodeStartW - nW;
        if (p === 'ne' || p === 'nw') nY = d.nodeStartY + d.nodeStartH - nH;

        return { ...n, x: nX, y: nY, w: nW, h: nH };
      }));
    }
  }, [camera, onNodesChange, lockAspect]);

  const handleMouseUp = useCallback((e) => {
    if (dragRef.current.type === 'node') {
      if (onNodeDragEnd) {
        const node = nodes.find(n => n.id === dragRef.current.nodeId);
        onNodeDragEnd(e, node);
      }
    }
    if (dragRef.current.type === 'create') setTool('select');
    dragRef.current = { type: null };
    setIsPanning(false);
  }, [nodes, onNodeDragEnd]);
  useEffect(() => { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); }; }, [handleMouseMove, handleMouseUp]);

  const handleZoom = useCallback((d) => { if (d === 0) { setCamera(p => ({ ...p, zoom: 1 })); return; } setCamera(p => ({ ...p, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.zoom + d)) })); }, []);

  const handleFitAll = useCallback(() => {
    if (!nodes.length) return;
    const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return;
    const b = nodes.reduce((a, n) => ({ minX: Math.min(a.minX, n.x), minY: Math.min(a.minY, n.y), maxX: Math.max(a.maxX, n.x + (n.w || NODE_DEFAULT_W)), maxY: Math.max(a.maxY, n.y + (n.h || NODE_DEFAULT_H)) }), { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 });
    const pad = 80; const z = Math.min(rect.width / (b.maxX - b.minX + pad * 2), rect.height / (b.maxY - b.minY + pad * 2), 2);
    setCamera({ x: rect.width / 2 - ((b.minX + b.maxX) / 2) * z, y: rect.height / 2 - ((b.minY + b.maxY) / 2) * z, zoom: z });
  }, [nodes]);

  const handleUpload = useCallback(async (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rect = containerRef.current.getBoundingClientRect();
      const cx = (rect.width / 2 - camera.x) / camera.zoom;
      const cy = (rect.height / 2 - camera.y) / camera.zoom;
      onNodesChange(prev => [...prev, { id: Date.now().toString(), x: cx - 160, y: cy - 160, w: 320, h: 320, image: e.target.result, status: 'done', zIndex: prev.length + 1 }]);
    };
    reader.readAsDataURL(file);
  }, [camera, onNodesChange]);

  const handleMiniMapClick = useCallback((wx, wy) => { const r = containerRef.current?.getBoundingClientRect(); if (!r) return; setCamera(p => ({ ...p, x: r.width / 2 - wx * p.zoom, y: r.height / 2 - wy * p.zoom })); }, []);

  const rect2 = containerRef.current?.getBoundingClientRect();
  const viewport = rect2 ? { x: -camera.x / camera.zoom, y: -camera.y / camera.zoom, w: rect2.width / camera.zoom, h: rect2.height / camera.zoom } : { x: 0, y: 0, w: 0, h: 0 };
  const cur = isPanning ? 'grabbing' : (tool === 'hand' || spaceRef.current) ? 'grab' : 'default';

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[#0e0e0e]" style={{ cursor: cur }} onMouseDown={handleMouseDown} onContextMenu={e => e.preventDefault()}>
      {showGrid && <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: `${GRID_SIZE * camera.zoom}px ${GRID_SIZE * camera.zoom}px`,
        backgroundPosition: `${camera.x % (GRID_SIZE * camera.zoom)}px ${camera.y % (GRID_SIZE * camera.zoom)}px`
      }} />}

      <div className="absolute top-0 left-0 w-0 h-0" style={{ transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`, transformOrigin: '0 0' }}>
        {nodes.map(node => <CanvasNode key={node.id} node={node} zoom={camera.zoom} isSelected={selectedId === node.id} onSelect={setSelectedId}
          onDragStart={handleNodeDragStart} onResizeStart={handleResizeStart} onMetaUpdate={handleMetaUpdate} onAction={(a, n) => a === 'crop' ? setCropNode(n) : onNodeAction(a, n)} onDoubleClick={onDoubleClickNode} />)}
      </div>

      {/* 屏幕坐标浮动操作栏 */}
      {selectedId && (() => {
        const sn = nodes.find(n => n.id === selectedId);
        if (!sn || sn.hidden) return null;
        if (sn.status === 'pending' || sn.status === 'running') return null;

        const sx = sn.x * camera.zoom + camera.x;
        const sy = sn.y * camera.zoom + camera.y;
        const sw = (sn.w || NODE_DEFAULT_W) * camera.zoom;
        const barX = sx + sw / 2;
        let barY = sy - 12;

        return (
          <div className="property-bar-container absolute flex flex-col items-center gap-3 z-50 pointer-events-none"
            style={{ left: barX, top: barY, transform: 'translateX(-50%) translateY(-100%)' }}>

            {/* 核心属性调节栏 (仅文字/形状) */}
            {(sn.type === 'text' || sn.type === 'rect') && (
              <PropertyBar node={sn} onChange={(meta) => handleMetaUpdate(sn.id, meta)} />
            )}

            {/* 常规操作栏 (仅图片/形状显示，文本隐藏) */}
            {sn.type !== 'text' && (
              <div className="flex items-center gap-0.5 bg-[#1e1e1e]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 px-1.5 py-1 pointer-events-auto w-max"
                onMouseDown={e => e.stopPropagation()}>
                <span className="px-2.5 py-1.5 text-[11px] text-white/40 flex items-center gap-1.5 select-none whitespace-nowrap shrink-0">
                  {sn.type === 'rect' ? <Square size={14} /> : <ImageIcon size={14} />}
                  <span>{sn.realW ? `${sn.realW}×${sn.realH}` : `${Math.round(sn.w)}×${Math.round(sn.h)}`}</span>
                </span>
                {[{ icon: <Download size={14} />, label: '下载', action: 'download' }, { icon: <Maximize2 size={14} />, label: '全屏', action: 'fullscreen' }, { icon: <Crop size={14} />, label: '裁剪', action: 'crop' }, { icon: <Trash2 size={14} />, label: '删除', action: 'delete', danger: true }].map((a, i) => {
                  if (a.action === 'crop' && !sn.image) return null;
                  if (a.action === 'fullscreen' && !sn.image) return null;
                  return (
                    <button key={i} onClick={() => a.action === 'crop' ? setCropNode(sn) : onNodeAction(a.action, sn)}
                      className={`px-2.5 py-1.5 text-[12px] flex items-center gap-1.5 rounded-xl transition-colors whitespace-nowrap shrink-0 ${a.danger ? 'text-red-400 hover:bg-red-500/15' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                      {a.icon}<span>{a.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      <Toolbar zoom={camera.zoom} onZoom={handleZoom} onFitAll={handleFitAll} showGrid={showGrid} onToggleGrid={() => setShowGrid(p => !p)}
        tool={tool} onToolChange={setTool} lockAspect={lockAspect} onToggleLock={() => setLockAspect(p => !p)} onFullscreen={onToggleImmersive}
        showLayer={showLayer} onToggleLayer={() => setShowLayer(p => !p)} onUpload={handleUpload} />

      {showLayer && (
        <LayerPanel
          nodes={nodes}
          onNodesChange={onNodesChange}
          onSelect={setSelectedId}
          selectedId={selectedId}
          onClose={() => setShowLayer(false)}
        />
      )}

      <MiniMap nodes={nodes} viewport={viewport} onClick={handleMiniMapClick} />

      {cropNode && (
        <CropModal
          node={cropNode}
          onClose={() => setCropNode(null)}
          onCropDone={(newDataUrl) => {
            onNodesChange(prev => prev.map(n =>
              n.id === cropNode.id
                ? { ...n, image: newDataUrl }
                : n
            ));
            setCropNode(null);
          }}
        />
      )}

      {nodes.length === 0 && <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-5"><Layers size={32} className="text-white/20" /></div>
        <h3 className="text-white/30 text-lg font-medium mb-2">无限画布</h3>
        <p className="text-white/15 text-sm">输入提示词，生成的图片将显示在画布上</p>
      </div>}
    </div>
  );
});

export { getNewNodePositions, NODE_DEFAULT_W, NODE_DEFAULT_H };
export default InfiniteCanvas;
