/**
 * Draws the app icon, Android adaptive icon layers, splash image and notification icon into
 * assets/images. Run with `npm run icons` after changing the drawing below. No dependencies: shapes
 * are signed distance functions, supersampled for smooth edges, written as PNGs with node:zlib.
 *
 * The mark is a renewal arrow (an almost-closed ring with an arrowhead) around a coin.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

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
  return encodePng(size, pixels);
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

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
const outputs = {
  'icon.png': render(1024, { background: true, scale: 0.9 }),
  // Android masks adaptive icons to the middle 66%, so the mark sits inside that.
  'android-icon-foreground.png': render(1024, { background: false, scale: 0.6 }),
  'android-icon-monochrome.png': render(1024, { background: false, scale: 0.6 }),
  'splash-icon.png': render(512, { background: false, scale: 0.95 }),
  'notification-icon.png': render(96, { background: false, scale: 0.95 }),
  'favicon.png': render(48, { background: true, scale: 0.9 }),
};
for (const [name, png] of Object.entries(outputs)) {
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`wrote assets/images/${name}`);
}
