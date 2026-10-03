import { PatternData } from "../types";

// Helper to draw watermark
const drawWatermark = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Ensure watermark is always upright and in correct position
  ctx.font = "bold 20px sans-serif";
  ctx.fillStyle = "rgba(148, 163, 184, 0.5)"; // Slate-400 with 0.5 opacity
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const text =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "PeterWu";
  ctx.fillText(text, width - 15, height - 15);
  ctx.restore();
};

interface DrawOptions {
  startX: number;
  startY: number;
  width: number;
  height: number;
  cellSize?: number;
  margin?: number;
  title?: string;
  beadShape: "round" | "square";
  hiddenBeadIds: Set<string>;
  rotation?: 0 | 180; // 0 = normal, 180 = rotated text/coords
}

export const drawPatternToCanvas = (
  data: PatternData,
  options: DrawOptions
): HTMLCanvasElement | null => {
  const {
    startX,
    startY,
    width,
    height,
    cellSize = 20,
    margin = 35,
    title,
    beadShape,
    hiddenBeadIds,
    rotation = 0,
  } = options;

  const canvasWidth = width * cellSize + margin;
  const canvasHeight = height * cellSize + margin + (title ? 30 : 0); // Extra space for title

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Fill white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // If rotation is 180, we rotate the entire context around the center.
  // This inverts the pattern (which matches P2's view from opposite side).
  // The text will be counter-rotated by drawText to remain upright for readability.
  if (rotation === 180) {
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    ctx.rotate(Math.PI);
    ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
  }

  // Title offset calculation
  let titleOffset = 0;
  if (title) {
    titleOffset = 30;
  }

  // Setup Text for coords
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#64748b"; // Slate-500

  // Helper to draw text with optional rotation
  const drawText = (text: string, x: number, y: number) => {
    ctx.save();
    ctx.translate(x, y);
    if (rotation === 180) {
      ctx.rotate(Math.PI);
    }
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  // Draw Title (Override previous simple fillText)
  if (title) {
    // Clear the simple title drawn above
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, titleOffset);

    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#334155";
    // If rotated, title should be at bottom? No, user said "Pattern unchanged".
    // Title position stays at top, but text itself is upside down?
    // Or Title moves to bottom?
    // Usually "Text Rotated" implies the header is now the footer.
    // But let's stick to "In-place rotation" or "Opposite side labeling".
    // If P2 holds paper upside down, the "Top" of the image becomes "Bottom".
    // So we should probably draw the title at the BOTTOM if rotation=180?
    // No, "Pattern Unchanged" means visual layout is same.
    // Just the glyphs are rotated.
    drawText(title, canvasWidth / 2, 20);
  }

  // Draw Top/Bottom Numbers (Columns)
  // If rotation=180, maybe we should draw them at the BOTTOM?
  // Let's stick to strict interpretation: "Pattern Unchanged, Text Rotated".
  // The numbers stay at the top, but are upside down.
  ctx.font = "bold 10px sans-serif";
  ctx.fillStyle = "#64748b";

  for (let x = 0; x < width; x++) {
    const absX = startX + x + 1;
    if (absX === 1 || absX % 5 === 0 || x === width - 1) {
      drawText(
        `${absX}`,
        margin + x * cellSize + cellSize / 2,
        titleOffset + margin / 2
      );
    }
  }

  // Draw Left Numbers (Rows)
  for (let y = 0; y < height; y++) {
    const absY = startY + y + 1;
    if (absY === 1 || absY % 5 === 0 || y === height - 1) {
      drawText(
        `${absY}`,
        margin / 2,
        titleOffset + margin + y * cellSize + cellSize / 2
      );
    }
  }

  // Move to grid area
  ctx.translate(margin, titleOffset + margin);

  // Draw Grid
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gridY = startY + y;
      const gridX = startX + x;

      // Boundary check
      if (gridY < 0 || gridX < 0 || gridY >= data.height || gridX >= data.width)
        continue;

      const bead = data.grid[gridY][gridX];

      // Background grid cell border
      ctx.strokeStyle = "#e2e8f0"; // Light grey
      ctx.lineWidth = 1;
      ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);

      if (bead && !hiddenBeadIds.has(bead.id)) {
        ctx.fillStyle = bead.hex;
        if (beadShape === "round") {
          // Draw Circular Bead
          ctx.beginPath();
          ctx.arc(
            x * cellSize + cellSize / 2,
            y * cellSize + cellSize / 2,
            cellSize / 2 - 1.5,
            0,
            2 * Math.PI
          );
          ctx.fill();
        } else {
          // Draw Square
          ctx.fillRect(
            x * cellSize + 1,
            y * cellSize + 1,
            cellSize - 2,
            cellSize - 2
          );
        }

        // Draw Bead ID
        ctx.font = "bold 7px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Calculate contrast color
        const r = parseInt(bead.hex.slice(1, 3), 16);
        const g = parseInt(bead.hex.slice(3, 5), 16);
        const b = parseInt(bead.hex.slice(5, 7), 16);
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        ctx.fillStyle = yiq >= 128 ? "#000000" : "#ffffff";

        drawText(
          bead.id,
          x * cellSize + cellSize / 2,
          y * cellSize + cellSize / 2
        );
      }
    }
  }

  // Overlay Grid System (Inverted Colors)
  ctx.save();
  ctx.globalCompositeOperation = "difference";
  ctx.strokeStyle = "#FFFFFF"; // White in difference mode = Invert underlying color

  // Vertical Lines
  for (let x = 0; x <= width; x++) {
    const absX = startX + x;
    let lineWidth = 0;

    if (absX % 10 === 0) {
      lineWidth = 2.5; // Bold line for 10s
    } else if (absX % 5 === 0) {
      lineWidth = 1; // Thin line for 5s
    }

    if (lineWidth > 0) {
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, height * cellSize);
      ctx.stroke();
    }
  }

  // Horizontal Lines
  for (let y = 0; y <= height; y++) {
    const absY = startY + y;
    let lineWidth = 0;

    if (absY % 10 === 0) {
      lineWidth = 2.5; // Bold line for 10s
    } else if (absY % 5 === 0) {
      lineWidth = 1; // Thin line for 5s
    }

    if (lineWidth > 0) {
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(width * cellSize, y * cellSize);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Always draw border around the chunk (in standard color)
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, width * cellSize, height * cellSize);

  // Draw Watermark
  drawWatermark(ctx, canvasWidth, canvasHeight);

  return canvas;
};

