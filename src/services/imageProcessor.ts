import { Jimp } from "jimp";
import chroma from "chroma-js";
import { BeadColor, PatternData, SegmentInfo } from "../types";
import { hexToRgb } from "../beadPalettes";
import { ironPresets, IronPresetKey } from "../config/ironPresets";

// Helper: Median Filter for Denoising
const applyMedianFilter = (
  width: number,
  height: number,
  data: Uint8Array | any,
  radius: number = 1
): { data: Uint8Array; width: number; height: number } => {
  const outputData = new Uint8Array(data.length);
  const size = (2 * radius + 1) * (2 * radius + 1);
  const mid = Math.floor(size / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const rValues: number[] = [];
      const gValues: number[] = [];
      const bValues: number[] = [];

      for (let ry = -radius; ry <= radius; ry++) {
        for (let rx = -radius; rx <= radius; rx++) {
          let nx = x + rx;
          let ny = y + ry;
          nx = Math.min(Math.max(nx, 0), width - 1);
          ny = Math.min(Math.max(ny, 0), height - 1);
          const nIdx = (ny * width + nx) * 4;
          rValues.push(data[nIdx]);
          gValues.push(data[nIdx + 1]);
          bValues.push(data[nIdx + 2]);
        }
      }

      rValues.sort((a, b) => a - b);
      gValues.sort((a, b) => a - b);
      bValues.sort((a, b) => a - b);

      outputData[idx] = rValues[mid];
      outputData[idx + 1] = gValues[mid];
      outputData[idx + 2] = bValues[mid];
      outputData[idx + 3] = data[idx + 3]; // Alpha
    }
  }

  return { width, height, data: outputData };
};

// Helper: Kuwahara Filter for Image Smoothing
const applyKuwaharaFilter = (
  width: number,
  height: number,
  data: Uint8Array | any,
  radius: number = 3 // Kernel radius
): { data: Uint8Array; width: number; height: number } => {
  const outputData = new Uint8Array(data.length);

  // Pre-calculate squared integral images for fast mean/variance calculation could be an optimization
  // But for client-side JS with smallish images, a direct sliding window is acceptable for now.
  // We will implement the standard Kuwahara filter logic.

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Handle borders simply by copying or clamping. Here we just process valid pixels and leave borders.
      // Or better, clamp coordinates.

      const subregions = [
        { x: -radius, y: -radius, w: radius + 1, h: radius + 1 }, // Top-Left
        { x: 0, y: -radius, w: radius + 1, h: radius + 1 }, // Top-Right
        { x: -radius, y: 0, w: radius + 1, h: radius + 1 }, // Bottom-Left
        { x: 0, y: 0, w: radius + 1, h: radius + 1 }, // Bottom-Right
      ];

      let minVariance = Infinity;
      let bestMean = { r: data[idx], g: data[idx + 1], b: data[idx + 2] };

      for (const region of subregions) {
        let sumR = 0,
          sumG = 0,
          sumB = 0;
        let sumSqR = 0,
          sumSqG = 0,
          sumSqB = 0;
        let count = 0;

        for (let ry = region.y; ry < region.y + region.h; ry++) {
          for (let rx = region.x; rx < region.x + region.w; rx++) {
            let nx = x + rx;
            let ny = y + ry;

            // Clamp to image bounds
            nx = Math.min(Math.max(nx, 0), width - 1);
            ny = Math.min(Math.max(ny, 0), height - 1);

            const nIdx = (ny * width + nx) * 4;
            const r = data[nIdx];
            const g = data[nIdx + 1];
            const b = data[nIdx + 2];

            sumR += r;
            sumG += g;
            sumB += b;
            sumSqR += r * r;
            sumSqG += g * g;
            sumSqB += b * b;
            count++;
          }
        }

        const meanR = sumR / count;
        const meanG = sumG / count;
        const meanB = sumB / count;

        const varR = sumSqR / count - meanR * meanR;
        const varG = sumSqG / count - meanG * meanG;
        const varB = sumSqB / count - meanB * meanB;

        const totalVariance = varR + varG + varB;

        if (totalVariance < minVariance) {
          minVariance = totalVariance;
          bestMean = { r: meanR, g: meanG, b: meanB };
        }
      }

      outputData[idx] = bestMean.r;
      outputData[idx + 1] = bestMean.g;
      outputData[idx + 2] = bestMean.b;
      outputData[idx + 3] = data[idx + 3]; // Alpha
    }
  }

  return { width, height, data: outputData };
};

