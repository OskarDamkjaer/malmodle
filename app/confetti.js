const PIECES = 160;
const LIFE = 3200;
const FADE = 600;

export function confetti(colors) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !colors.length) return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    canvas.remove();
  };
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!ctx || !w || !h) { stop(); return stop; }

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
      color: colors[i % colors.length],
    };
  });

  let start = null;
  let last = null;
  const step = (now) => {
    try {
      start ??= now;
      last ??= now;
      const age = now - start;
      if (age >= LIFE) { stop(); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ratio = devicePixelRatio || 1;
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.globalAlpha = Math.max(0, Math.min(1, (LIFE - age) / FADE));
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
      frame = requestAnimationFrame(step);
    } catch (err) {
      stop();
      throw err;
    }
  };
  frame = requestAnimationFrame(step);
  return stop;
}
