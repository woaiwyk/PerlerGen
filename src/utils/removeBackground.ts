import { removeBackground as imglyRemoveBg } from '@imgly/background-removal';

/**
 * 使用 @imgly/background-removal 进行 AI 抠图
 * @param imageElement HTMLImageElement 或 HTMLCanvasElement
 * @returns 抠图后的 Canvas（透明背景，主体保留 alpha 通道）
 */
export async function removeBg(imageElement: HTMLImageElement | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  try {
    // 先把输入绘制到 canvas，再转成 Blob 传入。
    // @imgly/background-removal 的 imageSourceToImageData 只处理 string/URL/ArrayBuffer/Blob，
    // 对 HTMLImageElement/HTMLCanvasElement/ImageData 会原样返回（不带 .shape），导致报错。
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width =
      imageElement instanceof HTMLImageElement
        ? imageElement.naturalWidth
        : imageElement.width;
    srcCanvas.height =
      imageElement instanceof HTMLImageElement
        ? imageElement.naturalHeight
        : imageElement.height;
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.drawImage(imageElement, 0, 0);

    const blob: Blob = await new Promise((resolve, reject) => {
      srcCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas toBlob 失败'))),
        'image/png'
      );
    });

    // 调用 imgly 抠图，传入 Blob
    const outBlob = await imglyRemoveBg(blob);
    // 将 Blob 转为 ImageBitmap 并绘制到 Canvas（保留透明背景）
    const bitmap = await createImageBitmap(outBlob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    return canvas;
  } catch (error) {
    console.error('抠图失败:', error);
    throw new Error('抠图失败，请检查网络或重试');
  }
}

/**
 * 将透明背景的 Canvas 合成到白色底色上（便于预览）
 */
export function compositeWhiteBg(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0);
  return canvas;
}

/**
 * 简单降级方案：如果主方案失败，用颜色检测法移除纯色背景（备用）
 */
export function simpleRemoveBg(canvas: HTMLCanvasElement, bgColor?: [number, number, number]): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  // 如果未指定背景色，取左上角像素颜色作为背景色
  if (!bgColor) {
    bgColor = [data[0], data[1], data[2]];
  }
  const threshold = 30; // 颜色容差
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dr = Math.abs(r - bgColor[0]);
    const dg = Math.abs(g - bgColor[1]);
    const db = Math.abs(b - bgColor[2]);
    if (dr < threshold && dg < threshold && db < threshold) {
      // 设为透明
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  // 再填充白色背景
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = canvas.width;
  resultCanvas.height = canvas.height;
  const resultCtx = resultCanvas.getContext('2d')!;
  resultCtx.fillStyle = '#ffffff';
  resultCtx.fillRect(0, 0, canvas.width, canvas.height);
  resultCtx.drawImage(canvas, 0, 0);
  return resultCanvas;
}
