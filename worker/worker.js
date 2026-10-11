export const MAX_TOTAL = 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

export function plausibleDay(day, now = Date.now()) {
  if (typeof day !== 'string' || !DAY.test(day)) return false;
  const noon = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(noon) && Math.abs(noon - now) <= 1.5 * DAY_MS;
}

export function validTotal(total) {
  return Number.isInteger(total) && total >= 0 && total <= MAX_TOTAL;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ORIGINS ?? '').split(',').map((o) => o.trim());
  if (!allowed.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function counts(env, day) {
  const { results } = await env.DB
    .prepare('SELECT total, n FROM scores WHERE day = ?1 ORDER BY total')
    .bind(day)
    .all();
  return { day, counts: results.map((r) => [r.total, r.n]) };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname !== '/scores') return json({ error: 'not found' }, 404, cors);

    if (request.method === 'GET') {
      const day = url.searchParams.get('day');
      if (!plausibleDay(day)) return json({ error: 'bad day' }, 400, cors);
      return json(await counts(env, day), 200, { ...cors, 'Cache-Control': 'public, max-age=60' });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!plausibleDay(body?.day) || !validTotal(body?.total)) return json({ error: 'bad score' }, 400, cors);
      await env.DB
        .prepare('INSERT INTO scores (day, total, n) VALUES (?1, ?2, 1) ON CONFLICT (day, total) DO UPDATE SET n = n + 1')
        .bind(body.day, body.total)
        .run();
      return json(await counts(env, body.day), 200, cors);
    }

    return json({ error: 'method not allowed' }, 405, cors);
  },
};
