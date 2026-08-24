import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, drawFn) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawFn(x / size, y / size, Math.min(x, size - 1 - x, y, size - 1 - y));
      row.set([r, g, b, a], 1 + x * 4);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BG = { r: 139 / 255, g: 92 / 255, b: 246 / 255 };

function roundedRectAlpha(u, v, radius = 0.22) {
  const rx = radius;
  const cx = Math.min(Math.max(u, rx), 1 - rx);
  const cy = Math.min(Math.max(v, rx), 1 - rx);
  const dx = u - cx;
  const dy = v - cy;
  const insideRounded = dx * dx + dy * dy <= rx * rx || (u >= rx && u <= 1 - rx) || (v >= rx && v <= 1 - rx);
  const insideSquare = u >= 0 && u <= 1 && v >= 0 && v <= 1;
  if (!insideSquare) return 0;
  if (!insideRounded && Math.hypot(dx, dy) > rx + 1.5 / 512) return 0;
  return 255;
}

function letterW(px, py) {
  const strokes = [
    { x1: 0.3, y1: 0.34, x2: 0.4, y2: 0.66, w: 0.055 },
    { x1: 0.4, y1: 0.66, x2: 0.5, y2: 0.42, w: 0.055 },
    { x1: 0.5, y2: 0.66, x2: 0.6, y1: 0.42, w: 0.055, swap: true },
    { x1: 0.6, y1: 0.42, x2: 0.7, y2: 0.66, w: 0.055 },
  ];
  for (const s of strokes) {
    const x1 = s.x1, x2 = s.x2, y1 = s.swap ? s.y2 : s.y1, y2 = s.swap ? s.y1 : s.y2;
    const vx = x2 - x1, vy = y2 - y1;
    const len2 = vx * vx + vy * vy;
    const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / len2));
    const dx = px - (x1 + t * vx);
    const dy = py - (y1 + t * vy);
    if (dx * dx + dy * dy <= s.w * s.w) return true;
  }
  return false;
}

function drawStandard(xn, yn) {
  const bgA = roundedRectAlpha(xn, yn);
  if (bgA === 0) return [0, 0, 0, 0];
  const onW = letterW(xn, yn);
  return onW
    ? [255, 255, 255, 255]
    : [
        Math.round(BG.r * 255),
        Math.round(BG.g * 255),
        Math.round(BG.b * 255),
        bgA,
      ];
}

mkdirSync("public", { recursive: true });

writeFileSync("public/icon-192.png", png(192, drawStandard));
writeFileSync("public/icon-512.png", png(512, drawStandard));

writeFileSync(
  "public/icon-maskable-512.png",
  png(512, (xn, yn) => {
    const cxn = 0.5 + (xn - 0.5) / 0.78;
    const cyn = 0.5 + (yn - 0.5) / 0.78;
    const bgA =
      Math.hypot((xn - 0.5) * 2, (yn - 0.5) * 2) <= 1 ? 255 : 0;
    if (bgA === 0) return [0, 0, 0, 0];
    const onW = cxn > 0 && cxn < 1 && cyn > 0 && cyn < 1 && letterW(cxn, cyn);
    return onW
      ? [255, 255, 255, 255]
      : [Math.round(BG.r * 255), Math.round(BG.g * 255), Math.round(BG.b * 255), 255];
  }),
);

writeFileSync(
  "public/apple-touch-icon.png",
  png(180, drawStandard),
);

console.log("icons written");
