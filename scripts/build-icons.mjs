import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const PAPER = [0xf8, 0xf4, 0xf0];
const INK = [0x1f, 0x6f, 0x5c];
const WHITE = [0xff, 0xff, 0xff];

function canvas(size, bg) {
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255;
  }
  return { size, px };
}

function blend(c, x, y, rgb, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const i = (y * c.size + x) * 4;
  for (let k = 0; k < 3; k++) c.px[i + k] = Math.round(c.px[i + k] * (1 - a) + rgb[k] * a);
}

function fill(c, rgb, inside) {
  const S = 3;
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      let hits = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          if (inside(x + (sx + 0.5) / S, y + (sy + 0.5) / S)) hits++;
        }
      }
      if (hits) blend(c, x, y, rgb, hits / (S * S));
    }
  }
}

const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function bar(x1, y1, x2, y2, w) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  return (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    return (x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2 <= (w / 2) ** 2;
  };
}

const CRC = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png({ size, px }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mark(size, { maskable = false } = {}) {
  const c = canvas(size, maskable ? INK : PAPER);
  const u = size / 24;
  const scale = maskable ? 0.78 : 1;
  const at = (n) => (n - 12) * u * scale + size / 2;

  if (!maskable) fill(c, INK, disc(size / 2, size / 2, 10.5 * u));

  const floors = 5;
  for (let i = 0; i < floors; i++) {
    const angle = -0.5 + i * (1 / (floors - 1));
    const y = 6.6 + i * 2.7;
    const half = 3.4;
    fill(c, WHITE, bar(
      at(12 - half * Math.cos(angle)), at(y - half * Math.sin(angle)),
      at(12 + half * Math.cos(angle)), at(y + half * Math.sin(angle)),
      1.7 * u * scale,
    ));
  }
  return c;
}

mkdirSync('app/icons', { recursive: true });
const out = [
  ['app/icons/icon-180.png', mark(180)],
  ['app/icons/icon-192.png', mark(192)],
  ['app/icons/icon-512.png', mark(512)],
  ['app/icons/icon-maskable-512.png', mark(512, { maskable: true })],
];
for (const [file, c] of out) {
  const buf = png(c);
  writeFileSync(file, buf);
  console.log(`-> ${file}  ${c.size}×${c.size}, ${(buf.length / 1024).toFixed(1)} KB`);
}
