import { lasting, laterKey, settled } from '/daily.mjs';
import { FOOD_MOST, GROUP_NAMES, TYPE_NAMES, WHAT, assemble, flags, typical } from '/bygg/handmade.mjs';

const el = (id) => document.getElementById(id);
const make = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};
const dayName = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
const sentAt = (at) => new Date(at).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const span = ([a, b]) => (a === b ? `${a}` : `${a}–${b}`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fill = (node, ...children) => node.replaceChildren(...children.filter((c) => c !== null && c !== undefined && c !== false));

const load = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const [review, quiz, all] = await Promise.all([load('/dev/data/review.json'), load('/data/quiz.json'), load('/bygg/data/all.json')]);

function unusual(entries) {
  const t = typical(entries);
  const out = [];
  if (!t.lead.usual) out.push(`första frågan är ${t.lead.now}`);
  for (const r of t.rows) {
    if (!r.usual) out.push(`${r.n} ${GROUP_NAMES[r.group][r.n === 1 ? 0 : 1]}, brukar vara ${span(r.range)}`);
    for (const c of r.types) if (!c.usual) out.push(`${c.n} × ${TYPE_NAMES[c.type]} bland ${GROUP_NAMES[r.group][1]}, brukar vara ${span(c.range)}`);
  }
  if (!t.food.usual) out.push(`${t.food.n} krogar, brukar vara högst ${FOOD_MOST}`);
  return out;
}

function start() {
  const inGame = new Set(quiz.items.map((it) => it.name));
  const items = settled(quiz.items);
  const decoys = lasting(quiz.decoys ?? []);
  const others = new Map(settled((all?.items ?? []).filter((it) => !inGame.has(it.name))).map((it) => [it.name, it]));
  const find = ({ target, at }) => (at ? null : others.get(target) ?? null);

  const tried = review.days.filter((d) => d.date && !d.taken).map((d) => ['dag', `${d.date}.${d.pack}`]);

  const behind = Math.round((Date.now() - Date.parse(`${review.today}T00:00:00`)) / 86400000);
  fill(el('summary'),
    `${plural(review.days.filter((d) => !d.taken).length, 'dag väntar', 'dagar väntar')} · ${plural(review.days.filter((d) => d.taken).length, 'är inlagd', 'är inlagda')} · hämtade ${dayName(review.today)} · varje dag får första lediga fredag från ${dayName(review.soonest)}`,
    behind >= 1 ? make('span', { className: 'warn', textContent: ` Hämtat för ${plural(behind, 'dag', 'dagar')} sedan: kör review igen.` }) : null,
  );

  const cards = review.days.map((d) => {
    const entries = assemble(d.slots, items, decoys, find);
    const flagged = flags(entries);
    const outside = new Set(d.outside);
    const qs = make('ol', { className: 'qs' }, ...entries.map((e, n) => {
      const away = outside.has(e.target);
      const chips = flagged[n]
        .filter(([, text]) => !(away && (text === e.problem || text === 'finns inte i spelet än')))
        .map(([kind, text]) => make('span', { className: `chip ${kind}`, textContent: text }));
      if (away) chips.push(make('span', { className: 'chip warn', textContent: 'inte i spelet än' }));
      const type = e.group ? `${TYPE_NAMES[e.type] ?? e.type}, ${GROUP_NAMES[e.group][0]}` : TYPE_NAMES[e.type] ?? e.type;
      return make('li', {}, make('strong', { textContent: e.target }), ' ', make('span', { className: 'type', textContent: type }), ...chips);
    }));
    const odd = unusual(entries);

    const why = [];
    if (d.outside.length) why.push(`Kan inte tas med än: ${d.outside.join(', ')} finns inte i spelet.`);
    if (d.hidden) why.push('Kan inte tas med: namnet eller titeln har tecken som inte syns.');
    if (!why.length && !d.date) why.push('Inget datum de närmaste fyra månaderna passar.');

    const state = d.taken ? `Inlagd: ${dayName(d.date)}${d.edited ? ', ändrad sedan den skickades in' : ''}` : d.date ? `Förslag: ${dayName(d.date)}` : 'Väntar';
    const week = d.date ? make('a', { textContent: 'Dagarna runt', target: '_blank', href: `/dev/week.html?${new URLSearchParams([['from', laterKey(d.date, -3)], ['days', 10], ...tried])}` }) : null;
    const builder = make('a', { textContent: 'Öppna i byggaren', href: `/bygg/#dag=${d.pack}`, target: '_blank' });

    const root = make('article', { className: 'day' },
      make('div', { className: 'head' },
        make('span', { className: 'id', textContent: `#${d.id}` }),
        make('h2', { textContent: `${d.title ? `”${d.title}”` : 'Dagens frågor'} av ${d.name || 'en spelare'}` }),
      ),
      make('p', { className: 'meta', textContent: [`skickad ${sentAt(d.at)}`, `har spelat ${plural(d.played, 'dag', 'dagar')}`, d.same.length && `samma spelare som ${d.same.map((id) => `#${id}`).join(', ')}`].filter(Boolean).join(' · ') }),
      d.remark ? make('p', { className: 'remark', textContent: d.remark }) : null,
      d.notes.length ? make('p', { className: 'meta', textContent: 'Förslag om vad spelet frågar, som inte ändrar dagen:' }) : null,
      d.notes.length ? make('ul', { className: 'notes' }, ...d.notes.map((n) => make('li', { textContent: `${WHAT[n.what]}: ${n.target}${n.text ? ` – ${n.text}` : ''}` }))) : null,
      qs,
      make('p', { className: 'usual soft', textContent: odd.length ? `Ovanligt: ${odd.join(' · ')}.` : 'Som en vanlig dag.' }),
      ...why.map((text) => make('p', { className: 'blocked warn', textContent: text })),
      make('div', { className: 'decide' },
        make('strong', { textContent: state }),
        make('span', { className: 'links' }, builder, week),
      ),
    );
    root.dataset.choice = d.taken ? 'take' : 'wait';
    return root;
  });
  el('days').replaceChildren(...cards);
}

if (review && quiz) start();
else el('summary').textContent = 'Kör node scripts/handmade.mjs review först, och ladda om sidan.';
