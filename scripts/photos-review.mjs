import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { thumbnail } from './lib/mapillary.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(arg('--port', 8081));
const host = arg('--host', '127.0.0.1');
const PICKS = 'photos/photos.json';
const QUEUE = 'data/cache/photos/final-queue.json';

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
    if (url.pathname === '/queue') return send(res, 200, 'application/json', await readFile(QUEUE).catch(() => '{"items":[]}'));
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
