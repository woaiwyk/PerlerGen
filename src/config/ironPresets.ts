export const ironPresets = {
  lightIron: {
    label: '轻烫保孔',
    description: '适合挂件、展示品，保留孔洞，细节丰富',
    gridSize: 58,
    denoiseLevel: 2,
    mergeThreshold: 0,
    maxColors: 48,
    dithering: false
  },
  fullIron: {
    label: '满烫闭孔',
    description: '适合杯垫、冰箱贴，表面光滑，耐用防水',
    gridSize: 29,
    denoiseLevel: 7,
    mergeThreshold: 5,
    maxColors: 24,
    dithering: false
  },
  towelIron: {
    label: '毛巾烫',
    description: '适合玩偶，毛绒质感，柔和可爱',
    gridSize: 29,
    denoiseLevel: 4,
    mergeThreshold: 3,
    maxColors: 32,
    dithering: true
  },
  glitterIron: {
    label: '格利特烫',
    description: '适合闪亮装饰，细闪效果，梦幻璀璨',
    gridSize: 15,
    denoiseLevel: 8,
    mergeThreshold: 8,
    maxColors: 16,
    dithering: false
  },
  segmentIron: {
    label: '分段烫',
    description: '适合大型作品（>30cm），分板拼接，宏伟壮观',
    gridSize: 104,
    denoiseLevel: 3,
    mergeThreshold: 0,
    maxColors: 64,
    dithering: false,
    splitBoard: true
  }
};

export type IronPresetKey = keyof typeof ironPresets;

export type IronPreset = (typeof ironPresets)[IronPresetKey];
