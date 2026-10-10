export const MOUNTS = [
  { url: '/', dir: 'app' },
  { url: '/style.json', file: 'build/style.json' },
  { url: '/data/quiz.json', file: 'build/data/quiz.json' },
  { url: '/malmo.pmtiles', file: 'data/cache/malmo.pmtiles' },
];

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.pbf': 'application/x-protobuf',
  '.pmtiles': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