export const processImageToPattern = async (
  imageSrc: string,
  targetWidth: number,
  targetHeight: number | "auto",
  palette: BeadColor[],
  denoiseLevel: number = 0,
  ironMethod: IronPresetKey | string = "lightIron"
): Promise<PatternData> => {
  try {
    const image = await Jimp.read(imageSrc);

    // 读取烫法预设参数
    const preset = (ironPresets as Record<string, any>)[ironMethod] || ironPresets.lightIron;

    // 1. Calculate aspect ratio
    const aspectRatio = image.height / image.width;
    const finalHeight =
      targetHeight === "auto"
        ? Math.round(targetWidth * aspectRatio)
        : targetHeight;

    // 2. Pre-processing: Denoise & Smooth
    // Pipeline: Median Filter (Denoise) -> Kuwahara Filter (Stylize/Smooth)
    // Optimization: Resize to a "medium" working resolution (e.g., 4x target size) first.
    const workingWidth = Math.min(image.bitmap.width, targetWidth * 4);
    const workingHeight = Math.min(image.bitmap.height, finalHeight * 4);

    image.resize({ w: workingWidth, h: workingHeight }); // Standard bilinear resize for downscaling

    if (denoiseLevel > 0) {
      // Step A: Median Filter (Good for "Salt & Pepper" noise)
      // Radius increases with denoiseLevel (1 to 2)
      if (denoiseLevel >= 3) {
        const medianRadius = denoiseLevel >= 7 ? 2 : 1;
        const denoised = applyMedianFilter(
          image.bitmap.width,
          image.bitmap.height,
          image.bitmap.data,
          medianRadius
        );
        image.bitmap.data = denoised.data as any;
      }

      // Step B: Kuwahara Filter (Oil Painting Effect / Blocky Smoothing)
      // Radius: 2 to 4 based on level
      const kuwaharaRadius = 2 + Math.floor(denoiseLevel / 3);
      const smoothed = applyKuwaharaFilter(
        image.bitmap.width,
        image.bitmap.height,
        image.bitmap.data,
        kuwaharaRadius
      );
      image.bitmap.data = smoothed.data as any;
    }

    // TODO: Add ONNX Runtime integration here for Deep Learning models (e.g. NAFNet)
    // if (modelLoaded) { await runOnnxModel(image); }

    // 3. Pixelation (Resize to final grid)
    // Use Nearest Neighbor to keep the hard edges created by Kuwahara
    image.resize({
      w: targetWidth,
      h: finalHeight,
      mode: "nearestNeighbor" as any,
    });

    const grid: BeadColor[][] = [];
    const counts: Record<string, number> = {};

    // Pre-calculate Lab colors for palette
    const paletteLab = palette.map((p) => ({
      ...p,
      lab: chroma(p.hex).lab(),
    }));

    if (paletteLab.length === 0) {
      throw new Error("No colors in palette");
    }

    const { width, height, data } = image.bitmap;

    // 毛巾烫：在色号匹配前，对每个网格的颜色采样加 ±5% 随机扰动（毛绒质感）
    const isTowelIron = ironMethod === "towelIron";

    for (let y = 0; y < height; y++) {
      const row: BeadColor[] = [];
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        let r = data[idx];
        let g = data[idx + 1];
        let b = data[idx + 2];
        const a = data[idx + 3];

        // Simple handling for transparency
        if (a < 128) {
          // Treat as transparent. Map to white or first color.
          const white =
            paletteLab.find((c) => c.hex.toLowerCase() === "#ffffff") ||
            paletteLab[0];
          const matchedBead: BeadColor = {
            id: white.id,
            name: white.name,
            hex: white.hex,
          };
          row.push(matchedBead);
          counts[matchedBead.id] = (counts[matchedBead.id] || 0) + 1;
          continue;
        }

        // 毛巾烫：±5% 随机扰动
        if (isTowelIron) {
          const jitter = () => (Math.random() * 2 - 1) * 0.05; // -5% ~ +5%
          r = Math.min(255, Math.max(0, Math.round(r * (1 + jitter()))));
          g = Math.min(255, Math.max(0, Math.round(g * (1 + jitter()))));
          b = Math.min(255, Math.max(0, Math.round(b * (1 + jitter()))));
        }

        // 4. Color Quantization (CIELAB Delta E)
        const currentLab = chroma.rgb(r, g, b).lab();

        let minDistance = Infinity;
        let closestBead = paletteLab[0];

        for (const bead of paletteLab) {
          // Chroma.js deltaE (CIE76 by default, fast and good enough)
          // For better results, we can calculate DeltaE 2000 manually if needed,
          // but Euclidean in Lab space is already a huge upgrade over RGB.
          // Note: chroma.deltaE(color1, color2) accepts hex/css strings or chroma objects.

          // Manual Euclidean in Lab for speed (Delta E 76)
          const dL = currentLab[0] - bead.lab[0];
          const da = currentLab[1] - bead.lab[1];
          const db = currentLab[2] - bead.lab[2];
          const dist = Math.sqrt(dL * dL + da * da + db * db);

          if (dist < minDistance) {
            minDistance = dist;
            closestBead = bead;
          }
        }

        const matchedBead: BeadColor = {
          id: closestBead.id,
          name: closestBead.name,
          hex: closestBead.hex,
        };

        row.push(matchedBead);
      }
      grid.push(row);
    }

    // 5. Post-processing: Smart Despeckle (Mode Filter)
    // Only run if denoiseLevel > 0
    if (denoiseLevel > 0) {
      let currentGrid = grid;
      // Iterations based on denoise level (1 to 5 passes)
      const iterations = Math.ceil(denoiseLevel / 2);
      // Threshold: if a pixel has fewer than X neighbors of same color, it's noise.
      // Strictness increases with level.
      const threshold = denoiseLevel >= 5 ? 3 : 2;

      for (let i = 0; i < iterations; i++) {
        currentGrid = applyDenoisePass(currentGrid, threshold);
      }
      // Update reference
      grid.splice(0, grid.length, ...currentGrid);
    }

    // 6. 铁法特殊处理（色号匹配后）
    // 满烫：相邻色差 ΔE < mergeThreshold 则合并为面积较大的色号
    if (ironMethod === "fullIron" && preset.mergeThreshold > 0) {
      mergeSimilarColors(grid, preset.mergeThreshold);
    }

    // 格利特烫：强制压缩到 maxColors 色以内
    if (ironMethod === "glitterIron" && preset.maxColors > 0) {
      compressColorCount(grid, preset.maxColors);
    }

    // 分段烫：按 29×29 切割，生成区块编号
    let segments: SegmentInfo[] | undefined;
    if (ironMethod === "segmentIron") {
      segments = buildSegments(grid, 29);
    }

    // Recalculate counts after all processing
    const finalCounts: Record<string, number> = {};
    grid.forEach((row) => {
      row.forEach((bead) => {
        finalCounts[bead.id] = (finalCounts[bead.id] || 0) + 1;
      });
    });

    return {
      grid,
      counts: finalCounts,
      width: targetWidth,
      height: finalHeight,
      segments,
    };
  } catch (err) {
    console.error("Image processing failed:", err);
    throw err;
  }
};

