import { lasting, laterKey, settled } from '/daily.mjs';
import { FOOD_MOST, GROUP_NAMES, TYPE_NAMES, WHAT, assemble, flags, typical } from '/bygg/handmade.mjs';

const KEY = 'malmodle-review';
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

  const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  const blocked = (d) => d.outside.length > 0 || d.hidden;
  const state = new Map(review.days.map((d) => {
    const s = saved[d.id] ?? {};
    const date = s.date && s.date !== s.was ? s.date : d.date ?? '';
    const choice = blocked(d) && s.choice === 'take' ? 'wait' : s.choice ?? 'wait';
    return [d.id, { choice, date, was: d.date ?? '' }];
  }));
  const save = () => localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(state)));

  const behind = Math.round((Date.now() - Date.parse(`${review.today}T00:00:00`)) / 86400000);
  fill(el('summary'),
    `${plural(review.days.length, 'dag väntar', 'dagar väntar')} · hämtade ${dayName(review.today)} · första möjliga datum ${dayName(review.soonest)} · förslagen är fredagar, minst ${review.apart} dagar från varandra och från dagarna som redan är inlagda.`,
    behind >= 1 ? make('span', { className: 'warn', textContent: ` Hämtat för ${plural(behind, 'dag', 'dagar')} sedan: kör review igen.` }) : null,
    review.scheduled.length ? make('br') : null,
    review.scheduled.length ? `Redan inlagda: ${review.scheduled.map((s) => `${dayName(s.day)}, ${s.by ?? 'en spelare'}${s.sent ? ` (#${s.sent})` : ''}`).join(' · ')}` : null,
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
    if (d.hidden) why.push('Kan inte tas med: namnet har tecken som inte syns.');
    if (!why.length && !d.date) why.push('Inget datum de närmaste fyra månaderna passar. Välj ett själv, så säger take varför.');

    const buttons = [['take', 'Ta med'], ['wait', 'Vänta'], ['decline', 'Avböj']].map(([choice, text]) => {
      const button = make('button', { type: 'button', textContent: text, disabled: choice === 'take' && blocked(d) });
      button.dataset.choice = choice;
      button.addEventListener('click', () => {
        state.get(d.id).choice = choice;
        save();
        refresh();
      });
      return button;
    });
    const date = make('input', { type: 'date', value: state.get(d.id).date, min: review.soonest, disabled: blocked(d) });
    date.addEventListener('change', () => {
      state.get(d.id).date = date.value;
      save();
      refresh();
    });
    const note = make('span', { className: 'state soft' });
    const week = make('a', { textContent: 'Dagarna runt', target: '_blank' });
    const builder = make('a', { textContent: 'Öppna i byggaren', href: `/bygg/#dag=${d.pack}`, target: '_blank' });

    const root = make('article', { className: 'day' },
      make('div', { className: 'head' },
        make('span', { className: 'id', textContent: `#${d.id}` }),
        make('h2', { textContent: `Dagens frågor av ${d.name || 'en spelare'}` }),
      ),
      make('p', { className: 'meta', textContent: [`skickad ${sentAt(d.at)}`, `har spelat ${plural(d.played, 'dag', 'dagar')}`, d.same.length && `samma spelare som ${d.same.map((id) => `#${id}`).join(', ')}`].filter(Boolean).join(' · ') }),
      d.remark ? make('p', { className: 'remark', textContent: d.remark }) : null,
      d.notes.length ? make('p', { className: 'meta', textContent: 'Förslag om vad spelet frågar, som inte ändrar dagen:' }) : null,
      d.notes.length ? make('ul', { className: 'notes' }, ...d.notes.map((n) => make('li', { textContent: `${WHAT[n.what]}: ${n.target}${n.text ? ` – ${n.text}` : ''}` }))) : null,
      qs,
      make('p', { className: 'usual soft', textContent: odd.length ? `Ovanligt: ${odd.join(' · ')}.` : 'Som en vanlig dag.' }),
      ...why.map((text) => make('p', { className: 'blocked warn', textContent: text })),
      make('div', { className: 'decide' },
        make('div', { className: 'choices' }, ...buttons),
        make('label', {}, 'Datum', date),
        note,
        make('span', { className: 'links' }, builder, week),
      ),
    );
    return { d, root, buttons, date, note, week };
  });
  el('days').replaceChildren(...cards.map((c) => c.root));

  function refresh() {
    const taking = cards.filter((c) => state.get(c.d.id).choice === 'take');
    for (const c of cards) {
      const s = state.get(c.d.id);
      c.root.dataset.choice = s.choice;
      for (const b of c.buttons) b.setAttribute('aria-pressed', String(b.dataset.choice === s.choice));
      c.note.textContent = !s.date ? 'take väljer ett datum' : s.date === c.d.date ? `förslag, ${dayName(s.date)}` : `eget datum, ${dayName(s.date)}`;
      c.note.classList.toggle('warn', Boolean(s.date && s.date < review.soonest));
      const shown = s.date || c.d.date;
      c.week.hidden = !shown;
      if (shown) {
        const tried = [...taking.filter((t) => t !== c && state.get(t.d.id).date).map((t) => [state.get(t.d.id).date, t.d.pack]), [shown, c.d.pack]];
        c.week.href = `/dev/week.html?${new URLSearchParams([['from', laterKey(shown, -3)], ['days', 10], ...tried.map(([day, pack]) => ['dag', `${day}.${pack}`])])}`;
      }
    }

    const count = (choice) => cards.filter((c) => state.get(c.d.id).choice === choice).length;
    const dates = taking.map((c) => state.get(c.d.id).date).filter(Boolean);
    const twice = [...new Set(dates.filter((day, n) => dates.indexOf(day) !== n))];
    const early = dates.filter((day) => day < review.soonest);
    fill(el('tally'),
      `Ta med ${count('take')} · Vänta ${count('wait')} · Avböj ${count('decline')}`,
      twice.length ? make('span', { className: 'warn', textContent: ` · två dagar på ${twice.map(dayName).join(', ')}` }) : null,
      early.length ? make('span', { className: 'warn', textContent: ` · före ${dayName(review.soonest)} går inte` }) : null,
    );

    const take = taking.map((c) => (state.get(c.d.id).date ? `${c.d.id}@${state.get(c.d.id).date}` : `${c.d.id}`));
    const decline = cards.filter((c) => state.get(c.d.id).choice === 'decline').map((c) => c.d.id);
    const lines = [
      take.length && [`node scripts/handmade.mjs take ${take.join(' ')}`, null],
      decline.length && [`node scripts/handmade.mjs decline ${decline.join(' ')}`, null],
    ].filter(Boolean);
    el('commands').replaceChildren(...(lines.length ? lines.map(([text, warning]) => {
      const copy = make('button', { type: 'button', textContent: 'Kopiera' });
      copy.addEventListener('click', () => navigator.clipboard.writeText(text).then(() => {
        copy.textContent = 'Kopierat';
        setTimeout(() => { copy.textContent = 'Kopiera'; }, 1500);
      }));
      return make('div', { className: 'command' }, make('code', { textContent: text }), warning ? make('span', { className: 'soft', textContent: warning }) : null, copy);
    }) : [make('p', { className: 'soft', textContent: 'Välj Ta med eller Avböj för en dag, så står kommandot här.' })]));
  }
  refresh();
}

if (review && quiz) start();
else {
  el('summary').textContent = 'Kör node scripts/handmade.mjs review först, och ladda om sidan.';
  document.querySelector('footer').hidden = true;
}
