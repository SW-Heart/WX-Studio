import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, HelpCircle, X, Info, CheckCircle2 } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) => {
  if (!isOpen) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-[#121212] border border-white/10 rounded-2xl w-full ${maxWidth} shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200`}
           onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1.5 rounded hover:bg-white/10 shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, message, confirmText = '确定', cancelText = '取消', type = 'danger' }) => {
  if (!isOpen) return null;

  const themes = {
    danger: {
      icon: <AlertCircle className="text-red-400" size={24} />,
      btn: 'bg-red-500 hover:bg-red-600 shadow-red-500/20',
      bg: 'bg-red-500/10'
    },
    warning: {
      icon: <HelpCircle className="text-orange-400" size={24} />,
      btn: 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20',
      bg: 'bg-orange-500/10'
    },
    info: {
      icon: <Info className="text-blue-400" size={24} />,
      btn: 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20',
      bg: 'bg-blue-500/10'
    }
  };

  const theme = themes[type] || themes.danger;

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
           onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl ${theme.bg} flex items-center justify-center shrink-0`}>
              {theme.icon}
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-white mb-1">{title}</h3>
              <p className="text-sm text-white/50 leading-relaxed whitespace-pre-wrap">{message}</p>
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4 bg-white/[0.02] flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-white/5 text-white/60 text-sm font-medium hover:bg-white/10 hover:text-white transition-all"
          >
            {cancelText}
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className={`flex-1 py-2 rounded-lg text-white text-sm font-bold shadow-lg transition-all hover:opacity-90 ${theme.btn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export const AlertDialog = ({ isOpen, onClose, title, message, type = 'info' }) => {
  if (!isOpen) return null;

  const themes = {
    error: {
      icon: <XCircle className="text-red-400" size={24} />,
      btn: 'bg-red-500',
      bg: 'bg-red-500/10'
    },
    success: {
      icon: <CheckCircle2 className="text-green-400" size={24} />,
      btn: 'bg-green-500',
      bg: 'bg-green-500/10'
    },
    info: {
      icon: <Info className="text-blue-400" size={24} />,
      btn: 'bg-blue-500',
      bg: 'bg-blue-500/10'
    }
  };

  const theme = themes[type] || themes.info;

  return createPortal(
    <div className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
           onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${theme.bg} flex items-center justify-center shrink-0`}>
              {theme.icon}
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-white mb-1">{title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-white/[0.02]">
          <button 
            onClick={onClose}
            className={`w-full py-2 rounded-lg text-white text-sm font-bold shadow-lg hover:opacity-90 transition-all ${theme.btn}`}
          >
            知道了
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export const PromptDialog = ({ isOpen, onClose, onConfirm, title, message, placeholder, defaultValue = '', confirmText = '确定', cancelText = '取消' }) => {
  const [value, setValue] = React.useState(defaultValue);
  React.useEffect(() => { if (isOpen) setValue(defaultValue); }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10002] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
           onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-base font-bold text-white mb-1">{title}</h3>
          {message && <p className="text-sm text-white/50 mb-4">{message}</p>}
          <input 
            autoFocus
            type="text" 
            value={value} 
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onConfirm(value); onClose(); } }}
            placeholder={placeholder}
            className="w-full h-11 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 text-sm text-white focus:border-[#FF8A3D] focus:outline-none"
          />
        </div>
        <div className="px-6 py-4 bg-white/[0.02] flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-white/5 text-white/60 text-sm font-medium hover:bg-white/10 hover:text-white transition-all">
            {cancelText}
          </button>
          <button 
            onClick={() => { onConfirm(value); onClose(); }}
            className="flex-1 py-2 rounded-lg bg-gradient-to-r from-[#FF8A3D] to-[#E65100] text-white text-sm font-bold shadow-lg hover:opacity-90 transition-all"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const XCircle = ({ className, size }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);
