export interface BeadColor {
  id: string;
  name: string;
  hex: string;
}

export interface Palette {
  id: string;
  name: string;
  colors: BeadColor[];
}

export interface PatternData {
  grid: BeadColor[][]; // 2D array of colors representing the grid
  counts: Record<string, number>; // Map of Color ID to count
  width: number;
  height: number;
  segments?: SegmentInfo[]; // 分段烫：按固定尺寸切割的区块信息
}

export interface SegmentInfo {
  row: number; // 区块起始行（格子坐标）
  col: number; // 区块起始列（格子坐标）
  label: string; // 区块编号，如 "1"、"2"...
  width: number; // 区块宽（格子数）
  height: number; // 区块高（格子数）
}

export interface AIAnalysis {
  title: string;
  description: string;
  difficulty: string;
  suggestedUsage: string;
}