import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { resolve, normalize, extname } from 'node:path';
import { MOUNTS, MIME } from './lib/site.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(arg('--port', 8080));
const host = arg('--host', '127.0.0.1');
const root = resolve(process.cwd());

const mounts = MOUNTS
  .map((m) => ({ ...m, base: m.url.replace(/\/+$/, '') }))
  .sort((a, b) => b.base.length - a.base.length);

function toFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/\/+$/, '') || '/';
  for (const m of mounts) {
    if (m.file && clean === m.base) return resolve(root, m.file);
    if (m.dir && (clean === m.base || clean.startsWith(`${m.base}/`))) {
      const rel = clean.slice(m.base.length + 1);
      const file = resolve(root, m.dir, rel || 'index.html');
      if (!file.startsWith(resolve(root, m.dir))) return null;
      if (existsSync(file) && statSync(file).isDirectory()) return resolve(file, 'index.html');
      if (existsSync(file)) return file;
    }
  }
  return null;
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  const file = toFile(url.pathname);
  if (!file || !existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`404 ${url.pathname}\n`);
    console.log(`404 ${url.pathname}`);
    return;
  }

  const { size } = statSync(file);
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store' };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range) {
    const [, rawStart, rawEnd] = range;
    const start = rawStart ? Number(rawStart) : size - Number(rawEnd);
    const end = rawStart && rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
    if (start >= size || start < 0 || end < start) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, 'content-length': size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}).listen(port, host, () => {
  console.log(`serving on http://${host}:${port}`);
  for (const m of mounts) {
    const src = m.file ?? m.dir;
    console.log(`  ${m.url.padEnd(16)} ← ${src}${existsSync(resolve(root, src)) ? '' : '   ⚠ missing, run the build'}`);
  }
});
