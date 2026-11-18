// Board + ticker rendering. Keyed diff so values count up / flash instead of re-rendering.
import { fmtPrice, fmtCompact, fmtPct, fmtInt, DASH } from './format.js';
import { setNumber, springIn, isReduced } from './fx.js';

const BRAND_LOGO = './assets/logo.png';
const PLACEHOLDER = '· · · · ·';
const els = {};
const st = { rows: [], status: 'loading', own: { mode: 'absent', data: null }, sort: 'boost', query: '', ca: null, firstPaint: true };
const nodes = new Map();
let ownEl = null, ownSig = '';
let tickerSig = '';

export function initBoard(refs) { Object.assign(els, refs); renderAll(); }
export const boardAddresses = () => new Set(st.rows.map((r) => r.key));

export function setState(patch) { Object.assign(st, patch); renderAll(); }

function setLogo(lg, urls, letter) {
  const sig = urls.join('|') + '#' + letter;
  if (lg.dataset.sig === sig) return;
  lg.dataset.sig = sig;
  lg.textContent = '';
  lg.classList.remove('brand');
  const list = [...urls];
  const tile = () => { lg.textContent = (letter || '?').slice(0, 1).toUpperCase(); lg.classList.remove('brand'); };
  const next = () => {
    const u = list.shift();
    if (!u) { tile(); return; }
    const img = new Image();
    img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.onerror = () => { img.remove(); next(); };
    img.onload = () => {};
    lg.classList.toggle('brand', u === BRAND_LOGO);
    lg.textContent = '';
    lg.appendChild(img);
    img.src = u;
  };
  next();
}

function rowShell(tag) {
  const el = document.createElement(tag);
  el.className = 'row';
  el.innerHTML = '<div class="lg"></div><div class="idn"><span class="sym"></span><span class="nm"></span></div><div class="meta"><span>VOL <b data-k="vol" style="font-weight:400"></b></span><span>LIQ <b data-k="liq" style="font-weight:400"></b></span></div><div class="price" data-k="price"></div><div class="chg" data-k="chg"></div>';
  return el;
}
const q = (el, k) => el.querySelector(`[data-k="${k}"]`);

function fillRow(el, r) {
  el.querySelector('.sym').textContent = r.symbol;
  el.querySelector('.nm').textContent = r.name || '';
  setLogo(el.querySelector('.lg'), r.logos || [], r.symbol);
  setNumber(q(el, 'price'), r.price, fmtPrice);
  setNumber(q(el, 'vol'), r.vol, fmtCompact);
  setNumber(q(el, 'liq'), r.liq, fmtCompact);
  const chg = q(el, 'chg');
  setNumber(chg, r.chg, fmtPct);
  chg.className = 'chg' + (r.chg > 0 ? ' up' : r.chg < 0 ? ' down' : '');
  if (el.tagName === 'A' && r.url) el.href = r.url;
}

function skeletonRow() {
  const el = document.createElement('div');
  el.className = 'row skel';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="lg"></div><div class="idn"><i></i></div><div class="meta"><i></i></div><div class="price"><i></i></div><div class="chg"><i></i></div>';
  return el;
}

function ordered() {
  let rows = st.rows.filter((r) => !st.ca || r.key !== st.ca); // dedup: own token never repeats in trending
  const qy = st.query.trim().toLowerCase();
  if (qy) rows = rows.filter((r) => r.symbol.toLowerCase().includes(qy) || (r.name || '').toLowerCase().includes(qy) || r.key.toLowerCase() === qy);
  const by = { up: (a, b) => (b.chg ?? -Infinity) - (a.chg ?? -Infinity), down: (a, b) => (a.chg ?? Infinity) - (b.chg ?? Infinity), vol: (a, b) => (b.vol ?? -1) - (a.vol ?? -1) }[st.sort];
  return by ? [...rows].sort(by) : rows;
}

