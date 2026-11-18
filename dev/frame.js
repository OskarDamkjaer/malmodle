import { SAVE_KEY } from '/daily.mjs';

const SIZES = [['phone', 'Telefon', 390, 844], ['small', 'Liten telefon', 375, 667], ['tablet', 'Platta', 1100, 800], ['desktop', 'Dator', 1440, 900]];

let size = SIZES.find(([id]) => id === new URLSearchParams(location.search).get('size'))?.[0] ?? SIZES[0][0];

const el = (id) => document.getElementById(id);
const frame = el('frame');

function fit() {
  const [, , w, h] = SIZES.find(([id]) => id === size);
  const stage = el('stage');
  const scale = Math.min(1, (stage.clientWidth - 32) / w, (stage.clientHeight - 32) / h);
  frame.style.width = `${w}px`;
  frame.style.height = `${h}px`;
  frame.style.transform = `translateX(-50%) scale(${scale})`;
}

function render() {
  el('sizes').replaceChildren(...SIZES.map(([id, label, w, h]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${label} ${w}×${h}`;
    b.setAttribute('aria-pressed', String(id === size));
    b.addEventListener('click', () => { size = id; render(); });
    return b;
  }));
  history.replaceState(null, '', `?size=${size}`);
  fit();
}

el('restart').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  frame.contentWindow.location.reload();
});
addEventListener('resize', fit);
render();
