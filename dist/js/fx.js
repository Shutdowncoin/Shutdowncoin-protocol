// Motion toolkit. Every effect has an instant fallback under prefers-reduced-motion.
export const reduced = matchMedia('(prefers-reduced-motion: reduce)');
export const isReduced = () => reduced.matches;

/* damped spring solver: x'' = -k(x-target) - c x', semi-implicit Euler at a fixed 1/240 step */
export function spring({ from = 0, to = 1, k = 170, c = 21, m = 1, delay = 0, onUpdate, onDone }) {
  if (isReduced()) {
    onUpdate(to);
    if (onDone) onDone();
    return () => {};
  }
  let x = from, v = 0, last = 0, alive = true, raf = 0;
  const step = 1 / 240;
  const start = performance.now() + delay;
  const tick = (t) => {
    if (!alive) return;
    if (t < start) { raf = requestAnimationFrame(tick); return; }
    if (!last) last = t;
    let dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    while (dt > 0) {
      const s = Math.min(step, dt);
      v += ((-k * (x - to) - c * v) / m) * s;
      x += v * s;
      dt -= s;
    }
    onUpdate(x);
    if (Math.abs(x - to) < 0.0006 && Math.abs(v) < 0.001) {
      alive = false;
      onUpdate(to);
      if (onDone) onDone();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { alive = false; cancelAnimationFrame(raf); };
}

export function springIn(el, delay = 0) {
  if (!el) return;
  if (isReduced()) { el.style.opacity = ''; el.style.transform = ''; el.removeAttribute('data-reveal'); return; }
  el.style.opacity = '0';
  el.style.transform = 'translate3d(0,28px,0)';
  spring({
    delay,
    onUpdate: (p) => {
      el.style.opacity = String(Math.max(0, Math.min(1, p)));
      el.style.transform = `translate3d(0,${(1 - p) * 28}px,0)`;
    },
    onDone: () => { el.style.opacity = ''; el.style.transform = ''; el.removeAttribute('data-reveal'); },
  });
}

export function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (isReduced() || !('IntersectionObserver' in window)) {
    els.forEach((e) => { e.style.opacity = '1'; e.style.transform = 'none'; });
    return;
  }
  let batch = 0, timer = 0;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        io.unobserve(en.target);
        springIn(en.target, batch++ * 90);
        clearTimeout(timer);
        timer = setTimeout(() => { batch = 0; }, 160);
      }
    }
  }, { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('[data-spot],.row');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', e.clientX - r.left + 'px');
    t.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });
}

export function initProgress() {
  const bar = document.getElementById('progress');
  const upd = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  addEventListener('scroll', upd, { passive: true });
  addEventListener('resize', upd);
  upd();
}

/* hero parallax: pointer + scroll feed CSS variables read by .layer */
export function initParallax(hero) {
  if (isReduced()) return;
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const loop = () => {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    hero.style.setProperty('--px', cx.toFixed(3));
    hero.style.setProperty('--py', cy.toFixed(3));
    raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(loop) : 0;
  };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
  addEventListener('scroll', () => hero.style.setProperty('--sy', Math.min(scrollY, 1400)), { passive: true });
}

/* count-up with flash on change. First paint counts from 0; later changes count from the previous value. */
const store = new WeakMap();
export function setNumber(el, value, fmt) {
  if (!el) return;
  const prev = store.get(el);
  if (value == null || !isFinite(value)) {
    if (prev && prev.stop) prev.stop();
    store.set(el, undefined);
    el.textContent = fmt(null);
    return;
  }
  if (prev && prev.value === value) return;
  const from = prev ? prev.value : 0;
  if (prev && prev.stop) prev.stop();
  const entry = { value, stop: null };
  store.set(el, entry);
  if (prev && !isReduced()) {
    const target = el.closest('.row') || el;
    target.classList.remove('flash-up', 'flash-down');
    void target.offsetWidth;
    target.classList.add(value > from ? 'flash-up' : 'flash-down');
  }
  entry.stop = spring({
    k: 120, c: 22,
    onUpdate: (p) => { el.textContent = fmt(from + (value - from) * Math.min(1, Math.max(0, p))); },
    onDone: () => { el.textContent = fmt(value); },
  });
}