function buildOwn() {
  const { mode, data } = st.own;
  const live = mode === 'ok' && data && data.url;
  const sig = mode + (live ? '|a' : '|d');
  if (ownEl && sig === ownSig) return ownEl;
  ownSig = sig;
  const el = rowShell(live ? 'a' : 'div');
  el.classList.add('own');
  if (live) { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
  if (mode === 'absent') { el.classList.add('pending'); el.setAttribute('aria-disabled', 'true'); }
  if (ownEl && ownEl.parentNode) ownEl.replaceWith(el);
  ownEl = el;
  return el;
}

function paintOwn() {
  const el = buildOwn();
  const { mode, data } = st.own;
  if (mode === 'absent') {
    el.querySelector('.sym').textContent = 'SHUTDOWN';
    el.querySelector('.nm').textContent = 'Own token';
    setLogo(el.querySelector('.lg'), [BRAND_LOGO], 'S');
    for (const k of ['price', 'chg']) q(el, k).textContent = PLACEHOLDER;
    for (const k of ['vol', 'liq']) q(el, k).textContent = PLACEHOLDER;
    return el;
  }
  const d = data || { symbol: null, name: null, price: null, chg: null, vol: null, liq: null, logos: [], url: null };
  fillRow(el, {
    key: st.ca, symbol: d.symbol || 'SHUTDOWN', name: d.name || 'Shutdown', price: d.price, chg: d.chg, vol: d.vol, liq: d.liq,
    logos: [...(d.logos || []), BRAND_LOGO], url: d.url,
  });
  return el;
}

function renderRows() {
  const host = els.rows;
  const own = paintOwn();
  const want = [own];
  const list = ordered();
  const noData = !st.rows.length;
  let skel = [];
  if (noData && st.status === 'loading') skel = Array.from({ length: 10 }, skeletonRow);
  const stale = [...host.children].filter((c) => c.classList.contains('skel') || c.classList.contains('empty'));

  if (noData && st.status === 'loading') {
    stale.forEach((c) => c.remove());
    want.push(...skel);
  } else {
    stale.forEach((c) => c.remove());
  }

  const fresh = [];
  for (const r of list) {
    let el = nodes.get(r.key);
    if (!el) { el = rowShell('a'); el.target = '_blank'; el.rel = 'noopener noreferrer'; nodes.set(r.key, el); fresh.push(el); }
    fillRow(el, r);
    want.push(el);
  }
  const keep = new Set(list.map((r) => r.key));
  for (const [k, el] of nodes) if (!keep.has(k) && !qFiltered(k)) { el.remove(); nodes.delete(k); }

  if (!noData && !list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'No row here fits that filter.'; want.push(e); }
  if (noData && st.status === 'error') { const e = document.createElement('div'); e.className = 'empty'; e.textContent = `${DASH}  Market source unreachable. Retrying with backoff.`; want.push(e); }

  // reconcile order
  let cursor = host.firstChild;
  for (const el of want) {
    if (el === cursor) { cursor = cursor.nextSibling; continue; }
    host.insertBefore(el, cursor);
  }
  [...host.children].forEach((c) => { if (!want.includes(c)) c.remove(); });

  fresh.forEach((el, i) => { if (st.firstPaint) springIn(el, i * 45); else if (!isReduced()) el.classList.add('fade-in'); });
  if (fresh.length) st.firstPaint = false;
}
const qFiltered = (k) => st.rows.some((r) => r.key === k) && st.query.trim() !== '';

function renderTicker() {
  const track = els.ticker;
  const list = ordered().length ? ordered() : st.rows.filter((r) => !st.ca || r.key !== st.ca);
  const items = [...list];
  if (!items.length) {
    if (tickerSig === 'skel') return;
    tickerSig = 'skel';
    track.innerHTML = Array.from({ length: 16 }, () => '<span class="tk skel-tk" aria-hidden="true"><i></i></span>').join('');
    return;
  }
  const sig = items.map((r) => r.key).join(',');
  const html = (r) => `<span class="tk"><b>${esc(r.symbol)}</b><span>${fmtPrice(r.price)}</span><span class="${r.chg > 0 ? 'up' : r.chg < 0 ? 'down' : ''}">${fmtPct(r.chg)}</span></span>`;
  if (sig !== tickerSig) {
    tickerSig = sig;
    const once = items.map(html).join('');
    track.innerHTML = once + once.replaceAll('<span class="tk">', '<span class="tk" aria-hidden="true">');
  } else {
    const chips = track.querySelectorAll('.tk');
    chips.forEach((c, i) => {
      const r = items[i % items.length];
      const spans = c.querySelectorAll(':scope > span');
      spans[0].textContent = fmtPrice(r.price);
      spans[1].textContent = fmtPct(r.chg);
      spans[1].className = r.chg > 0 ? 'up' : r.chg < 0 ? 'down' : '';
    });
  }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderMeta() {
  const rows = st.rows.filter((r) => !st.ca || r.key !== st.ca);
  els.count.textContent = rows.length ? `${rows.length} live` : '';
  setNumber(els.statCount, rows.length || null, fmtInt);
  setNumber(els.statVol, rows.length ? rows.reduce((s, r) => s + (r.vol || 0), 0) : null, fmtCompact);
  const note = els.note;
  note.classList.toggle('err', st.status === 'error');
  note.textContent = st.status === 'loading' ? 'Pulling the tape…'
    : st.status === 'ok' ? 'Tape is live. Rows refresh by themselves.'
      : rows.length ? 'Source stumbled. Showing the last good rows while it retries.' : `${DASH}  Source unreachable. Retrying with backoff.`;
  const pill = els.pill;
  const state = st.status === 'ok' ? 'live' : st.status === 'loading' ? 'link' : rows.length ? 'stale' : 'offline';
  pill.dataset.state = state;
  els.pillText.textContent = st.status === 'loading' ? 'LINKING' : state === 'live' ? 'LIVE' : state === 'stale' ? 'RETRYING' : 'OFFLINE';
}

function renderAll() { renderRows(); renderTicker(); renderMeta(); }
