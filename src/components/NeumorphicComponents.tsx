import React, { ReactNode, useRef } from 'react';
import { Icon } from '@iconify/react';

// Common base styles
const BASE_BG = 'bg-[#FFF5F5]';
const TEXT_COLOR = 'text-[#FF6B6B]';
const ACCENT_COLOR = 'text-[#4ECDC4]';

// Shadow styles - 珊瑚粉和薄荷绿主题
const SHADOW_OUT = 'shadow-[6px_6px_12px_rgba(255,107,107,0.15),-6px_-6px_12px_rgba(255,255,255,0.8)]';
const SHADOW_IN = 'shadow-[inset_4px_4px_8px_0_rgba(255,107,107,0.1),inset_-4px_-4px_8px_0_rgba(255,255,255,0.9)]';
const ACCENT_SHADOW = 'shadow-[4px_4px_8px_rgba(78,205,196,0.2),-4px_-4px_8px_rgba(255,255,255,0.7)]';

interface Props {
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}

export const NeuCard: React.FC<Props> = ({ children, className = '' }) => (
  <div className={`${BASE_BG} ${SHADOW_OUT} rounded-2xl p-6 ${className}`}>
    {children}
  </div>
);

export const NeuButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }> = ({ children, className = '', active, disabled, ...props }) => (
  <button
    disabled={disabled}
    {...props}
    className={`
      ${BASE_BG} 
      ${active ? SHADOW_IN : SHADOW_OUT} 
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:shadow-[inset_4px_4px_8px_0_rgba(255,107,107,0.15),inset_-4px_-4px_8px_0_rgba(255,255,255,0.9)] transform active:scale-[0.98]'}
      rounded-full px-3 py-1.5 md:px-6 md:py-2 font-bold text-[#FF6B6B] transition-all duration-200
      border-2 border-transparent hover:border-[#FF6B6B]/20
      ${className}
    `}
  >
    {children}
  </button>
);

export const NeuInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={`
      ${BASE_BG} ${SHADOW_IN}
      rounded-xl px-4 py-3 outline-none text-[#FF6B6B]
      focus:ring-2 focus:ring-[#FF6B6B]/30 transition-all
      placeholder-[#FF6B6B]/40
      ${props.className}
    `}
  />
);

export const NeuSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <div className={`relative ${props.className}`}>
    <select
      {...props}
      className={`
        appearance-none w-full
        ${BASE_BG} ${SHADOW_IN}
        rounded-xl px-4 py-3 outline-none text-[#FF6B6B]
        focus:ring-2 focus:ring-[#FF6B6B]/30 transition-all
        cursor-pointer
      `}
    />
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#FF6B6B]/60">
      <Icon icon="lucide:chevron-down" className="h-4 w-4" />
    </div>
  </div>
);

export const NeuRange: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string, valueDisplay?: string }> = ({ label, valueDisplay, ...props }) => (
  <div className="flex flex-col gap-2 w-full">
    {(label || valueDisplay) && (
      <div className="flex justify-between px-1">
        <span className="text-sm font-semibold text-slate-500">{label}</span>
        <span className="text-sm font-bold text-slate-600">{valueDisplay}</span>
      </div>
    )}
    <div className={`h-8 rounded-full ${SHADOW_IN} flex items-center px-2`}>
      <input
        type="range"
        {...props}
        className="w-full h-2 bg-transparent appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#FF6B6B] [&::-webkit-slider-thumb]:shadow-md"
      />
    </div>
  </div>
);

export const NeuFileUpload: React.FC<{ onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, accept?: string, children?: ReactNode, className?: string }> = ({ onChange, accept, children, className }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e);
    // Clear the input value to allow selecting the same file again
    if (e.target) {
        e.target.value = '';
    }
  };

  return (
    <div className={className}>
      <label 
        className={`
          ${BASE_BG} ${SHADOW_OUT}
          rounded-xl p-6 cursor-pointer
          flex flex-col items-center justify-center gap-3
          hover:transform hover:-translate-y-1 transition-all duration-300
          active:shadow-[inset_4px_4px_8px_0_rgba(255,107,107,0.15),inset_-4px_-4px_8px_0_rgba(255,255,255,0.9)] active:translate-y-0
          border-2 border-transparent hover:border-[#FF6B6B]/30
          group
        `}
      >
        <input
          type="file"
          onChange={handleChange}
          accept={accept}
          className="hidden"
        />
        <div className="p-3 rounded-full bg-[#FFF5F5] shadow-[inset_4px_4px_8px_0_rgba(255,107,107,0.1),inset_-4px_-4px_8px_0_rgba(255,255,255,0.9)] group-hover:shadow-[6px_6px_12px_rgba(255,107,107,0.15),-6px_-6px_12px_rgba(255,255,255,0.8)] transition-all duration-300">
          <Icon icon="lucide:upload" className="w-8 h-8 text-[#FF6B6B] group-hover:text-[#FF5252] group-hover:scale-110 transition-all" />
        </div>
        <span className="font-bold text-[#FF6B6B]/70 group-hover:text-[#FF6B6B]">{children || 'Upload File'}</span>
      </label>
    </div>
  );
};

export const NeuModal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#FF6B6B]/20 backdrop-blur-sm">
      <div className="bg-[#FFF5F5] rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out] border border-[#FF6B6B]/10">
        <div className="flex justify-between items-center p-6 border-b border-slate-300">
          <h3 className="text-xl font-bold text-slate-700">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <Icon icon="lucide:x" className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};