// Helper: Single Pass Denoise (Mode Filter / Despeckle)
const applyDenoisePass = (
  grid: BeadColor[][],
  threshold: number
): BeadColor[][] => {
  const height = grid.length;
  const width = grid[0].length;
  const newGrid = grid.map((row) => [...row]); // Shallow copy for new state

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const currentBead = grid[y][x];

      // Collect neighbors (3x3 window)
      const neighborCounts: Record<string, number> = {};
      const neighborMap: Record<string, BeadColor> = {};
      let totalNeighbors = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;

          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const bead = grid[ny][nx];
            neighborCounts[bead.id] = (neighborCounts[bead.id] || 0) + 1;
            if (!neighborMap[bead.id]) neighborMap[bead.id] = bead;
            totalNeighbors++;
          }
        }
      }

      // Logic: If current bead's color count in neighborhood is below threshold,
      // swap it to the most frequent color in the neighborhood.
      const selfCount = neighborCounts[currentBead.id] || 0;

      if (selfCount < threshold) {
        // Find majority color
        let maxCount = -1;
        let majorityId = currentBead.id;

        Object.entries(neighborCounts).forEach(([id, count]) => {
          if (count > maxCount) {
            maxCount = count;
            majorityId = id;
          }
        });

        if (majorityId !== currentBead.id) {
          newGrid[y][x] = neighborMap[majorityId];
        }
      }
    }
  }
  return newGrid;
};

