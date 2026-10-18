import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync, readFileSync } from 'node:fs';
import { resolve, normalize, extname } from 'node:path';
import { MOUNTS, MIME } from './lib/site.mjs';
import { localD1 } from './lib/d1.mjs';
import { localR2 } from './lib/r2.mjs';
import { dailySet, dateKey, random, setId } from '../app/daily.mjs';
import worker from '../worker/index.mjs';
import { catchUp } from '../worker/live.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(arg('--port', 8080));
const host = arg('--host', '127.0.0.1');
const root = resolve(process.cwd());
const db = localD1(arg('--db', ':memory:'));
const fake = Number(arg('--fake', 0));
const trickle = Number(arg('--trickle', 0));
const env = { DB: db, LIVE: localR2(), LIVE_URL: '/live' };
const ctx = { waitUntil: (promise) => promise.catch((err) => console.error(err)) };

function fakePlayers() {
  const { items } = JSON.parse(readFileSync('build/data/quiz.json', 'utf8'));
  const key = dateKey();
  const set = dailySet(items, key);
  const rng = random(set.length);
  const ease = set.map(() => 0.15 + rng() * 0.8);
  let p = 0;
  return async (count) => {
    for (const end = p + count; p < end; p++) {
      const skill = rng() * 0.4 - 0.2;
      const scores = ease.map((e) => (rng() < e + skill ? 80 + Math.floor(rng() * 21) : Math.floor(rng() ** 1.5 * 80)));
      const total = scores.reduce((a, b) => a + b, 0);
      await db.prepare('INSERT INTO results (day, player, set_id, total, scores, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
        .bind(key, `fake-${p}`, setId(set), total, JSON.stringify(scores), Date.now()).run();
    }
  };
}

if (fake || trickle) {
  const addFake = fakePlayers();
  await addFake(fake);
  if (trickle) setInterval(() => addFake(1), trickle * 1000);
}
await catchUp(env);
setInterval(() => worker.scheduled({ scheduledTime: Date.now() }, env, ctx), 60000);

async function api(req, res, url) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const reply = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body }), env, ctx);
  res.writeHead(reply.status, Object.fromEntries(reply.headers));
  res.end(Buffer.from(await reply.arrayBuffer()));
  console.log(`${reply.status} ${req.method} ${url.pathname}`);
}

const mounts = [...MOUNTS, { url: '/dev/', dir: 'dev' }]
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

async function live(res, url) {
  const file = await env.LIVE.get(decodeURIComponent(url.pathname.slice('/live/'.length)));
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': file.httpMetadata.contentType, 'cache-control': file.httpMetadata.cacheControl });
  res.end(file.body);
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/live/')) {
    live(res, url).catch((err) => {
      console.error(err);
      res.writeHead(500);
      res.end();
    });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((err) => {
      console.error(err);
      res.writeHead(500);
      res.end();
    });
    return;
  }

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
