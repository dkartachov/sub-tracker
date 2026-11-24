/**
 * Draws the app icon, Android adaptive icon layers, splash image and notification icon into
 * assets/images, and the Google Play icon and feature graphic into assets/store. Run with `npm run icons` after changing the drawing below. No dependencies: shapes
 * are signed distance functions, supersampled for smooth edges, written as PNGs with node:zlib.
 *
 * The mark is a renewal arrow (an almost-closed ring with an arrowhead) around a coin.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const TOP = [99, 102, 241]; // #6366F1
const BOTTOM = [67, 56, 202]; // #4338CA
const WHITE = [255, 255, 255];

// --- Shapes, in a unit square centered on (0, 0), y down. Negative distance is inside. ---

const RING_RADIUS = 0.3;
const RING_HALF_WIDTH = 0.055;
/** The ring's gap, around the top right, in radians clockwise from the +x axis (y down). */
const GAP_START = -Math.PI / 2 - 0.2;
const GAP_END = -Math.PI / 2 + 0.75;

function ring(x, y) {
  const angle = Math.atan2(y, x);
  const inGap = angle > GAP_START && angle < GAP_END;
  if (!inGap) return Math.abs(Math.hypot(x, y) - RING_RADIUS) - RING_HALF_WIDTH;
  // Round caps at both ends of the gap.
  const cap = (a) => Math.hypot(x - RING_RADIUS * Math.cos(a), y - RING_RADIUS * Math.sin(a)) - RING_HALF_WIDTH;
  return Math.min(cap(GAP_START), cap(GAP_END));
}

/** Distance to a triangle, from Inigo Quilez's 2D SDFs. */
function triangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const edges = [
    [ax, ay, bx, by],
    [bx, by, cx, cy],
    [cx, cy, ax, ay],
  ];
  let d = Infinity;
  let sign = 0;
  for (const [x0, y0, x1, y1] of edges) {
    const ex = x1 - x0;
    const ey = y1 - y0;
    const wx = px - x0;
    const wy = py - y0;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
    sign += Math.sign(ex * wy - ey * wx);
  }
  return Math.abs(sign) === 3 ? -d : d;
}

/** The arrowhead at the gap's start, pointing clockwise along the ring. */
function arrowhead(x, y) {
  const a = GAP_START;
  const cx = RING_RADIUS * Math.cos(a);
  const cy = RING_RADIUS * Math.sin(a);
  // Clockwise tangent (y down) and outward normal.
  const tx = -Math.sin(a);
  const ty = Math.cos(a);
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  const size = 0.13;
  const tip = [cx + tx * size * 1.1, cy + ty * size * 1.1];
  const left = [cx + nx * size, cy + ny * size];
  const right = [cx - nx * size, cy - ny * size];
  return triangle(x, y, tip, left, right) - 0.012;
}

function coin(x, y) {
  return Math.hypot(x, y) - 0.12;
}

function mark(x, y) {
  return Math.min(ring(x, y), arrowhead(x, y), coin(x, y));
}

// --- Rendering ---

const SAMPLES = 4;

/** Coverage of `shape` over the pixel, 0 to 1, with `scale` the mark's size relative to the image. */
function coverage(shape, px, py, size, scale) {
  let inside = 0;
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const x = ((px + (sx + 0.5) / SAMPLES) / size - 0.5) / scale;
      const y = ((py + (sy + 0.5) / SAMPLES) / size - 0.5) / scale;
      if (shape(x, y) < 0) inside++;
    }
  }
  return inside / (SAMPLES * SAMPLES);
}

function render(size, { background, scale, color = WHITE }) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    const t = py / (size - 1);
    const bg = TOP.map((top, i) => Math.round(top + (BOTTOM[i] - top) * t));
    for (let px = 0; px < size; px++) {
      const a = coverage(mark, px, py, size, scale);
      const o = (py * size + px) * 4;
      if (background) {
        for (let i = 0; i < 3; i++) pixels[o + i] = Math.round(bg[i] + (color[i] - bg[i]) * a);
        pixels[o + 3] = 255;
      } else {
        for (let i = 0; i < 3; i++) pixels[o + i] = color[i];
        pixels[o + 3] = Math.round(a * 255);
      }
    }
  }
  return encodePng(size, size, pixels);
}

// --- PNG ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** `channels` is 4 for RGBA, or 3 for RGB where an image can't have transparency. */
function encodePng(width, height, pixels, channels = 4) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = channels === 4 ? 6 : 2; // RGBA or RGB
  const stride = width * channels;
  const rows = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) pixels.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Google Play feature graphic ---

/**
 * Shapes for the feature graphic, in pixels. Each layer is painted over the ones before it, inside
 * its bounding box `[x0, y0, x1, y1]`. A `blur` softens the edge over that many pixels, for shadows.
 */
