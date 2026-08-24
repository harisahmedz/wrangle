import {
  SLIDE_PALETTES,
  type SlideContent,
} from "@/components/wrapped/slides";

const W = 1080;
const H = 1920;
const PAD = 96;
const FONT_STACK = `system-ui, -apple-system, "Segoe UI", sans-serif`;

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  type SpacingCtx = CanvasRenderingContext2D & { letterSpacing?: string };
  const c = ctx as SpacingCtx;
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawSlide(
  canvas: HTMLCanvasElement,
  slide: SlideContent,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const palette = SLIDE_PALETTES[slide.palette % SLIDE_PALETTES.length];

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, palette[0]);
  bg.addColorStop(1.35, palette[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.85, H * 0.16, 0, W * 0.85, H * 0.16, W * 0.7);
  glow.addColorStop(0, "rgba(167, 139, 250, 0.28)");
  glow.addColorStop(1, "rgba(167, 139, 250, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(231, 234, 240, 0.10)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(PAD * 0.9, H - PAD * 1.6, PAD * 2.4, 0, Math.PI * 2);
  ctx.stroke();

  const maxTextWidth = W - PAD * 2;

  ctx.textBaseline = "alphabetic";

  let y = 340;
  ctx.fillStyle = "rgba(231, 234, 240, 0.72)";
  ctx.font = `600 40px ${FONT_STACK}`;
  setLetterSpacing(ctx, 14);
  ctx.fillText(slide.eyebrow.toUpperCase(), PAD, y);
  setLetterSpacing(ctx, 0);

  y += slide.big ? 420 : 220;

  const headlineSize = slide.big ? 300 : 132;
  ctx.font = `900 ${headlineSize}px ${FONT_STACK}`;
  const headlineLines = wrapText(ctx, slide.headline, maxTextWidth);
  for (const line of headlineLines) {
    y += headlineSize * 1.06;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, PAD, y);
  }

  y += 96;
  ctx.font = `500 48px ${FONT_STACK}`;
  for (const line of slide.lines) {
    const wrapped = wrapText(ctx, line, maxTextWidth);
    for (const piece of wrapped) {
      y += 72;
      ctx.fillStyle = "rgba(231, 234, 240, 0.86)";
      ctx.fillText(piece, PAD, y);
    }
  }

  if (slide.footnote) {
    ctx.font = `400 36px ${FONT_STACK}`;
    ctx.fillStyle = "rgba(141, 149, 166, 0.95)";
    const wrapped = wrapText(ctx, slide.footnote, maxTextWidth);
    let fy = H - PAD - (wrapped.length - 1) * 52 - (slide.wordmark ? 140 : 60);
    fy = Math.min(fy, y + 80);
    for (const piece of wrapped) {
      ctx.fillText(piece, PAD, fy);
      fy += 52;
    }
  }

  if (slide.wordmark) {
    ctx.font = `700 44px ${FONT_STACK}`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    const mark = "wrangle ▪";
    const markWidth = ctx.measureText(mark).width;
    ctx.fillText(mark, W - PAD - markWidth, H - PAD);
  }

  roundRectPath(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, 64);
  ctx.strokeStyle = "rgba(231, 234, 240, 0.12)";
  ctx.lineWidth = 4;
  ctx.stroke();
}

export function renderSlideToBlob(slide: SlideContent): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  drawSlide(canvas, slide);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("toBlob failed"));
    }, "image/png");
  });
}
