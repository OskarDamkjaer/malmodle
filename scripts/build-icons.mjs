import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const WHITE = [0xff, 0xff, 0xff];

function canvas(w, h, bg) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255;
  }
  return { w, h, px };
}

function blend(c, x, y, rgb, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  for (let k = 0; k < 3; k++) c.px[i + k] = Math.round(c.px[i + k] * (1 - a) + rgb[k] * a);
}

function fill(c, rgb, inside) {
  const S = 3;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
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

const polygon = (pts) => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

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

function png({ w, h, px }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function tower() {
  const floors = 7;
  const top = 3;
  const bottom = 21;
  const gap = 0.5;
  const cx = 11.2;
  const tall = (bottom - top - gap * (floors - 1)) / floors;
  const along = (y) => (bottom - y) / (bottom - top);
  const twist = (y) => along(y) * (Math.PI / 2) * 0.85 + 0.12;
  const half = (y) => 2.2 - along(y) * 0.4;
  const corner = (y, k) => cx + half(y) * Math.SQRT2 * Math.cos(twist(y) + Math.PI / 4 + (k * Math.PI) / 2);
  const depth = (y, k) => Math.sin(twist(y) + Math.PI / 4 + (k * Math.PI) / 2);
  const edge = (y) => Math.max(...[0, 1, 2, 3].map((k) => corner(y, k)));
  const mast = cx + 3.1;
  const faces = [];
  const spine = [[mast, top - 0.4, mast, bottom]];
  for (let i = 0; i < floors; i++) {
    const y1 = bottom - i * (tall + gap);
    const y0 = y1 - tall;
    const mid = (y0 + y1) / 2;
    const ks = [0, 1, 2, 3].sort((a, b) => depth(mid, b) - depth(mid, a));
    const front = ks[0];
    const [left, right] = [ks[1], ks[2]].sort((a, b) => corner(mid, a) - corner(mid, b));
    const quad = (a, b) => [[corner(y0, a), y0], [corner(y0, b), y0], [corner(y1, b), y1], [corner(y1, a), y1]];
    faces.push({ lit: true, pts: quad(left, front) });
    faces.push({ lit: false, pts: quad(front, right) });
    spine.push([mast, y1, edge(mid), mid]);
  }
  return { faces, spine };
}

const SKY = [0x6c, 0xac, 0xe4];
const SHADE = [0xd2, 0xe6, 0xf7];
const hex = (rgb) => `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
const round = (n) => Math.round(n * 100) / 100;

function svg() {
  const { faces, spine } = tower();
  const shapes = faces.map((f) => `  <path d="M${f.pts.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z" fill="${hex(f.lit ? WHITE : SHADE)}"/>`);
  const steel = spine.map(([x0, y0, x1, y1]) => `M${round(x0)} ${round(y0)}L${round(x1)} ${round(y1)}`).join('');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">',
    `  <rect width="24" height="24" rx="5" fill="${hex(SKY)}"/>`,
    ...shapes,
    `  <path d="${steel}" stroke="${hex(WHITE)}" stroke-width="0.45" stroke-linecap="round" fill="none"/>`,
    '</svg>',
    '',
  ].join('\n');
}

function draw(c, u) {
  const ax = (n) => (n - 12) * u + c.w / 2;
  const ay = (n) => (n - 12) * u + c.h / 2;
  const { faces, spine } = tower();
  for (const f of faces) fill(c, f.lit ? WHITE : SHADE, polygon(f.pts.map(([x, y]) => [ax(x), ay(y)])));
  for (const [x0, y0, x1, y1] of spine) fill(c, WHITE, bar(ax(x0), ay(y0), ax(x1), ay(y1), 0.45 * u));
  return c;
}

const mark = (size, { maskable = false } = {}) => draw(canvas(size, size, SKY), (size / 24) * (maskable ? 0.78 : 1));

const card = (w, h) => draw(canvas(w, h, SKY), h / 24 * 0.85);

mkdirSync('app/icons', { recursive: true });
const out = [
  ['app/icons/icon-180.png', mark(180)],
  ['app/icons/icon-192.png', mark(192)],
  ['app/icons/icon-512.png', mark(512)],
  ['app/icons/icon-maskable-512.png', mark(512, { maskable: true })],
  ['app/icons/og.png', card(1200, 630)],
];
writeFileSync('app/icons/icon.svg', svg());
console.log('-> app/icons/icon.svg');
for (const [file, c] of out) {
  const buf = png(c);
  writeFileSync(file, buf);
  console.log(`-> ${file}  ${c.w}×${c.h}, ${(buf.length / 1024).toFixed(1)} KB`);
}
