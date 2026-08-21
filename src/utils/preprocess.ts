/**
 * preprocess.ts —— 图片预处理模块
 * 四种作品风格的预处理函数，全部使用纯 Canvas 2D API，不依赖第三方库。
 *
 * 每个函数接收一个 ImageData（含像素数据），返回处理后的 ImageData。
 */

// ============================================================================
// 工具函数
// ============================================================================

/** 将 [r,g,b] 转为灰度值 */
const toGray = (r: number, g: number, b: number): number =>
  0.299 * r + 0.587 * g + 0.114 * b;

/** 颜色差（RGB 欧氏距离） */
const colorDiff = (
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
): number => {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

/** Sobel 算子：返回 (gradient magnitude, 方向) */
const sobel = (
  gray: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): { mag: number } => {
  let gx = 0;
  let gy = 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      let v = 0;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        v = gray[ny * width + nx];
      }
      // Sobel 核
      const sx = dx === 0 ? 0 : dx * 2;
      const sy = dy === 0 ? 0 : dy * 2;
      // 水平和垂直核权重（含对角线）
      let kx = 0;
      let ky = 0;
      if (dx === -1 && dy === -1) { kx = -1; ky = -1; }
      else if (dx === 0 && dy === -1) { kx = 0; ky = -2; }
      else if (dx === 1 && dy === -1) { kx = 1; ky = -1; }
      else if (dx === -1 && dy === 0) { kx = -2; ky = 0; }
      else if (dx === 0 && dy === 0) { kx = 0; ky = 0; }
      else if (dx === 1 && dy === 0) { kx = 2; ky = 0; }
      else if (dx === -1 && dy === 1) { kx = -1; ky = 1; }
      else if (dx === 0 && dy === 1) { kx = 0; ky = 2; }
      else if (dx === 1 && dy === 1) { kx = 1; ky = 1; }

      gx += v * kx;
      gy += v * ky;
    }
  }

  return { mag: Math.sqrt(gx * gx + gy * gy) };
};

/** 创建与源同尺寸的空白 ImageData */
const cloneImageData = (src: ImageData): ImageData => {
  const out = new ImageData(src.width, src.height);
  out.data.set(src.data);
  return out;
};

// ============================================================================
// 1. none —— 原图直出
// ============================================================================
export const none = (imageData: ImageData): ImageData => {
  return cloneImageData(imageData);
};

// ============================================================================
// 2. cartoonify —— 卡通化
// ============================================================================
export const cartoonify = (
  imageData: ImageData,
  canvasWidth: number,
  canvasHeight: number
): ImageData => {
  const width = canvasWidth;
  const height = canvasHeight;
  const src = imageData.data;
  const out = cloneImageData(imageData);

  // ---- 第一步：简单双边滤波（5×5 区域，颜色相近（色差<30）的像素取平均）----
  const bilateral = new Uint8ClampedArray(src.length);
  const RADIUS = 2; // 5×5 窗口
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const cr = src[idx];
      const cg = src[idx + 1];
      const cb = src[idx + 2];

      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = (ny * width + nx) * 4;
          const nr = src[nIdx];
          const ng = src[nIdx + 1];
          const nb = src[nIdx + 2];
          if (colorDiff(cr, cg, cb, nr, ng, nb) < 30) {
            sumR += nr;
            sumG += ng;
            sumB += nb;
            count++;
          }
        }
      }
      if (count === 0) count = 1;
      const oIdx = idx;
      bilateral[oIdx] = sumR / count;
      bilateral[oIdx + 1] = sumG / count;
      bilateral[oIdx + 2] = sumB / count;
      bilateral[oIdx + 3] = src[idx + 3];
    }
  }

  // ---- 第二步：Sobel 边缘检测 + 边缘加深 ----
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = toGray(bilateral[o], bilateral[o + 1], bilateral[o + 2]);
  }

  // ---- 第三步：K-Means 聚类（k=24）减少颜色 ----
  const k = 24;
  const centroids: [number, number, number][] = [];
  const step = Math.max(1, Math.floor((width * height) / (k * 2)));
  for (let i = 0; i < k; i++) {
    const p = Math.min(width * height - 1, i * step + Math.floor(step / 2));
    const o = p * 4;
    centroids.push([bilateral[o], bilateral[o + 1], bilateral[o + 2]]);
  }

  const labels = new Int32Array(width * height).fill(-1);
  for (let iter = 0; iter < 6; iter++) {
    // 分配
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      const r = bilateral[o], g = bilateral[o + 1], b = bilateral[o + 2];
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = colorDiff(r, g, b, centroids[c][0], centroids[c][1], centroids[c][2]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      labels[i] = best;
    }
    // 更新质心
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0] as number[]);
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      const c = labels[i];
      sums[c][0] += bilateral[o];
      sums[c][1] += bilateral[o + 1];
      sums[c][2] += bilateral[o + 2];
      sums[c][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }

  // 应用聚类颜色 + 边缘加深
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const c = labels[i] >= 0 ? labels[i] : 0;
      let r = centroids[c][0];
      let g = centroids[c][1];
      let b = centroids[c][2];

      // 边缘加深：边缘处 RGB 各减 50
      const { mag } = sobel(gray, width, height, x, y);
      const isEdge = mag > 60; // 阈值判断边缘
      if (isEdge) {
        r = Math.max(0, r - 50);
        g = Math.max(0, g - 50);
        b = Math.max(0, b - 50);
      }

      out.data[o] = r;
      out.data[o + 1] = g;
      out.data[o + 2] = b;
      out.data[o + 3] = src[o + 3];
    }
  }

  return out;
};

