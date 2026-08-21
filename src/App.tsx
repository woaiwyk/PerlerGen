
import React, { useState, useEffect, useRef } from 'react';
import { NeuCard, NeuButton, NeuInput, NeuSelect, NeuModal, NeuFileUpload, NeuRange } from './components/NeumorphicComponents';
import { processImageToPattern } from './services/imageProcessor';
import { analyzeBeadPattern } from './services/gemini';
import { ExportController } from './services/ExportController';
import { PatternData, AIAnalysis, BeadColor } from './types';

import { translations, Language } from './translations';
import { ironPresets, IronPresetKey } from './config/ironPresets';
import { usePalette } from './context/PaletteContext';
import { parsePaletteCSV } from './services/csvUtils';
import { ImageCropper } from './components/ImageCropper';
import BgMaskEditor from './components/BgMaskEditor';
import { FreeDrawEditor } from './components/FreeDrawEditor';
import { IronGuide } from './components/IronGuide';
import { Icon } from '@iconify/react';
import { Logger } from './services/logger';
import { ApiService, StatsResponse } from './services/api';
import { none, cartoonify, outline, mosaic } from './utils/preprocess';
import { removeBg, compositeWhiteBg } from './utils/removeBackground';

// 作品风格定义
const ART_STYLES = [
  { id: 'cartoon', icon: '🎨', name: '卡通风格', desc: '人像/宠物变卡通', uploadHint: '上传一张人像或宠物照片，我们将把它变成卡通拼豆' },
  { id: 'outline', icon: '✏️', name: '轮廓风格', desc: 'LOGO/建筑/文字提取轮廓', uploadHint: '上传LOGO、建筑或文字图片，我们将提取轮廓做成拼豆' },
  { id: 'mosaic', icon: '🧩', name: '马赛克风格', desc: '风景/抽象大色块重构', uploadHint: '上传风景或抽象图片，我们将用大色块重构画面' },
  { id: 'original', icon: '📷', name: '原图直出', desc: '像素画/图标直接生成', uploadHint: '上传像素画或简单图标，我们将直接生成拼豆图纸' },
] as const;

type ArtStyleKey = (typeof ART_STYLES)[number]['id'];

