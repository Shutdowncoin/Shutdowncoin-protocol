// Hero orb: dotted sphere + orbit rings on canvas. Colours are read from tokens at runtime.
import { isReduced } from './fx.js';

export function initOrb(canvas, hero) {
  const ctx = canvas.getContext('2d');
  const cs = getComputedStyle(document.documentElement);
  const fg = cs.getPropertyValue('--color-fg').trim();
  const acc = cs.getPropertyValue('--color-accent').trim();
  const N = 620;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  let w = 0, h = 0, dpr = 1, yaw = 0, visible = true, raf = 0, last = 0, signals = 6;
  const TAU = Math.PI * 2;

  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2, tilt = -0.42;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    ctx.fillStyle = fg;
    for (const p of pts) {
      const x = p[0] * Math.cos(yaw) - p[2] * Math.sin(yaw);
      const z0 = p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw);
      const y = p[1] * ct - z0 * st;
      const z = p[1] * st + z0 * ct;
      ctx.globalAlpha = 0.05 + 0.3 * ((z + 1) / 2);
      ctx.beginPath();
      ctx.arc(cx + x * R, cy + y * R, 0.9 + (z + 1) * 0.55, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1;
    [1.0, 1.22, 1.4].forEach((k, i) => {
      ctx.globalAlpha = 0.14 - i * 0.035;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * k, R * k * 0.34, tilt * 0.6 + i * 0.5, 0, TAU);
      ctx.stroke();
    });
    ctx.fillStyle = acc;
    for (let i = 0; i < signals; i++) {
      const a = yaw * (1.4 + i * 0.13) + i * 1.9;
      const k = 1.22 + (i % 3) * 0.09;
      const ex = Math.cos(a) * R * k, ey = Math.sin(a) * R * k * 0.34;
      const rot = tilt * 0.6 + (i % 3) * 0.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot), 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const loop = (t) => {
    raf = 0;
    if (!visible || document.hidden) return;
    if (last && t - last < 32) { raf = requestAnimationFrame(loop); return; } // reference caps the globe loop at 32ms/frame
    const dt = last ? Math.min(100, t - last) : 32;
    last = t;
    yaw += dt * 0.00075 * (Math.PI / 180) * 16; // reference rate 0.00075 deg/ms, x16 so rotation is visible on a smaller orb
    draw();
    raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && !isReduced()) { last = 0; raf = requestAnimationFrame(loop); } };

  resize();
  draw();
  addEventListener('resize', () => { resize(); draw(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(hero);
  document.addEventListener('visibilitychange', kick);
  kick();
  return { setSignals(n) { signals = Math.max(3, Math.min(12, n || 6)); if (isReduced()) draw(); } };
}