// Helper: 满烫合并 —— 相邻色块色差 ΔE < threshold 则合并为面积较大的色号
// 采用两遍扫描：先统计每个色号的总面积，再逐格与上下左右相邻色块比较。
const mergeSimilarColors = (
  grid: BeadColor[][],
  threshold: number
): void => {
  const height = grid.length;
  if (height === 0) return;
  const width = grid[0].length;

  // 1. 统计每个色号的面积（出现次数）
  const area: Record<string, number> = {};
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = grid[y][x].id;
      area[id] = (area[id] || 0) + 1;
    }
  }

  // 2. 预计算每个色号的 Lab
  const labCache: Record<string, [number, number, number]> = {};
  const labOf = (bead: BeadColor): [number, number, number] => {
    if (!labCache[bead.id]) {
      const c = chroma(bead.hex).lab();
      labCache[bead.id] = [c[0], c[1], c[2]];
    }
    return labCache[bead.id];
  };

  const deltaE = (
    a: [number, number, number],
    b: [number, number, number]
  ): number => {
    const dL = a[0] - b[0];
    const da = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dL * dL + da * da + db * db);
  };

  // 3. 迭代合并：对每个格子，检查上下左右相邻格子，若色差 < threshold，
  //    将当前格子改为两者中面积较大的色号（同色跳过）。
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];

  // 多轮扫描直到稳定（最多 10 轮，防止死循环）
  for (let round = 0; round < 10; round++) {
    let changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cur = grid[y][x];
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nb = grid[ny][nx];
          if (nb.id === cur.id) continue;
          const de = deltaE(labOf(cur), labOf(nb));
          if (de < threshold) {
            // 面积较大的色号胜出
            const winner = (area[cur.id] || 0) >= (area[nb.id] || 0) ? cur : nb;
            if (winner.id !== cur.id) {
              grid[y][x] = winner;
              changed = true;
              break; // 每个格子本轮只合并一次
            }
          }
        }
      }
    }
    if (!changed) break;
  }
};

// Helper: 格利特烫 —— 强制将颜色数量压缩到 maxColors 色以内
// 策略：按色号面积从大到小排序，保留前 maxColors 个主色，
//       其余小面积色号合并到与之色差最近的主色。
const compressColorCount = (
  grid: BeadColor[][],
  maxColors: number
): void => {
  const height = grid.length;
  if (height === 0) return;
  const width = grid[0].length;

  // 1. 统计每个色号的面积与代表色
  const statMap: Record<string, { bead: BeadColor; count: number }> = {};
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const b = grid[y][x];
      if (!statMap[b.id]) statMap[b.id] = { bead: b, count: 0 };
      statMap[b.id].count++;
    }
  }

  const ids = Object.keys(statMap);
  if (ids.length <= maxColors) return; // 已满足，无需压缩

  // 2. 按面积降序，前 maxColors 为保留主色
  ids.sort((a, b) => statMap[b].count - statMap[a].count);
  const keepIds = new Set(ids.slice(0, maxColors));

  // 3. 预计算 Lab
  const labCache: Record<string, [number, number, number]> = {};
  const labOf = (hex: string): [number, number, number] => {
    if (!labCache[hex]) {
      const c = chroma(hex).lab();
      labCache[hex] = [c[0], c[1], c[2]];
    }
    return labCache[hex];
  };
  const keepLabs = ids
    .filter((id) => keepIds.has(id))
    .map((id) => ({ id, lab: labOf(statMap[id].bead.hex) }));

  // 4. 构建被淘汰色号 → 最近主色的映射
  const mergeTarget: Record<string, BeadColor> = {};
  for (const id of ids) {
    if (keepIds.has(id)) continue;
    const srcLab = labOf(statMap[id].bead.hex);
    let bestId = keepLabs[0].id;
    let bestDist = Infinity;
    for (const k of keepLabs) {
      const dL = srcLab[0] - k.lab[0];
      const da = srcLab[1] - k.lab[1];
      const db = srcLab[2] - k.lab[2];
      const dist = Math.sqrt(dL * dL + da * da + db * db);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = k.id;
      }
    }
    mergeTarget[id] = statMap[bestId].bead;
  }

  // 5. 应用到网格
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const b = grid[y][x];
      if (mergeTarget[b.id]) {
        grid[y][x] = mergeTarget[b.id];
      }
    }
  }
};

// Helper: 分段烫 —— 按 blockSize×blockSize 切割，生成区块编号
const buildSegments = (
  grid: BeadColor[][],
  blockSize: number
): SegmentInfo[] => {
  const height = grid.length;
  if (height === 0) return [];
  const width = grid[0].length;
  const segments: SegmentInfo[] = [];

  let label = 1;
  for (let row = 0; row < height; row += blockSize) {
    for (let col = 0; col < width; col += blockSize) {
      const segW = Math.min(blockSize, width - col);
      const segH = Math.min(blockSize, height - row);
      segments.push({
        row,
        col,
        label: String(label++),
        width: segW,
        height: segH,
      });
    }
  }

  return segments;
};