const App = () => {
  const [language, setLanguage] = useState<Language>('zh'); // Default to Chinese
  const t = translations[language];
  const siteLabel = (typeof window !== 'undefined' && window.location.hostname) ? window.location.hostname : t.appTitle;
  
  // Context
  const { allPalettes, selectedPaletteId, activePalette, setSelectedPaletteId, addCustomPalette, removeCustomPalette } = usePalette();

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  
  // Grid Dimensions State - 默认 29×29
  const [gridWidth, setGridWidth] = useState<number>(ironPresets.lightIron.gridSize);
  const [gridHeight, setGridHeight] = useState<number>(ironPresets.lightIron.gridSize);
  const [lockRatio, setLockRatio] = useState<boolean>(true);
  const [imgAspectRatio, setImgAspectRatio] = useState<number>(1);

  // Palette State - MOVED TO CONTEXT
  // const [selectedPaletteId, setSelectedPaletteId] = useState<string>(AVAILABLE_PALETTES[0].id);

  const [patternData, setPatternData] = useState<PatternData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [beadShape, setBeadShape] = useState<'round' | 'square'>('square');
  const [denoiseLevel, setDenoiseLevel] = useState<number>(ironPresets.lightIron.denoiseLevel);
  const [appliedDenoiseLevel, setAppliedDenoiseLevel] = useState<number>(ironPresets.lightIron.denoiseLevel);
  const [ironPreset, setIronPreset] = useState<IronPresetKey>('lightIron');
  const [artStyle, setArtStyle] = useState<ArtStyleKey>('cartoon');
  const [preprocessedPreview, setPreprocessedPreview] = useState<string | null>(null);
  const [preprocessedFull, setPreprocessedFull] = useState<string | null>(null);

  // 抠图状态
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [bgRemovedSrc, setBgRemovedSrc] = useState<string | null>(null); // 合成白底版（预览用）
  const [bgRemovedTransparentSrc, setBgRemovedTransparentSrc] = useState<string | null>(null); // 透明版（微调用）
  const [bgRemoveFailed, setBgRemoveFailed] = useState(false);
  const [isMaskEditing, setIsMaskEditing] = useState(false);

  // 生成流程状态（三步）
  const [generationStep, setGenerationStep] = useState<'idle' | 'step1' | 'step2' | 'step3' | 'done'>('idle');
  const [generateNotice, setGenerateNotice] = useState<string | null>(null);

  // Debounce Denoise Level
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedDenoiseLevel(denoiseLevel);
    }, 500);
    return () => clearTimeout(timer);
  }, [denoiseLevel]);

  // CSV Import State
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvName, setCsvName] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // Canvas Interaction State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  // Material State
  const [hiddenBeadIds, setHiddenBeadIds] = useState<Set<string>>(new Set());

  // Edit Mode State
  const [pickingColorFor, setPickingColorFor] = useState<{ 
    type: 'global' | 'single', 
    targetId?: string, // for global replace
    x?: number, // for single replace
    y?: number,
    currentBead?: BeadColor
  } | null>(null);
  const [colorSearch, setColorSearch] = useState('');

  // Split Export State
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitConfig, setSplitConfig] = useState({ width: 29, height: 29, padding: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  
  // Dual Export State
  const [isDualExport, setIsDualExport] = useState(false);

  // Material Export State
  const [showMaterialExportModal, setShowMaterialExportModal] = useState(false);
  const [excludeHiddenMaterials, setExcludeHiddenMaterials] = useState(true);

  // Info Modal State
  const [infoModal, setInfoModal] = useState<{ isOpen: boolean, title: string, content: string }>({
    isOpen: false,
    title: '',
    content: ''
  });
  const closeInfoModal = () => setInfoModal(prev => ({ ...prev, isOpen: false }));

  // Free Draw State
  const [isFreeDrawMode, setIsFreeDrawMode] = useState(false);

  const toPositiveInt = (value: number | string, fallback: number, min = 1) => {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
  };

  const getSafeSplitConfig = (config = splitConfig) => ({
    width: toPositiveInt(config.width, 29, 10),
    height: toPositiveInt(config.height, 29, 10),
    padding: toPositiveInt(config.padding, 0, 0),
  });

  const isInteractiveTarget = (target: EventTarget | null) => {
    return target instanceof HTMLElement && !!target.closest('button, input, select, textarea, label, a');
  };

  // Initialize Logger
  useEffect(() => {
    Logger.log('page_view', '请求了页面');
  }, []);

  // Stats State
  const [stats, setStats] = useState<StatsResponse | null>(null);

  // Fetch Stats
  useEffect(() => {
    ApiService.getStats().then(data => {
      if (data) {
        setStats(data);
      }
    });
  }, []);

  // HandlersDerived state for active palette - MOVED TO CONTEXT
  // const activePalette = AVAILABLE_PALETTES.find(p => p.id === selectedPaletteId) || AVAILABLE_PALETTES[0];

  // File Upload Handler
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Logger.log('upload_image', { fileName: file.name, fileSize: file.size });
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setOriginalImageSrc(result);
        setIsCropping(true); // Trigger crop flow
        
        // Reset states
        setPatternData(null); 
        setAiAnalysis(null);
        setHiddenBeadIds(new Set()); 
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setImageSrc(null); // Clear current processed image until crop is done
        setBgRemovedSrc(null);
        setBgRemovedTransparentSrc(null);
        setBgRemoveFailed(false);
        setGenerationStep('idle');
        setGenerateNotice(null);
      };
      reader.onerror = (e) => {
        Logger.log('upload_image_error', { error: String(e.target?.error) });
      };
      reader.readAsDataURL(file);
    }
  };

  // 加载示例图片并触发图纸生成流程
  const handleSampleImage = async () => {
    try {
      const resp = await fetch('/samples/sample-cat.png');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setOriginalImageSrc(dataUrl);
        setImageSrc(dataUrl);
        // 重置状态，等同手动上传
        setPatternData(null);
        setAiAnalysis(null);
        setHiddenBeadIds(new Set());
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setIsCropping(false);
        setBgRemovedSrc(null);
        setBgRemovedTransparentSrc(null);
        setBgRemoveFailed(false);
        setGenerationStep('idle');
        setGenerateNotice(null);
        Logger.log('load_sample_image', { source: 'sample-cat.png' });
      };
      reader.onerror = () => {
        alert('示例图片读取失败');
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('load sample image failed', err);
      alert('示例图片加载失败');
    }
  };

  // 智能抠图
  const handleRemoveBg = async () => {
    if (!imageSrc || isRemovingBg) return;
    setIsRemovingBg(true);
    setBgRemoveFailed(false);
    setBgRemovedSrc(null);
    setBgRemovedTransparentSrc(null);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = imageSrc;
      });
      const transparentCanvas = await removeBg(img); // 透明版
      const whiteCanvas = compositeWhiteBg(transparentCanvas); // 合成白底版
      setBgRemovedTransparentSrc(transparentCanvas.toDataURL('image/png'));
      setBgRemovedSrc(whiteCanvas.toDataURL('image/png'));
    } catch (err) {
      console.error('remove bg failed', err);
      setBgRemoveFailed(true);
    } finally {
      setIsRemovingBg(false);
    }
  };

  // 手动微调确认：保存微调结果
  const handleMaskConfirm = (resultDataUrl: string) => {
    setBgRemovedTransparentSrc(resultDataUrl); // 透明版
    // 合成为白底预览
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setBgRemovedSrc(canvas.toDataURL('image/png'));
    };
    img.src = resultDataUrl;
    setIsMaskEditing(false);
  };

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        Logger.log('upload_csv', { fileName: file.name, fileSize: file.size });
        setCsvFile(file);
        // Default name to filename without extension
        if (!csvName) {
            setCsvName(file.name.replace(/\.[^/.]+$/, ""));
        }
    }
  };

  const handleImportCsv = () => {
      if (!csvFile || !csvName) return;
      const reader = new FileReader();
      reader.onload = (e) => {
          const content = e.target?.result as string;
          const colors = parsePaletteCSV(content);
          if (colors.length > 0) {
              addCustomPalette(csvName, colors);
              setShowCsvModal(false);
              setCsvFile(null);
              setCsvName('');
              Logger.log('import_csv_success', { paletteName: csvName, colorCount: colors.length });
              alert(`Imported ${colors.length} colors successfully!`);
          } else {
              Logger.log('import_csv_failed', { paletteName: csvName, reason: 'Parse failed' });
              alert('Failed to parse CSV. Please check the format.');
          }
      };
      reader.onerror = (e) => {
          Logger.log('import_csv_error', { error: String(e.target?.error) });
      };
      reader.readAsText(csvFile);
  };

  const handleCropConfirm = (croppedSrc: string) => {
    setImageSrc(croppedSrc);
    setIsCropping(false);
  };

  const handleCropCancel = () => {
    if (originalImageSrc) {
        setImageSrc(originalImageSrc);
    }
    setIsCropping(false);
  };

  // When image loads, calculate aspect ratio and reset height
  useEffect(() => {
    if (imageSrc) {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        setImgAspectRatio(ratio);
        if (lockRatio) {
            setGridHeight(Math.max(1, Math.round(gridWidth / ratio)));
        }
      };
      img.src = imageSrc;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  // 预处理预览：根据当前风格对图片做预处理，生成 200×200 预览图
  useEffect(() => {
    if (!imageSrc) {
      setPreprocessedPreview(null);
      setPreprocessedFull(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const srcW = img.width;
        const srcH = img.height;
        // 绘制到 canvas 获取 ImageData
        const canvas = document.createElement('canvas');
        canvas.width = srcW;
        canvas.height = srcH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, srcW, srcH);

        // 根据风格调用对应预处理函数
        let processed: ImageData;
        switch (artStyle) {
          case 'cartoon':
            processed = cartoonify(imageData, srcW, srcH);
            break;
          case 'outline':
            processed = outline(imageData, srcW, srcH);
            break;
          case 'mosaic':
            processed = mosaic(imageData, srcW, srcH);
            break;
          case 'original':
          default:
            processed = none(imageData);
            break;
        }

        // 生成 200×200 预览图
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = 200;
        previewCanvas.height = 200;
        const pctx = previewCanvas.getContext('2d');
        if (!pctx) return;
        // 将处理后的 ImageData 放回一个临时 canvas
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = srcW;
        tmpCanvas.height = srcH;
        const tctx = tmpCanvas.getContext('2d');
        if (!tctx) return;
        tctx.putImageData(processed, 0, 0);
        // 保存完整尺寸预处理结果（供生成流程使用）
        setPreprocessedFull(tmpCanvas.toDataURL('image/png'));
        // 等比缩放居中绘制到 200×200
        const scale = Math.min(200 / srcW, 200 / srcH);
        const dw = srcW * scale;
        const dh = srcH * scale;
        const dx = (200 - dw) / 2;
        const dy = (200 - dh) / 2;
        pctx.fillStyle = '#ffffff';
        pctx.fillRect(0, 0, 200, 200);
        pctx.imageSmoothingEnabled = true;
        pctx.drawImage(tmpCanvas, dx, dy, dw, dh);
        setPreprocessedPreview(previewCanvas.toDataURL('image/png'));
      } catch (err) {
        console.error('preprocess preview failed', err);
      }
    };
    img.src = imageSrc;
    return () => { cancelled = true; };
  }, [imageSrc, artStyle]);

  // Handle Dimension Changes
  const handleWidthChange = (val: string) => {
    const w = toPositiveInt(val, gridWidth);
    setGridWidth(w);
    if (lockRatio && imgAspectRatio > 0 && w > 0) {
        setGridHeight(Math.max(1, Math.round(w / imgAspectRatio)));
    }
  };

  const handleHeightChange = (val: string) => {
    const h = toPositiveInt(val, gridHeight);
    setGridHeight(h);
    if (lockRatio && imgAspectRatio > 0 && h > 0) {
        setGridWidth(Math.max(1, Math.round(h * imgAspectRatio)));
    }
  };

  // Handle Iron Preset Selection: 更新网格大小和去杂色强度默认值（允许用户手动覆盖）
  const handleIronPresetChange = (val: string) => {
    const key = val as IronPresetKey;
    if (!ironPresets[key]) return;
    setIronPreset(key);
    const preset = ironPresets[key];
    setGridWidth(preset.gridSize);
    if (lockRatio && imgAspectRatio > 0) {
        setGridHeight(Math.max(1, Math.round(preset.gridSize / imgAspectRatio)));
    } else {
        setGridHeight(preset.gridSize);
    }
    setDenoiseLevel(preset.denoiseLevel);
  };

  // Toggle Bead Visibility
  const toggleBeadVisibility = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering row click
    setHiddenBeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 预处理：把图片按指定风格处理，返回 dataURL（供生成流程使用）
  const preprocessToDataUrl = (src: string, style: ArtStyleKey): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const srcW = img.width;
          const srcH = img.height;
          const canvas = document.createElement('canvas');
          canvas.width = srcW;
          canvas.height = srcH;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('canvas 不可用');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, srcW, srcH);
          let processed: ImageData;
          switch (style) {
            case 'cartoon':
              processed = cartoonify(imageData, srcW, srcH);
              break;
            case 'outline':
              processed = outline(imageData, srcW, srcH);
              break;
            case 'mosaic':
              processed = mosaic(imageData, srcW, srcH);
              break;
            case 'original':
            default:
              processed = none(imageData);
              break;
          }
          const tmp = document.createElement('canvas');
          tmp.width = srcW;
          tmp.height = srcH;
          const tctx = tmp.getContext('2d');
          if (!tctx) throw new Error('canvas 不可用');
          tctx.putImageData(processed, 0, 0);
          resolve(tmp.toDataURL('image/png'));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = src;
    });
  };

  // 三步生成流程：抠图 → 预处理 → 像素化
  const handleGenerate = async () => {
    if (!imageSrc) return;
    if (generationStep === 'step1' || generationStep === 'step2' || generationStep === 'step3') return;

    setGenerateNotice(null);
    setIsProcessing(true);

    // ---- 第一步：抠图 ----
    setGenerationStep('step1');
    let workingSrc = bgRemovedSrc; // 若已有抠图结果则复用
    if (!workingSrc) {
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('图片加载失败'));
          img.src = imageSrc;
        });
        const transparentCanvas = await removeBg(img);
        const whiteCanvas = compositeWhiteBg(transparentCanvas);
        workingSrc = whiteCanvas.toDataURL('image/png');
        setBgRemovedTransparentSrc(transparentCanvas.toDataURL('image/png'));
        setBgRemovedSrc(workingSrc);
        setBgRemoveFailed(false);
      } catch (err) {
        console.error('auto remove bg failed', err);
        workingSrc = imageSrc; // 降级为原图
        setBgRemoveFailed(true);
        setGenerateNotice('⚠️ 抠图失败，已使用原图生成，效果可能受影响');
      }
    }

    // ---- 第二步：预处理 ----
    setGenerationStep('step2');
    await new Promise((r) => setTimeout(r, 50)); // 让 UI 更新
    let processedSrc: string = workingSrc;
    try {
      processedSrc = await preprocessToDataUrl(workingSrc, artStyle);
    } catch (err) {
      console.error('preprocess failed', err);
      processedSrc = workingSrc; // 降级为原图
    }

    // ---- 第三步：像素化生成 ----
    setGenerationStep('step3');
    await new Promise((r) => setTimeout(r, 50));
    try {
      const data = await processImageToPattern(
        processedSrc,
        gridWidth,
        gridHeight,
        activePalette.colors,
        appliedDenoiseLevel,
        ironPreset
      );
      setPatternData(data);
    } catch (err) {
      console.error('generate failed', err);
    } finally {
      setIsProcessing(false);
      setGenerationStep('done');
    }
  };

  const handleMaterialExport = async () => {
    if (!patternData) return;
    
    await ExportController.exportMaterialList({
        siteLabel,
        translations: t
    }, {
        patternData,
        activePaletteColors: activePalette.colors,
        hiddenBeadIds,
        excludeHiddenMaterials
    });

    setShowMaterialExportModal(false);
  };

  // Helper to recalculate counts after edits
  const recalculateCounts = (grid: BeadColor[][]): Record<string, number> => {
    const newCounts: Record<string, number> = {};
    grid.forEach(row => {
      row.forEach(bead => {
        newCounts[bead.id] = (newCounts[bead.id] || 0) + 1;
      });
    });
    return newCounts;
  };

  // Replace Logic
  const handleColorReplace = (newBead: BeadColor) => {
    if (!patternData || !pickingColorFor) return;

    const newGrid = patternData.grid.map(row => [...row]); // Deep copy grid structure

    if (pickingColorFor.type === 'global' && pickingColorFor.targetId) {
      // Replace all instances
      for (let y = 0; y < newGrid.length; y++) {
        for (let x = 0; x < newGrid[y].length; x++) {
          if (newGrid[y][x].id === pickingColorFor.targetId) {
            newGrid[y][x] = newBead;
          }
        }
      }
    } else if (pickingColorFor.type === 'single' && pickingColorFor.x !== undefined && pickingColorFor.y !== undefined) {
      // Replace single pixel
      newGrid[pickingColorFor.y][pickingColorFor.x] = newBead;
    }

    const newCounts = recalculateCounts(newGrid);
    setPatternData({
      ...patternData,
      grid: newGrid,
      counts: newCounts
    });
    
    setPickingColorFor(null);
    setColorSearch('');
  };

  const handleFreeDrawSave = (newGrid: BeadColor[][]) => {
    if (!patternData) return;
    const newCounts = recalculateCounts(newGrid);
    const newHeight = newGrid.length;
    const newWidth = newGrid.length > 0 ? newGrid[0].length : 0;
    
    setPatternData({
      ...patternData,
      grid: newGrid,
      width: newWidth,
      height: newHeight,
      counts: newCounts
    });
    // Update gridWidth/gridHeight state as well to stay in sync
    setGridWidth(newWidth);
    setGridHeight(newHeight);
    
    setIsFreeDrawMode(false);
  };

  // Mirror Flip Handler
  const handleMirrorFlip = () => {
    if (!patternData) return;
    
    // Deep clone the grid and reverse each row
    const newGrid = patternData.grid.map(row => [...row].reverse());
    
    setPatternData({
        ...patternData,
        grid: newGrid
        // Width, Height, and Counts remain the same
    });
  };

  // AI Analysis Handler
  const handleAnalyze = async () => {
    if (!imageSrc) return;
    setIsAnalyzing(true);
    const analysis = await analyzeBeadPattern(imageSrc, language);
    setAiAnalysis(analysis);
    setIsAnalyzing(false);
  };

  // Canvas Drawing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (patternData && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cellSize = 12; 
      
      canvas.width = patternData.width * cellSize;
      canvas.height = patternData.height * cellSize;

      // Clear entire canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      patternData.grid.forEach((row, y) => {
        row.forEach((bead, x) => {
          // Skip if hidden
          if (hiddenBeadIds.has(bead.id)) return;

          ctx.fillStyle = bead.hex;
          if (beadShape === 'round') {
             ctx.beginPath();
             ctx.arc(
               x * cellSize + cellSize / 2, 
               y * cellSize + cellSize / 2, 
               (cellSize / 2) - 0.5, 
               0, 
               2 * Math.PI
             );
             ctx.fill();
          } else {
             ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        });
      });

      // Overlay Grid (Inverted) - Match Export Style
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.strokeStyle = '#FFFFFF';

      // Vertical
      for (let x = 0; x <= patternData.width; x++) {
        let lineWidth = 0;
        if (x % 10 === 0) lineWidth = 1.5; // Slightly thinner for screen
        else if (x % 5 === 0) lineWidth = 0.5;
        
        if (lineWidth > 0) {
           ctx.lineWidth = lineWidth;
           ctx.beginPath();
           ctx.moveTo(x * cellSize, 0);
           ctx.lineTo(x * cellSize, canvas.height);
           ctx.stroke();
        }
      }

      // Horizontal
      for (let y = 0; y <= patternData.height; y++) {
        let lineWidth = 0;
        if (y % 10 === 0) lineWidth = 1.5;
        else if (y % 5 === 0) lineWidth = 0.5;
        
        if (lineWidth > 0) {
           ctx.lineWidth = lineWidth;
           ctx.beginPath();
           ctx.moveTo(0, y * cellSize);
           ctx.lineTo(canvas.width, y * cellSize);
           ctx.stroke();
        }
      }
      ctx.restore();
    }
  }, [patternData, beadShape, hiddenBeadIds]);

  // Zoom and Pan Handlers
  // Use ref to attach non-passive listener to prevent default scroll behavior
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (!patternData) return;
      e.preventDefault();
      const zoomSensitivity = 0.001;
      setZoom(prev => Math.min(Math.max(0.1, prev - e.deltaY * zoomSensitivity), 5));
    };

    // Passive: false is required to be able to call preventDefault()
    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [patternData]); // Re-bind when patternData changes

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!patternData) return;
    if (isInteractiveTarget(e.target)) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    hasDraggedRef.current = false;
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;
    const totalDeltaX = e.clientX - dragStartRef.current.x;
    const totalDeltaY = e.clientY - dragStartRef.current.y;
    if (Math.hypot(totalDeltaX, totalDeltaY) > 5) {
      hasDraggedRef.current = true;
    }
    setPan(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Handlers for Mobile
  const lastTouchDistance = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!patternData) return;
    if (isInteractiveTarget(e.target)) return;
    
    if (e.touches.length === 1) {
        dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        hasDraggedRef.current = false;
        setIsDragging(true);
        setLastMousePos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } else if (e.touches.length === 2) {
        hasDraggedRef.current = true;
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        lastTouchDistance.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!patternData) return;
    // Prevent default to stop scrolling/zooming the page
    // e.preventDefault(); // Note: React might complain about non-passive event, but in App.tsx it's often fine or handled via CSS touch-action

    if (e.touches.length === 1 && isDragging) {
        const deltaX = e.touches[0].clientX - lastMousePos.x;
        const deltaY = e.touches[0].clientY - lastMousePos.y;
        const totalDeltaX = e.touches[0].clientX - dragStartRef.current.x;
        const totalDeltaY = e.touches[0].clientY - dragStartRef.current.y;
        if (Math.hypot(totalDeltaX, totalDeltaY) > 5) {
          hasDraggedRef.current = true;
        }
        setPan(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
        setLastMousePos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } else if (e.touches.length === 2) {
        hasDraggedRef.current = true;
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );

        if (lastTouchDistance.current !== null) {
            const delta = dist - lastTouchDistance.current;
            const zoomSensitivity = 0.005;
            const newZoom = Math.min(Math.max(0.1, zoom + delta * zoomSensitivity), 5);
            setZoom(newZoom);
        }
        lastTouchDistance.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastTouchDistance.current = null;
  };

  // Canvas Click for Pixel Editing
  const handleCanvasClick = (e: React.MouseEvent) => {
    // Only register click if we didn't drag
    if (isDragging || hasDraggedRef.current || isInteractiveTarget(e.target)) return;
    // Small threshold to distinguish click from micro-drag
    const dist = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y);
    if (dist > 5) return;

    if (!patternData || !containerRef.current) return;

    // Calculate grid coordinates
    const rect = containerRef.current.getBoundingClientRect();
    const cellSize = 12;
    
    // Mouse relative to container center (since transformOrigin is center)
    // Actually simpler: mouse relative to container top-left
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Let's use the simpler approach: The visual offset is Pan + (GridSize * CellSize * Zoom / 2) logic.
    // Easiest way: The inner div center is at outer div center + pan.
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Coordinate relative to the center of the viewport
    const relX = mouseX - centerX;
    const relY = mouseY - centerY;
    
    // Subtract pan
    const unpannedX = relX - pan.x;
    const unpannedY = relY - pan.y;
    
    // Divide by zoom
    const unzoomedX = unpannedX / zoom;
    const unzoomedY = unpannedY / zoom;
    
    // Add back the half-size of the grid to get 0,0 at top left
    const gridPixelWidth = patternData.width * cellSize;
    const gridPixelHeight = patternData.height * cellSize;
    
    const canvasX = unzoomedX + (gridPixelWidth / 2);
    const canvasY = unzoomedY + (gridPixelHeight / 2);
    
    const gridX = Math.floor(canvasX / cellSize);
    const gridY = Math.floor(canvasY / cellSize);

    // Validate bounds
    if (gridX >= 0 && gridX < patternData.width && gridY >= 0 && gridY < patternData.height) {
      const bead = patternData.grid[gridY][gridX];
      setPickingColorFor({
        type: 'single',
        x: gridX,
        y: gridY,
        currentBead: bead
      });
    }
  };

  // Export with coordinates
  const handleDownload = async () => {
    if (!patternData) return;
    setIsExporting(true);
    Logger.log('export_pattern_start', { type: 'single', isDualExport });
    
    try {
        await ExportController.handleDownload({
            siteLabel,
            translations: t
        }, {
            patternData,
            beadShape,
            hiddenBeadIds,
            isDualExport
        });
        Logger.log('export_pattern_success');
    } catch (error) {
        console.error("Export failed", error);
        Logger.log('export_pattern_error', { error: String(error) });
        alert("Export failed");
    } finally {
        setIsExporting(false);
    }
  };

  const handleSplitDownload = async () => {
    if (!patternData) return;
    const safeSplitConfig = getSafeSplitConfig();
    setSplitConfig(safeSplitConfig);
    setIsExporting(true);
    Logger.log('export_pattern_start', { type: 'split', isDualExport, splitConfig: safeSplitConfig });

    try {
      await ExportController.exportSplitPattern({
        siteLabel,
        translations: t
      }, {
        patternData,
        beadShape,
        hiddenBeadIds,
        splitConfig: safeSplitConfig,
        isDualExport
      });
      
      setShowSplitModal(false);
      Logger.log('export_pattern_success', { type: 'split' });
    } catch (error) {
      console.error("Export failed", error);
      Logger.log('export_pattern_error', { type: 'split', error: String(error) });
      alert("Export failed");
    } finally {
      setIsExporting(false);
    }
  };


  const splitPreviewConfig = getSafeSplitConfig();

  const [showGuide, setShowGuide] = useState(true);

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center gap-6 bg-[#FFF0F0]">
      {/* Guide Banner */}
      {showGuide && (
        <div className="w-full max-w-7xl bg-gradient-to-r from-[#FF6B6B]/10 to-[#4ECDC4]/10 rounded-2xl p-4 shadow-[4px_4px_12px_rgba(255,107,107,0.1),-4px_-4px_12px_rgba(255,255,255,0.8)] border border-[#FF6B6B]/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <span className="text-[#FF6B6B] font-medium">上传图片 → 选择网格大小 → 点击生成，3 步获得你的拼豆图纸</span>
          </div>
          <button 
            onClick={() => setShowGuide(false)}
            className="text-[#FF6B6B]/60 hover:text-[#FF6B6B] transition-colors p-1"
          >
            <Icon icon="lucide:x" className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* 生成流程步骤指示器 */}
      {(generationStep === 'step1' || generationStep === 'step2' || generationStep === 'step3') && (
        <div className="w-full max-w-7xl bg-white/70 backdrop-blur rounded-2xl p-4 shadow-[4px_4px_12px_rgba(78,205,196,0.12),-4px_-4px_12px_rgba(255,255,255,0.9)] border border-[#4ECDC4]/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-4 h-4 border-2 border-[#4ECDC4] border-t-transparent rounded-full animate-spin"></span>
            <span className="font-bold text-slate-700 text-sm">
              {generationStep === 'step1' && '步骤 1/3：正在抠图...'}
              {generationStep === 'step2' && '步骤 2/3：正在预处理...'}
              {generationStep === 'step3' && '步骤 3/3：正在生成图纸...'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((n) => {
              const active = (generationStep === 'step1' && n === 1) ||
                (generationStep === 'step2' && n === 2) ||
                (generationStep === 'step3' && n === 3);
              const done = (generationStep === 'step2' && n === 1) ||
                (generationStep === 'step3' && (n === 1 || n === 2));
              return (
                <div key={n} className="flex items-center gap-2 flex-1">
                  <div className={`h-2 flex-1 rounded-full transition-all ${active ? 'bg-[#4ECDC4]' : done ? 'bg-[#4ECDC4]/50' : 'bg-slate-200'}`}></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 抠图失败降级提示 */}
      {generateNotice && (
        <div className="w-full max-w-7xl bg-orange-50 border border-orange-300 rounded-xl px-4 py-3 flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <span className="text-sm font-medium text-orange-700">{generateNotice}</span>
        </div>
      )}

      {/* Header & Language Toggle */}
      <div className="w-full max-w-7xl flex flex-col md:flex-row justify-between items-center mb-2 gap-4">
        <div className="text-center md:text-left">
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-700 tracking-tight">{t.appTitle}</h1>
            <p className="text-slate-500 font-medium text-sm md:text-base">{t.subtitle}</p>
        </div>
        
        {/* Language Toggle */}
        <div className="bg-[#e0e5ec] p-1.5 rounded-full shadow-[inset_4px_4px_8px_0_rgba(163,177,198,0.7),inset_-4px_-4px_8px_0_rgba(255,255,255,0.8)] flex">
           <button 
              onClick={() => setLanguage('zh')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${language === 'zh' ? 'bg-[#e0e5ec] shadow-[4px_4px_8px_0_rgba(163,177,198,0.7),-4px_-4px_8px_0_rgba(255,255,255,0.8)] text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
           >
              中文
           </button>
           <button 
              onClick={() => setLanguage('en')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${language === 'en' ? 'bg-[#e0e5ec] shadow-[4px_4px_8px_0_rgba(163,177,198,0.7),-4px_-4px_8px_0_rgba(255,255,255,0.8)] text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
           >
              EN
           </button>
        </div>
      </div>

      {/* 顶部区域：作品风格选择 */}
      <div className="w-full max-w-7xl flex flex-col gap-3">
        <h2 className="text-lg md:text-xl font-bold text-slate-700 flex items-center gap-2">
          <span>🎯</span>
          <span>第一步：选择作品风格</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ART_STYLES.map((style) => {
            const isActive = artStyle === style.id;
            return (
              <button
                key={style.id}
                onClick={() => setArtStyle(style.id)}
                className={`flex flex-col items-center gap-2 rounded-2xl p-4 text-center transition-all duration-200 border-2 ${
                  isActive
                    ? 'border-[#FF6B6B] bg-[#FFF5F5] shadow-[0_4px_16px_rgba(255,107,107,0.25)]'
                    : 'border-transparent bg-[#e0e5ec] hover:bg-[#e9eef5] hover:border-[#FF6B6B]/40'
                }`}
              >
                <span className="text-3xl md:text-4xl leading-none">{style.icon}</span>
                <span className={`font-bold text-sm md:text-base ${isActive ? 'text-[#FF6B6B]' : 'text-slate-700'}`}>
                  {style.name}
                </span>
                <span className="text-[11px] md:text-xs text-slate-400 leading-snug">{style.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Controls & Material List */}
        <div className="lg:col-span-4 flex flex-col gap-6 order-2 lg:order-1">
          
          {/* Controls */}
          <NeuCard className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-slate-700">{t.config}</h2>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-400 ml-2 uppercase">{t.uploadImage}</label>
              <NeuFileUpload accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleFileUpload}>
                {t.uploadImage}
              </NeuFileUpload>
              <button
                onClick={handleSampleImage}
                className="mt-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 hover:text-slate-800 font-bold py-3 px-4 transition-colors duration-200 flex items-center justify-center gap-2 text-sm"
              >
                🎨 试试示例图片
              </button>
              {imageSrc && (
                <button
                  onClick={handleRemoveBg}
                  disabled={isRemovingBg}
                  className={`mt-2 rounded-xl py-3 px-4 font-bold text-sm flex items-center justify-center gap-2 transition-colors duration-200 text-white ${
                    bgRemoveFailed
                      ? 'bg-orange-400 hover:bg-orange-500'
                      : bgRemovedSrc
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-[#4ECDC4] hover:bg-[#3ebcb4]'
                  } ${isRemovingBg ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {isRemovingBg
                    ? '⏳ 抠图中...'
                    : bgRemoveFailed
                      ? '⚠️ 抠图失败，点击重试'
                      : bgRemovedSrc
                        ? '✅ 抠图完成'
                        : '✂️ 智能抠图'}
                </button>
              )}
              {bgRemovedSrc && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full aspect-square rounded-lg overflow-hidden border border-slate-300 bg-white">
                      <img src={imageSrc} alt="原图" className="w-full h-full object-contain" />
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">原图</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full aspect-square rounded-lg overflow-hidden border-2 border-[#4ECDC4]/60 bg-white">
                      <img src={bgRemovedSrc} alt="抠图结果" className="w-full h-full object-contain" />
                    </div>
                    <span className="text-[10px] font-bold text-[#4ECDC4]">抠图后</span>
                  </div>
                </div>
              )}
              {bgRemovedSrc && (
                <p className="mt-1 text-xs font-bold text-green-600">背景已移除 ✓</p>
              )}
              {bgRemovedSrc && (
                <button
                  onClick={() => setIsMaskEditing(true)}
                  className="mt-1 w-full rounded-xl py-2.5 px-4 bg-white border-2 border-slate-300 text-slate-600 hover:text-slate-800 hover:border-slate-400 font-bold text-sm flex items-center justify-center gap-2 transition-colors duration-200"
                >
                  <Icon icon="lucide:pencil" className="w-4 h-4" /> 手动微调
                </button>
              )}
              <p className="mt-2 text-xs text-[#4ECDC4] font-medium leading-snug">
                {ART_STYLES.find((s) => s.id === artStyle)?.uploadHint}
              </p>
              {preprocessedPreview && (
                <div className="mt-3 flex flex-col items-center gap-1.5">
                  <div className="w-[200px] h-[200px] rounded-xl overflow-hidden border-2 border-[#4ECDC4]/40 bg-white flex items-center justify-center shadow-sm">
                    <img src={preprocessedPreview} alt="预处理预览" className="w-full h-full object-contain" />
                  </div>
                  <span className="text-[11px] font-bold text-[#4ECDC4]">
                    预处理预览（{ART_STYLES.find((s) => s.id === artStyle)?.name}）
                  </span>
                </div>
              )}
            </div>

            {imageSrc && (
              <>
                <div className="flex flex-col gap-1">
                   <label className="text-xs font-bold text-slate-400 ml-2 uppercase">{t.palette}</label>
                   <div className="flex gap-2 items-center">
                     <NeuSelect 
                        value={selectedPaletteId} 
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'import_new') {
                                setShowCsvModal(true);
                            } else {
                                setSelectedPaletteId(val);
                            }
                        }}
                        className="flex-1"
                     >
                        {allPalettes.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.id.startsWith('custom_') ? `(${t.custom})` : ''}
                          </option>
                        ))}
                        <option value="import_new" className="font-bold text-blue-600">
                          + {t.importPalette}
                        </option>
                     </NeuSelect>
                     
                     {selectedPaletteId.startsWith('custom_') && (
                       <button
                         onClick={() => {
                           if (window.confirm(t.deletePaletteConfirm)) {
                             removeCustomPalette(selectedPaletteId);
                           }
                         }}
                         className="p-2 text-red-400 hover:text-red-600 transition-colors"
                         title={t.deletePalette}
                       >
                         <Icon icon="lucide:trash-2" className="w-5 h-5" />
                       </button>
                     )}
                   </div>
                </div>

                {/* Iron Preset Selector */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-2">🔥 烫法选择</label>
                    <NeuSelect
                        value={ironPreset}
                        onChange={(e) => handleIronPresetChange(e.target.value)}
                    >
                        {(Object.keys(ironPresets) as IronPresetKey[]).map((key) => (
                            <option key={key} value={key}>
                                {ironPresets[key].label} — {ironPresets[key].description}
                            </option>
                        ))}
                    </NeuSelect>
                    <p className="text-[11px] text-slate-400 ml-2">不同烫法生成不同图纸，请根据成品用途选择</p>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-end px-1">
                       <label className="text-xs font-bold text-slate-400 uppercase ml-1">{t.gridSize}</label>
                       <button 
                            onClick={() => setLockRatio(!lockRatio)}
                            className={`p-1.5 rounded-lg transition-all text-xs flex items-center gap-1 ${lockRatio ? 'bg-slate-300 text-slate-700 shadow-inner' : 'text-slate-400 hover:text-slate-600'}`}
                            title={lockRatio ? t.ratioLocked : t.ratioUnlocked}
                        >
                            {lockRatio ? (
                                <><Icon icon="lucide:lock" className="w-3 h-3" /> {t.ratioLocked}</>
                            ) : (
                                <><Icon icon="lucide:unlock" className="w-3 h-3" /> {t.ratioUnlocked}</>
                            )}
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                             <NeuInput 
                                type="number" 
                                value={gridWidth} 
                                onChange={(e) => handleWidthChange(e.target.value)}
                                min="1"
                                className="text-center font-mono w-full pr-8"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">{t.width}</span>
                        </div>
                        <span className="text-slate-400 font-bold text-sm">×</span>
                        <div className="flex-1 relative">
                            <NeuInput 
                                type="number" 
                                value={gridHeight} 
                                onChange={(e) => handleHeightChange(e.target.value)}
                                min="1"
                                className="text-center font-mono w-full pr-8"
                            />
                             <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">{t.height}</span>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center px-2 py-1">
                   <label className="text-sm font-bold text-slate-500">{t.beadShape}</label>
                   <div className="flex bg-slate-200 rounded-lg p-1 shadow-inner">
                        <button 
                            onClick={() => setBeadShape('square')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${beadShape === 'square' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {t.shapeSquare}
                        </button>
                        <button 
                            onClick={() => setBeadShape('round')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${beadShape === 'round' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {t.shapeRound}
                        </button>
                   </div>
                </div>

                {/* Pattern Options: Mirror & Dual Export */}
                <div className="flex flex-col gap-3 px-1 py-2 border-t border-slate-300/50 border-b border-slate-300/50">
                   {/* Mirror Flip */}
                   <div className="flex items-center justify-between" title={t.mirrorFlipTooltip}>
                      <div 
                        className="flex items-center gap-1 cursor-help"
                        onClick={() => setInfoModal({
                            isOpen: true,
                            title: t.mirrorFlip,
                            content: t.mirrorFlipTooltip
                        })}
                      >
                         <label className="text-sm font-bold text-slate-600 shrink-0">{t.mirrorFlip}</label>
                         <Icon icon="lucide:info" className="w-4 h-4 text-slate-400" />
                      </div>
                      <NeuButton 
                         onClick={handleMirrorFlip}
                         className="!py-1.5 !px-3 text-xs flex items-center gap-1"
                      >
                         <Icon icon="lucide:flip-horizontal" className="w-4 h-4" />
                      </NeuButton>
                   </div>

                   {/* Dual Export */}
                   <div className="flex items-center justify-between" title={t.dualExportTooltip}>
                      <div className="flex items-center gap-1 cursor-help">
                         <label htmlFor="dualExportConfig" className="text-sm font-bold text-slate-600 shrink-0 cursor-pointer">{t.dualExport}</label>
                         <Icon 
                            icon="lucide:info" 
                            className="w-4 h-4 text-slate-400" 
                            onClick={(e) => {
                                e.preventDefault();
                                setInfoModal({
                                    isOpen: true,
                                    title: t.dualExport,
                                    content: t.dualExportTooltip
                                });
                            }}
                         />
                      </div>
                      <input 
                        type="checkbox" 
                        id="dualExportConfig"
                        checked={isDualExport} 
                        onChange={(e) => setIsDualExport(e.target.checked)}
                        className="w-5 h-5 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer shadow-sm bg-slate-100"
                      />
                   </div>
                </div>

                <div className="flex flex-col gap-1 px-1">
                   <NeuRange
                      label={t.denoiseLevel}
                      min="0"
                      max="10"
                      step="1"
                      value={denoiseLevel}
                      onChange={(e) => setDenoiseLevel(parseInt(e.target.value))}
                      valueDisplay={
                          denoiseLevel === 0 ? t.denoiseNone :
                          denoiseLevel <= 3 ? t.denoiseLow :
                          denoiseLevel <= 7 ? t.denoiseMed : t.denoiseHigh
                      }
                   />
                </div>

                <div className="pt-2">
                  <NeuButton 
                    onClick={handleAnalyze} 
                    disabled={isAnalyzing} 
                    className="w-full flex justify-center items-center gap-2 text-sm"
                  >
                    {isAnalyzing ? (
                      <span className="animate-pulse">{t.analyzing}</span>
                    ) : (
                      <>
                        <Icon icon="lucide:zap" className="w-4 h-4" />
                        {t.analyzeBtn}
                      </>
                    )}
                  </NeuButton>
                </div>

                {/* 生成图纸主按钮 */}
                <div className="pt-2">
                  <button
                    onClick={handleGenerate}
                    disabled={isProcessing || generationStep === 'step1' || generationStep === 'step2' || generationStep === 'step3'}
                    className="w-full rounded-2xl py-4 text-white font-bold text-base flex items-center justify-center gap-2 transition-all duration-200 shadow-[4px_4px_12px_rgba(255,107,107,0.3),-4px_-4px_12px_rgba(255,255,255,0.9)] bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <span className="animate-pulse">⏳ 生成中...</span>
                    ) : (
                      <>
                        <Icon icon="lucide:wand-2" className="w-5 h-5" />
                        生成拼豆图纸
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </NeuCard>

          {/* AI Insights Panel */}
          {aiAnalysis && (
            <NeuCard className="bg-slate-200 border border-white/50">
               <div className="flex flex-col gap-2">
                  <h3 className="text-base font-bold text-slate-700">{aiAnalysis.title}</h3>
                  <p className="text-sm text-slate-600 italic">"{aiAnalysis.description}"</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                        aiAnalysis.difficulty.toLowerCase().includes('hard') ? 'bg-red-200 text-red-700' :
                        aiAnalysis.difficulty.toLowerCase().includes('medium') ? 'bg-yellow-200 text-yellow-700' :
                        'bg-green-200 text-green-700'
                    }`}>{aiAnalysis.difficulty}</span>
                     <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-700">
                        {aiAnalysis.suggestedUsage}
                     </span>
                  </div>
               </div>
            </NeuCard>
          )}

          {/* Materials List */}
          {patternData && (
            <NeuCard className="flex flex-col gap-4 max-h-[400px] overflow-hidden flex-1">
              <div className="flex justify-between items-end pb-2 border-b border-slate-300">
                <h2 className="text-lg font-bold text-slate-700">{t.materials}</h2>
                <span className="text-xs font-bold text-slate-400">
                  {t.visible}: {Object.entries(patternData.counts)
                    .filter(([id]) => !hiddenBeadIds.has(id))
                    .reduce((sum, [, count]) => sum + (count as number), 0)}
                </span>
              </div>
              
              <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                {activePalette.colors
                  .filter(b => patternData.counts[b.id])
                  .sort((a,b) => (patternData.counts[b.id] || 0) - (patternData.counts[a.id] || 0))
                  .map((bead) => {
                    const isHidden = hiddenBeadIds.has(bead.id);
                    return (
                      <div 
                        key={bead.id} 
                        className={`flex items-center justify-between p-2 rounded-lg transition-all border border-transparent hover:border-slate-300 cursor-pointer group ${isHidden ? 'bg-transparent opacity-50' : 'bg-slate-200/50 hover:bg-slate-200'}`}
                        onClick={() => {
                            setPickingColorFor({
                                type: 'global',
                                targetId: bead.id,
                                currentBead: bead
                            });
                        }}
                        title={t.clickToReplace}
                      >
                        <div className="flex items-center gap-3">
                           {/* Visibility Toggle */}
                          <button 
                             onClick={(e) => toggleBeadVisibility(bead.id, e)}
                             className="text-slate-400 hover:text-slate-600 focus:outline-none transition-colors p-1"
                             title={isHidden ? t.showBeads : t.hideBeads}
                          >
                             {isHidden ? (
                               <Icon icon="lucide:eye-off" className="w-4 h-4" />
                             ) : (
                               <Icon icon="lucide:eye" className="w-4 h-4" />
                             )}
                          </button>
                          
                          <div className="w-6 h-6 rounded-full border border-slate-300 shadow-sm relative group-hover:scale-110 transition-transform" style={{ backgroundColor: bead.hex }}>
                             {/* Edit Icon Overlay */}
                             <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 rounded-full transition-opacity">
                                <Icon icon="lucide:pencil" className="w-3 h-3 text-white" />
                             </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700 leading-tight">{bead.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono leading-tight">{bead.id}</span>
                          </div>
                        </div>
                        <span className="font-bold text-slate-600 bg-slate-200/80 px-2 py-1 rounded-md min-w-[3rem] text-center text-xs">
                          {patternData.counts[bead.id]}
                        </span>
                      </div>
                    );
                })}
              </div>
            </NeuCard>
          )}
        </div>

        {/* Right Column: Canvas Preview */}
        <div className="lg:col-span-8 flex flex-col gap-6 order-1 lg:order-2 lg:self-start lg:sticky lg:top-6">
          <NeuCard className="w-full h-[calc(100vh-240px)] min-h-[420px] flex items-center justify-center relative overflow-hidden p-0 bg-slate-200/50" >
            {!imageSrc ? (
               <div className="flex flex-col items-center gap-4 text-slate-400 p-8">
                 <Icon icon="lucide:image" className="w-24 h-24 opacity-20" />
                 <p className="font-bold text-lg opacity-50">{t.noImage}</p>
               </div>
            ) : (
              <div 
                ref={containerRef}
                className="w-full h-full absolute inset-0 overflow-hidden cursor-crosshair bg-[#e0e5ec] shadow-inner touch-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={handleCanvasClick}
              >
                 {/* Instructions overlay */}
                 <div className="absolute top-4 left-4 z-10 pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
                    <div className="bg-slate-800/10 text-slate-500 text-[10px] px-2 py-1 rounded backdrop-blur-sm">
                        {t.zoomInstruction}
                    </div>
                 </div>

                 {/* Canvas Container with Transform */}
                 <div 
                    className="w-full h-full flex items-center justify-center transition-transform duration-75 ease-out"
                    style={{ 
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'center'
                    }}
                 >
                    <div className="relative shadow-xl shadow-slate-400/20">
                        {/* Processing Overlay */}
                        {isProcessing && (
                            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-200/50 backdrop-blur-sm rounded-lg animate-in fade-in duration-200">
                                <div className="w-12 h-12 border-4 border-[#4ECDC4] border-t-transparent rounded-full animate-spin shadow-lg"></div>
                                <span className="mt-4 font-bold text-slate-600 animate-pulse">
                                    {generationStep === 'step1' ? '步骤 1/3：正在抠图...' :
                                     generationStep === 'step2' ? '步骤 2/3：正在预处理...' :
                                     generationStep === 'step3' ? '步骤 3/3：正在生成图纸...' :
                                     t.processing}
                                </span>
                            </div>
                        )}
                        {/* Checkerboard background for transparency */}
                        <div className="absolute inset-0 z-0 opacity-20" style={{ 
                            backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                        }}></div>
                        <canvas ref={canvasRef} className="relative z-10 rounded-sm" />
                    </div>
                 </div>
                 
                 {/* 三图展示：左上角原图 / 右上角抠图后 / 居中图纸 */}
                 {/* Original Image Thumbnail (左上角) */}
                 <div className="absolute top-4 left-4 z-20 flex flex-col items-center gap-1 pointer-events-none">
                    <div className="w-20 h-20 p-1 bg-white/60 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200">
                       <img src={imageSrc} className="w-full h-full object-cover rounded" alt="Original" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 bg-white/60 px-1.5 py-0.5 rounded">原图</span>
                 </div>
                 
                 {/* Removed-Bg Thumbnail (右上角) */}
                 {bgRemovedSrc && (
                    <div className="absolute top-4 right-4 z-20 flex flex-col items-center gap-1 pointer-events-none">
                       <div className="w-28 h-28 p-1 bg-white/70 backdrop-blur-sm rounded-lg shadow-lg border-2 border-[#4ECDC4]/50">
                          <img src={bgRemovedSrc} className="w-full h-full object-cover rounded" alt="抠图结果" />
                       </div>
                       <span className="text-[10px] font-bold text-[#4ECDC4] bg-white/70 px-1.5 py-0.5 rounded">抠图后</span>
                    </div>
                 )}
                 
                 {/* Reset View Button */}
                 {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
                     <button 
                        onClick={(e) => { e.stopPropagation(); setZoom(1); setPan({x:0, y:0}); }}
                        className="absolute bottom-4 left-4 p-2 bg-white/80 rounded-full shadow-lg text-slate-600 hover:text-blue-500 z-20"
                        title={t.resetView}
                     >
                         <Icon icon="lucide:maximize" className="w-5 h-5" />
                     </button>
                 )}
              </div>
            )}
          </NeuCard>

          {/* Iron Guide */}
          {imageSrc && (
            <IronGuide ironMethod={ironPreset} />
          )}

          {/* Action Footer */}
          {patternData && (
             <div className="grid grid-cols-2 gap-3 md:flex md:justify-end md:gap-4">
               <NeuButton 
                  onClick={() => setShowMaterialExportModal(true)}
                  className="flex items-center justify-center gap-2 shadow-lg bg-slate-100 text-slate-600 hover:text-slate-800 text-xs md:text-base px-2 md:px-6 py-3 md:py-2 w-full md:w-auto"
               >
                 <Icon icon="lucide:clipboard-list" className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                 <span className="truncate">{t.exportMaterials}</span>
               </NeuButton>

               <NeuButton 
                  onClick={() => setShowSplitModal(true)}
                  className="flex items-center justify-center gap-2 shadow-lg bg-slate-100 text-slate-600 hover:text-slate-800 text-xs md:text-base px-2 md:px-6 py-3 md:py-2 w-full md:w-auto"
               >
                 <Icon icon="lucide:grid" className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                 <span className="truncate">{t.downloadSplit}</span>
               </NeuButton>

               <NeuButton 
                  onClick={() => setIsFreeDrawMode(true)}
                  className="flex items-center justify-center gap-2 shadow-lg bg-blue-100 text-blue-700 hover:text-blue-900 text-xs md:text-base px-2 md:px-6 py-3 md:py-2 w-full md:w-auto"
               >
                 <Icon icon="lucide:palette" className="w-5 h-5 flex-shrink-0" />
                 <span className="truncate">{t.freeDrawBtn}</span>
               </NeuButton>

               <NeuButton 
                  onClick={handleDownload}
                  className="flex items-center justify-center gap-2 shadow-lg text-xs md:text-base px-2 md:px-6 py-3 md:py-2 w-full md:w-auto"
               >
                 <Icon icon="lucide:download" className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                 <span className="truncate">{t.download}</span>
               </NeuButton>
             </div>
          )}

          {/* Iron Guide */}
          {imageSrc && (
             <IronGuide ironMethod={ironPreset} />
          )}
        </div>
      </div>

      {/* Color Picker Modal */}
      <NeuModal
        isOpen={!!pickingColorFor}
        onClose={() => { setPickingColorFor(null); setColorSearch(''); }}
        title={pickingColorFor?.type === 'global' ? t.replaceGlobalTitle : t.editBeadTitle}
      >
        <div className="flex flex-col gap-4">
            
            {/* Mode Switcher (If in Single Mode, allow switching to global) */}
            {pickingColorFor?.type === 'single' && (
                <div className="flex p-1 bg-slate-200/50 rounded-xl">
                    <button 
                        className="flex-1 py-2 text-xs font-bold rounded-lg bg-white shadow-sm text-slate-700 transition-all"
                    >
                        {t.changeThisBtn}
                    </button>
                    <button 
                        className="flex-1 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-all"
                        onClick={() => setPickingColorFor(prev => prev ? { ...prev, type: 'global', targetId: prev.currentBead?.id } : null)}
                    >
                        {t.changeAllBtn} '{pickingColorFor.currentBead?.name}'
                    </button>
                </div>
            )}

            {/* Current Color Display */}
            <div className="flex items-center gap-3 p-3 bg-slate-200/50 rounded-xl border border-white/50">
                <div className="w-10 h-10 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: pickingColorFor?.currentBead?.hex }}></div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-500 uppercase">{t.currentColor}</span>
                    <span className="font-bold text-slate-700">{pickingColorFor?.currentBead?.name} ({pickingColorFor?.currentBead?.id})</span>
                </div>
            </div>

            {/* Search */}
            <NeuInput 
                placeholder={t.searchPlaceholder}
                value={colorSearch}
                onChange={(e) => setColorSearch(e.target.value)}
                autoFocus
                className="text-sm"
            />

            {/* Color Grid */}
            <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto p-1">
                {activePalette.colors
                    .filter(c => 
                        c.name.toLowerCase().includes(colorSearch.toLowerCase()) || 
                        c.id.toLowerCase().includes(colorSearch.toLowerCase())
                    )
                    .map(color => (
                    <button
                        key={color.id}
                        onClick={() => handleColorReplace(color)}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/50 hover:shadow-md transition-all group"
                    >
                        <div className="w-8 h-8 rounded-full border border-slate-300 shadow-sm group-hover:scale-110 transition-transform" style={{ backgroundColor: color.hex }}></div>
                        <span className="text-[10px] font-bold text-slate-500 truncate w-full text-center">{color.name}</span>
                        <span className="text-[9px] text-slate-400 font-mono">{color.id}</span>
                    </button>
                ))}
            </div>
        </div>
      </NeuModal>

      {/* Split Download Modal */}
      <NeuModal
        isOpen={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        title={t.splitTitle}
      >
        <div className="flex flex-col gap-6">
          <p className="text-sm text-slate-600">
            {patternData ? t.splitInfo
                .replace('{rows}', Math.ceil(patternData.height / splitPreviewConfig.height).toString())
                .replace('{cols}', Math.ceil(patternData.width / splitPreviewConfig.width).toString())
                .replace('{total}', (Math.ceil(patternData.height / splitPreviewConfig.height) * Math.ceil(patternData.width / splitPreviewConfig.width)).toString())
              : ''}
          </p>
          
          <div className="flex items-center gap-4">
             <div className="flex-1 min-w-0">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block truncate">{t.splitWidth}</label>
                <NeuInput 
                    type="number"
                    value={splitConfig.width}
                    onChange={(e) => setSplitConfig(prev => ({...prev, width: toPositiveInt(e.target.value, prev.width, 10)}))}
                    min="10"
                    className="text-center w-full"
                />
             </div>
             <span className="text-slate-400 font-bold pt-6">×</span>
             <div className="flex-1 min-w-0">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block truncate">{t.splitHeight}</label>
                <NeuInput 
                    type="number"
                    value={splitConfig.height}
                    onChange={(e) => setSplitConfig(prev => ({...prev, height: toPositiveInt(e.target.value, prev.height, 10)}))}
                    min="10"
                    className="text-center w-full"
                />
             </div>
          </div>

          <div className="flex-1 min-w-0">
            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block truncate">{t.splitPadding}</label>
            <NeuInput 
                type="number"
                value={splitConfig.padding}
                onChange={(e) => setSplitConfig(prev => ({...prev, padding: toPositiveInt(e.target.value, prev.padding, 0)}))}
                min="0"
                className="text-center w-full"
            />
          </div>

          <div className="flex justify-end pt-2">
             <NeuButton 
                onClick={handleSplitDownload}
                disabled={isExporting}
                className="flex items-center gap-2 w-full justify-center"
             >
                {isExporting ? (
                   <span className="animate-pulse">{t.processing}...</span>
                ) : (
                   <>
                     <Icon icon="lucide:file-archive" className="w-5 h-5" />
                     {t.exportZip}
                   </>
                )}
             </NeuButton>
          </div>
        </div>
      </NeuModal>

      {/* Info Modal */}
      <NeuModal
        isOpen={infoModal.isOpen}
        onClose={closeInfoModal}
        title={infoModal.title}
      >
        <div className="flex flex-col gap-4">
          <p className="text-slate-600 leading-relaxed text-sm md:text-base">
            {infoModal.content}
          </p>
          <div className="flex justify-end pt-2">
            <NeuButton onClick={closeInfoModal} className="w-full md:w-auto">
              OK
            </NeuButton>
          </div>
        </div>
      </NeuModal>

      {/* CSV Import Modal */}
      <NeuModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        title={t.importPalette}
      >
        <div className="flex flex-col gap-4">
          <NeuInput 
            value={csvName} 
            onChange={(e) => setCsvName(e.target.value)} 
            placeholder={t.paletteName} 
          />
          <div className="flex flex-col gap-1">
             <label className="text-xs font-bold text-slate-400 ml-1">{t.uploadCsv}</label>
             <NeuFileUpload onChange={handleCsvUpload} accept=".csv">
               {csvFile ? csvFile.name : t.uploadCsv}
             </NeuFileUpload>
          </div>
          <p className="text-xs text-slate-400">
            {t.csvFormatInfo}
          </p>
          <NeuButton onClick={handleImportCsv} disabled={!csvFile || !csvName}>
            {t.addPalette}
          </NeuButton>
        </div>
      </NeuModal>

      {/* Material Export Modal */}
      <NeuModal
        isOpen={showMaterialExportModal}
        onClose={() => setShowMaterialExportModal(false)}
        title={t.exportMaterials}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">{t.exportMaterialsDesc}</p>
          <div className="flex items-center gap-2 p-3 bg-slate-200/50 rounded-xl">
            <input 
              type="checkbox" 
              id="excludeHidden"
              checked={excludeHiddenMaterials} 
              onChange={(e) => setExcludeHiddenMaterials(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="excludeHidden" className="text-sm font-bold text-slate-700 cursor-pointer select-none flex-1">
              {t.excludeHidden}
            </label>
          </div>
          <div className="flex justify-end pt-2">
            <NeuButton onClick={handleMaterialExport} className="w-full justify-center">
              {t.exportMaterials}
            </NeuButton>
          </div>
        </div>
      </NeuModal>

      {/* Image Cropper */}
      {isCropping && originalImageSrc && (
        <ImageCropper
          imageSrc={originalImageSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
          t={t}
        />
      )}

      {/* Free Draw Editor */}
      {isFreeDrawMode && patternData && (
        <FreeDrawEditor
          patternData={patternData}
          palette={activePalette.colors}
          onSave={handleFreeDrawSave}
          onCancel={() => setIsFreeDrawMode(false)}
          t={t}
        />
      )}

      {/* Donation Modal */}
      <NeuModal
        isOpen={showDonationModal}
        onClose={() => setShowDonationModal(false)}
        title={t.donationModalTitle}
      >
        <div className="flex flex-col items-center justify-center gap-4 p-4">
          <div className="w-64 h-64 bg-white p-2 rounded-xl shadow-inner flex items-center justify-center">
             <img src="/alipay.jpg" alt="Alipay QR Code" className="w-full h-full object-contain" />
          </div>
          <p className="text-slate-500 text-center text-sm font-medium flex items-center justify-center gap-2">
            {t.footerBuyMeCoffee} <Icon icon="lucide:heart" className="w-4 h-4 text-red-500 fill-current" />
          </p>
        </div>
      </NeuModal>

      {/* Footer */}
      <footer className="w-full max-w-7xl flex flex-col items-center gap-2 mt-12 pb-8 pt-8">
        <p className="text-[14px] text-[#999] text-center">
          © 2026 小若拼豆 | 让每一颗豆子都有灵魂
        </p>
      </footer>

      {/* 抠图手动微调编辑器 */}
      {isMaskEditing && bgRemovedTransparentSrc && imageSrc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[#FFF5F5] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-[#FF6B6B]/10">
            <div className="flex justify-between items-center p-5 border-b border-slate-300">
              <h3 className="text-xl font-bold text-slate-700">✏️ 手动微调抠图</h3>
              <button onClick={() => setIsMaskEditing(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <Icon icon="lucide:x" className="w-6 h-6" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto custom-scrollbar">
              <BgMaskEditor
                originalSrc={imageSrc}
                removedSrc={bgRemovedTransparentSrc}
                onConfirm={handleMaskConfirm}
                onCancel={() => setIsMaskEditing(false)}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};



export default App;
