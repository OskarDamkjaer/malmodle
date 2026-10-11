import { createServer } from 'node:http';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { thumbnail } from './lib/mapillary.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(arg('--port', 8081));
const host = arg('--host', '127.0.0.1');
const CANDIDATES = 'data/cache/photos/candidates';
const VERDICTS = 'data/cache/photos/verdicts';
const PICKS = 'photos/photos.json';

async function jsonFiles(dir) {
  try {
    const first = ['streets.json', 'gata.json'];
    const rank = (f) => (first.includes(f) ? first.indexOf(f) : first.length);
    return (await readdir(dir)).filter((f) => f.endsWith('.json')).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  } catch {
    return [];
  }
}

async function candidates() {
  const verdicts = {};
  for (const f of await jsonFiles(VERDICTS)) Object.assign(verdicts, JSON.parse(await readFile(`${VERDICTS}/${f}`, 'utf8')));
  const out = [];
  for (const f of await jsonFiles(CANDIDATES)) {
    const { source, licence, items } = JSON.parse(await readFile(`${CANDIDATES}/${f}`, 'utf8'));
    for (const item of items) {
      for (const s of item.samples) for (const d of s.directions) for (const img of d.images) if (verdicts[img.id]) img.review = verdicts[img.id];
      out.push({ ...item, source, licence, group: f.replace(/\.json$/, '') });
    }
  }
  return out;
}

async function picks() {
  try {
    return JSON.parse(await readFile(PICKS, 'utf8'));
  } catch {
    return {};
  }
}

async function savePicks(body) {
  const sorted = Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b, 'sv')));
  await mkdir('photos', { recursive: true });
  await writeFile(PICKS, `${JSON.stringify(sorted, null, 1)}\n`);
}

const send = (res, status, type, body) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', await readFile('scripts/photos-review.html'));
    if (url.pathname === '/candidates') return send(res, 200, 'application/json', JSON.stringify(await candidates()));
    if (url.pathname === '/picks' && req.method === 'GET') return send(res, 200, 'application/json', JSON.stringify(await picks()));
    if (url.pathname === '/picks' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      await savePicks(JSON.parse(body));
      return send(res, 200, 'application/json', '{"ok":true}');
    }
    const thumb = /^\/thumb\/mapillary\/(\d+)$/.exec(url.pathname);
    if (thumb) {
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=86400' });
      return res.end(await thumbnail(thumb[1]));
    }
    send(res, 404, 'text/plain', '404\n');
  } catch (err) {
    console.error(err.message);
    send(res, 500, 'text/plain', `${err.message}\n`);
  }
}).listen(port, host, () => console.log(`granska bilder på http://${host}:${port}`));