// ============================================================================
// 3. outline —— 轮廓化
// ============================================================================
export const outline = (
  imageData: ImageData,
  canvasWidth: number,
  canvasHeight: number
): ImageData => {
  const width = canvasWidth;
  const height = canvasHeight;
  const src = imageData.data;

  // ---- 第一步：转灰度 ----
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = toGray(src[o], src[o + 1], src[o + 2]);
  }

  // ---- 第二步：Sobel 梯度幅值 ----
  const grad = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      grad[y * width + x] = sobel(gray, width, height, x, y).mag;
    }
  }

  // ---- 第三步：大津法（Otsu）自动阈值 ----
  const otsuThreshold = (arr: Float32Array): number => {
    // 构建 256 级直方图（梯度归一化到 0-255）
    const hist = new Float64Array(256);
    const total = arr.length;
    let maxVal = 0;
    for (let i = 0; i < total; i++) if (arr[i] > maxVal) maxVal = arr[i];
    if (maxVal === 0) return 127;
    for (let i = 0; i < total; i++) {
      const bin = Math.min(255, Math.floor((arr[i] / maxVal) * 255));
      hist[bin]++;
    }

    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVar = 0;
    let threshold = 127;

    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      if (varBetween > maxVar) {
        maxVar = varBetween;
        threshold = t;
      }
    }
    // 归一化阈值映射回梯度域
    return (threshold / 255) * maxVal;
  };

  const thr = otsuThreshold(grad);

  // ---- 二值化 ----
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    binary[i] = grad[i] > thr ? 255 : 0;
  }

  // ---- 第四步：3×3 膨胀（连接断开线条）----
  const dilated = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxV = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (binary[ny * width + nx] > maxV) maxV = binary[ny * width + nx];
          }
        }
      }
      dilated[y * width + x] = maxV;
    }
  }

  // ---- 输出：白底黑线 ----
  const out = new ImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const v = dilated[i];
    out.data[o] = v;
    out.data[o + 1] = v;
    out.data[o + 2] = v;
    out.data[o + 3] = 255;
  }

  return out;
};

// ============================================================================
// 4. mosaic —— 马赛克艺术
// ============================================================================
export const mosaic = (
  imageData: ImageData,
  canvasWidth: number,
  canvasHeight: number
): ImageData => {
  const width = canvasWidth;
  const height = canvasHeight;
  const src = imageData.data;

  // ---- 第一步：均值模糊（半径 5px，11×11 区域）----
  const blurR = 5;
  const blurred = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dy = -blurR; dy <= blurR; dy++) {
        for (let dx = -blurR; dx <= blurR; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = (ny * width + nx) * 4;
          sumR += src[nIdx];
          sumG += src[nIdx + 1];
          sumB += src[nIdx + 2];
          count++;
        }
      }
      const o = (y * width + x) * 4;
      blurred[o] = sumR / count;
      blurred[o + 1] = sumG / count;
      blurred[o + 2] = sumB / count;
      blurred[o + 3] = src[o + 3];
    }
  }

  // ---- 第二步：K-Means 聚类（k=12）----
  const k = 12;
  const centroids: [number, number, number][] = [];
  const step = Math.max(1, Math.floor((width * height) / (k * 2)));
  for (let i = 0; i < k; i++) {
    const p = Math.min(width * height - 1, i * step + Math.floor(step / 2));
    const o = p * 4;
    centroids.push([blurred[o], blurred[o + 1], blurred[o + 2]]);
  }

  const labels = new Int32Array(width * height).fill(-1);
  for (let iter = 0; iter < 6; iter++) {
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      const r = blurred[o], g = blurred[o + 1], b = blurred[o + 2];
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = colorDiff(r, g, b, centroids[c][0], centroids[c][1], centroids[c][2]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      labels[i] = best;
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0] as number[]);
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      const c = labels[i];
      sums[c][0] += blurred[o];
      sums[c][1] += blurred[o + 1];
      sums[c][2] += blurred[o + 2];
      sums[c][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }

  // 应用聚类颜色
  const quantized = new Uint8ClampedArray(src.length);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const c = labels[i] >= 0 ? labels[i] : 0;
    quantized[o] = centroids[c][0];
    quantized[o + 1] = centroids[c][1];
    quantized[o + 2] = centroids[c][2];
    quantized[o + 3] = src[o + 3];
  }

  // ---- 第三步：相邻色差 < 15 合并为同色 ----
  const out = new ImageData(width, height);
  out.data.set(quantized);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const cr = quantized[o];
      const cg = quantized[o + 1];
      const cb = quantized[o + 2];

      // 与左邻、上邻比较
      const neighbors = [
        { nx: x - 1, ny: y },
        { nx: x, ny: y - 1 },
      ];
      for (const { nx, ny } of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nO = (ny * width + nx) * 4;
        const nr = quantized[nO];
        const ng = quantized[nO + 1];
        const nb = quantized[nO + 2];
        if (colorDiff(cr, cg, cb, nr, ng, nb) < 15) {
          out.data[o] = nr;
          out.data[o + 1] = ng;
          out.data[o + 2] = nb;
          break;
        }
      }
    }
  }

  return out;
};