export const drawMaterialListToCanvas = (
  data: PatternData,
  activePaletteColors: import("../types").BeadColor[],
  hiddenBeadIds: Set<string>,
  excludeHidden: boolean,
  title: string
): HTMLCanvasElement | null => {
  // 1. Calculate items to show
  const items = activePaletteColors
    .filter((b) => data.counts[b.id])
    .filter((b) => !excludeHidden || !hiddenBeadIds.has(b.id))
    .sort((a, b) => (data.counts[b.id] || 0) - (data.counts[a.id] || 0));

  if (items.length === 0) return null;

  // 2. Constants
  const rowHeight = 40;
  const headerHeight = 60;
  const padding = 20;
  const colWidths = {
    swatch: 50,
    id: 80,
    name: 150,
    count: 80,
  };
  const canvasWidth =
    padding * 2 +
    colWidths.swatch +
    colWidths.id +
    colWidths.name +
    colWidths.count;
  const canvasHeight = headerHeight + items.length * rowHeight + padding * 2;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // 3. Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 4. Header
  ctx.fillStyle = "#334155"; // Slate-700
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, canvasWidth / 2, padding + 20);

  // 5. Draw Items
  let currentY = padding + headerHeight;

  items.forEach((bead, index) => {
    const isHidden = hiddenBeadIds.has(bead.id);
    const count = data.counts[bead.id];

    // Row Background (zebra striping)
    if (index % 2 === 0) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(
        padding,
        currentY - rowHeight / 2,
        canvasWidth - padding * 2,
        rowHeight
      );
    }

    // Opacity for hidden items if shown
    const globalAlpha = !excludeHidden && isHidden ? 0.3 : 1.0;
    ctx.globalAlpha = globalAlpha;

    let currentX = padding;

    // Swatch
    ctx.fillStyle = bead.hex;
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(currentX + colWidths.swatch / 2, currentY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    currentX += colWidths.swatch;

    // ID
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(bead.id, currentX, currentY);
    currentX += colWidths.id;

    // Name
    ctx.fillStyle = "#334155";
    ctx.font = "14px sans-serif";
    ctx.fillText(bead.name, currentX, currentY);
    currentX += colWidths.name;

    // Count
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${count}`, currentX + colWidths.count - 10, currentY);

    // Restore alpha
    ctx.globalAlpha = 1.0;

    currentY += rowHeight;
  });

  // Border
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    padding,
    padding + headerHeight - rowHeight / 2,
    canvasWidth - padding * 2,
    items.length * rowHeight
  );

  // Draw Watermark
  drawWatermark(ctx, canvasWidth, canvasHeight);

  return canvas;
};
