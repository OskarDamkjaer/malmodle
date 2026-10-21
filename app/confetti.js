const COLORS = ['#2e9e4f', '#f2c230', '#f08a24', '#db3a2f', '#c8102e', '#111111'];
const PIECES = 160;
const LIFE = 3200;

export function confetti() {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const ratio = devicePixelRatio || 1;
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  ctx.scale(ratio, ratio);

  const pieces = Array.from({ length: PIECES }, (_, i) => {
    const left = i % 2 === 0;
    const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
    const speed = h * (0.9 + Math.random() * 0.9);
    return {
      x: left ? 0 : w,
      y: h * 0.75,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 6,
      spin: Math.random() * Math.PI,
      turn: (Math.random() - 0.5) * 12,
      flip: Math.random() * 10,
      color: COLORS[i % COLORS.length],
    };
  });

  const start = performance.now();
  let last = start;
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const age = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.min(1, (LIFE - age) / 600);
    for (const p of pieces) {
      p.vx *= 1 - 1.6 * dt;
      p.vy = p.vy * (1 - 1.6 * dt) + h * 1.1 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += p.turn * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.scale(1, Math.cos(p.flip + age / 120));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (age < LIFE) requestAnimationFrame(step);
    else canvas.remove();
  };
  requestAnimationFrame(step);
}
