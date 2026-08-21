import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from '@iconify/react';

interface BgMaskEditorProps {
  originalSrc: string; // 原图 dataURL
  removedSrc: string;  // 抠图透明版 dataURL
  onConfirm: (resultDataUrl: string) => void;
  onCancel: () => void;
}

/**
 * 抠图手动微调编辑器
 * - 白色画笔 = 保留（恢复 alpha）
 * - 黑色画笔 = 擦除（alpha 置 0，显示红色提示）
 * - 画笔大小 5~50px
 * - 撤销 / 重置
 */
const BgMaskEditor: React.FC<BgMaskEditorProps> = ({ originalSrc, removedSrc, onConfirm, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [brushSize, setBrushSize] = useState(20);
  const [mode, setMode] = useState<'keep' | 'erase'>('keep'); // keep=保留(白) erase=擦除(黑)
  const [history, setHistory] = useState<ImageData[]>([]);

  // 内部缓存：原图、当前 mask（抠图结果 RGBA）、绘制状态
  const originalRef = useRef<HTMLImageElement | null>(null);
  const maskRef = useRef<ImageData | null>(null);
  const initialMaskRef = useRef<ImageData | null>(null); // 自动抠图结果（用于重置）
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  // 加载原图和抠图结果，初始化 mask
  useEffect(() => {
    let cancelled = false;
    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = src;
      });

    (async () => {
      try {
        const [orig, removed] = await Promise.all([loadImage(originalSrc), loadImage(removedSrc)]);
        if (cancelled) return;
        const w = orig.naturalWidth;
        const h = orig.naturalHeight;

        // 从抠图结果读取 RGBA（含 alpha mask）
        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        const tctx = tmp.getContext('2d')!;
        tctx.drawImage(removed, 0, 0, w, h);
        const removedData = tctx.getImageData(0, 0, w, h);

        // 确保与原图尺寸一致
        const maskData = new ImageData(w, h);
        maskData.data.set(removedData.data);

        originalRef.current = orig;
        maskRef.current = maskData;
        initialMaskRef.current = new ImageData(
          new Uint8ClampedArray(maskData.data),
          w,
          h
        );
        setCanvasSize({ w, h });
        setHistory([]);
        setReady(true);
      } catch (err) {
        console.error('mask editor init failed', err);
      }
    })();

    return () => { cancelled = true; };
  }, [originalSrc, removedSrc]);

  // 渲染：原图 + 红色 overlay 标记已擦除区域
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalRef.current || !maskRef.current) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;

    // 1. 画原图
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(originalRef.current, 0, 0, w, h);

    // 2. 对 alpha=0 的像素叠加红色半透明
    const mask = maskRef.current;
    const data = mask.data;
    const overlay = ctx.getImageData(0, 0, w, h);
    const od = overlay.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) {
        // 已擦除区域 → 红色半透明
        od[i] = 255;
        od[i + 1] = 60;
        od[i + 2] = 60;
        od[i + 3] = 90; // 半透明红色
      }
    }
    ctx.putImageData(overlay, 0, 0);
  }, []);

  useEffect(() => {
    if (ready) render();
  }, [ready, render]);

  // 坐标换算（CSS 缩放 → canvas 实际坐标）
  const getCanvasPoint = (e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height);
    return { x, y };
  };

  // 应用一笔（圆点）
  const applyDot = (x: number, y: number) => {
    const mask = maskRef.current;
    if (!mask) return;
    const w = mask.width;
    const h = mask.height;
    const data = mask.data;
    const r = brushSize / 2;
    const keep = mode === 'keep'; // keep → alpha 恢复 255；erase → alpha 置 0
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || px >= w || py < 0 || py >= h) continue;
        if (dx * dx + dy * dy <= r * r) {
          const idx = (py * w + px) * 4;
          data[idx + 3] = keep ? 255 : 0;
        }
      }
    }
  };

  // 在两点之间画线（插值，避免快速移动出现断点）
  const applyLine = (x0: number, y0: number, x1: number, y1: number) => {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      applyDot(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !maskRef.current) return;
    // 保存历史
    const snapshot = new ImageData(
      new Uint8ClampedArray(maskRef.current.data),
      maskRef.current.width,
      maskRef.current.height
    );
    setHistory((prev) => [...prev.slice(-19), snapshot]); // 最多保留 20 步
    isDrawingRef.current = true;
    const pt = getCanvasPoint(e);
    lastPointRef.current = pt;
    applyDot(pt.x, pt.y);
    render();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingRef.current) return;
    const pt = getCanvasPoint(e);
    if (lastPointRef.current) {
      applyLine(lastPointRef.current.x, lastPointRef.current.y, pt.x, pt.y);
    }
    lastPointRef.current = pt;
    render();
  };

  const handleMouseUp = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleUndo = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      maskRef.current = new ImageData(
        new Uint8ClampedArray(last.data),
        last.width,
        last.height
      );
      render();
      return prev.slice(0, -1);
    });
  };

  const handleReset = () => {
    if (initialMaskRef.current) {
      maskRef.current = new ImageData(
        new Uint8ClampedArray(initialMaskRef.current.data),
        initialMaskRef.current.width,
        initialMaskRef.current.height
      );
      setHistory([]);
      render();
    }
  };

  // 确认：将当前 mask 输出为透明版 dataURL（保留 alpha 通道）
  const handleConfirm = () => {
    if (!maskRef.current) return;
    const w = canvasSize.w;
    const h = canvasSize.h;
    const mask = maskRef.current;
    const id = new ImageData(new Uint8ClampedArray(mask.data), w, h);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d')!.putImageData(id, 0, 0);
    onConfirm(out.toDataURL('image/png')); // 透明版（alpha 保留）
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <span className="animate-pulse">加载编辑区中...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-100 rounded-xl">
        {/* 画笔模式 */}
        <div className="flex bg-white rounded-lg p-1 shadow-inner">
          <button
            onClick={() => setMode('keep')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all ${
              mode === 'keep' ? 'bg-white shadow-sm text-slate-700 ring-1 ring-slate-300' : 'text-slate-400'
            }`}
            title="白色画笔 = 保留（恢复被误删的区域）"
          >
            <span className="w-3 h-3 rounded-full bg-white border border-slate-400"></span>
            保留
          </button>
          <button
            onClick={() => setMode('erase')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all ${
              mode === 'erase' ? 'bg-white shadow-sm text-slate-700 ring-1 ring-slate-300' : 'text-slate-400'
            }`}
            title="黑色画笔 = 擦除（去掉残留的背景）"
          >
            <span className="w-3 h-3 rounded-full bg-black"></span>
            擦除
          </button>
        </div>

        {/* 画笔大小 */}
        <div className="flex items-center gap-2 flex-1 min-w-[140px]">
          <span className="text-xs font-bold text-slate-500 shrink-0">大小</span>
          <input
            type="range"
            min={5}
            max={50}
            step={1}
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs font-mono text-slate-500 w-8 text-right">{brushSize}px</span>
        </div>

        {/* 撤销 / 重置 */}
        <button
          onClick={handleUndo}
          disabled={history.length === 0}
          className="px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-bold flex items-center gap-1 shadow-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon icon="lucide:undo-2" className="w-4 h-4" /> 撤销
        </button>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-bold flex items-center gap-1 shadow-sm hover:bg-slate-50"
        >
          <Icon icon="lucide:rotate-ccw" className="w-4 h-4" /> 重置
        </button>
      </div>

      {/* 图例提示 */}
      <div className="flex items-center gap-4 text-xs text-slate-500 px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-400/60"></span> 红色 = 将被移除（透明）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-white border border-slate-300"></span> 正常 = 保留
        </span>
      </div>

      {/* Canvas 编辑区 */}
      <div className="rounded-xl overflow-hidden border-2 border-slate-300 bg-white flex items-center justify-center relative">
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className="max-w-full max-h-[55vh] w-auto h-auto cursor-crosshair touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* 底部操作 */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleConfirm}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] text-white font-bold text-sm shadow-md hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Icon icon="lucide:check" className="w-4 h-4" /> 确认微调
        </button>
      </div>
    </div>
  );
};

export default BgMaskEditor;