const roundedRect = (cx, cy, halfWidth, halfHeight, radius) => (x, y) => {
  const qx = Math.abs(x - cx) - halfWidth + radius;
  const qy = Math.abs(y - cy) - halfHeight + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));

function bar(left, cy, width, halfHeight, color, opacity = 1) {
  return {
    shape: roundedRect(left + width / 2, cy, width / 2, halfHeight, halfHeight),
    color,
    opacity,
    box: [left - 2, cy - halfHeight - 2, left + width + 2, cy + halfHeight + 2],
  };
}

/** A subscription row like the app's list: category dot, name and date lines, and an amount. */
function card(cy, { category, nameWidth, dateWidth, amountWidth }) {
  const [left, right, halfHeight] = [540, 920, 42];
  const cx = (left + right) / 2;
  const halfWidth = (right - left) / 2;
  return [
    {
      shape: roundedRect(cx, cy + 8, halfWidth, halfHeight, 22),
      color: [24, 20, 90],
      opacity: 0.25,
      blur: 24,
      box: [left - 40, cy - halfHeight - 30, right + 40, cy + halfHeight + 50],
    },
    {
      shape: roundedRect(cx, cy, halfWidth, halfHeight, 22),
      color: WHITE,
      opacity: 1,
      box: [left - 2, cy - halfHeight - 2, right + 2, cy + halfHeight + 2],
    },
    { shape: circle(left + 46, cy, 22), color: hex(category), opacity: 1, box: [left + 20, cy - 26, left + 72, cy + 26] },
    bar(left + 86, cy - 12, nameWidth, 8, [31, 32, 51], 0.85),
    bar(left + 86, cy + 14, dateWidth, 6, [139, 141, 152], 0.55),
    bar(right - 28 - amountWidth, cy, amountWidth, 9, hex('#4F46E5')),
  ];
}

/** The mark on the left and three subscription rows on the right, over the icon's gradient. */
function renderFeatureGraphic() {
  const [width, height] = [1024, 500];
  const [markX, markY, markScale] = [285, 250, 430];
  const layers = [
    {
      shape: (x, y) => mark((x - markX) / markScale, (y - markY) / markScale) * markScale,
      color: WHITE,
      opacity: 1,
      box: [markX - 230, markY - 230, markX + 230, markY + 230],
    },
    ...card(146, { category: '#E5484D', nameWidth: 150, dateWidth: 90, amountWidth: 64 }),
    ...card(250, { category: '#30A46C', nameWidth: 110, dateWidth: 112, amountWidth: 52 }),
    ...card(354, { category: '#0090FF', nameWidth: 132, dateWidth: 80, amountWidth: 72 }),
  ];

  const pixels = Buffer.alloc(width * height * 3);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // A diagonal take on the icon's top-to-bottom gradient.
      const t = 0.7 * (py / (height - 1)) + 0.3 * (px / (width - 1));
      const color = TOP.map((top, i) => top + (BOTTOM[i] - top) * t);
      for (const { shape, color: fill, opacity, blur, box } of layers) {
        if (px < box[0] || px > box[2] || py < box[1] || py > box[3]) continue;
        let a;
        if (blur) {
          a = Math.min(1, Math.max(0, 0.5 - shape(px + 0.5, py + 0.5) / blur));
        } else {
          let inside = 0;
          for (let sy = 0; sy < SAMPLES; sy++) {
            for (let sx = 0; sx < SAMPLES; sx++) {
              if (shape(px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES) < 0) inside++;
            }
          }
          a = inside / (SAMPLES * SAMPLES);
        }
        a *= opacity;
        for (let i = 0; i < 3; i++) color[i] += (fill[i] - color[i]) * a;
      }
      const o = (py * width + px) * 3;
      for (let i = 0; i < 3; i++) pixels[o + i] = Math.round(color[i]);
    }
  }
  return encodePng(width, height, pixels, 3);
}

const outputs = {
  'images/icon.png': render(1024, { background: true, scale: 0.9 }),
  // Android masks adaptive icons to the middle 66%, so the mark sits inside that.
  'images/android-icon-foreground.png': render(1024, { background: false, scale: 0.6 }),
  'images/android-icon-monochrome.png': render(1024, { background: false, scale: 0.6 }),
  'images/splash-icon.png': render(512, { background: false, scale: 0.95 }),
  'images/notification-icon.png': render(96, { background: false, scale: 0.95 }),
  'images/favicon.png': render(48, { background: true, scale: 0.9 }),
  // The Google Play listing: a full-bleed square icon (Play rounds the corners itself) and a
  // 1024x500 feature graphic, which can't have transparency.
  'store/play-icon.png': render(512, { background: true, scale: 0.9 }),
  'store/feature-graphic.png': renderFeatureGraphic(),
};
for (const [name, png] of Object.entries(outputs)) {
  const path = join(ASSETS_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
  console.log(`wrote assets/${name}`);
}
