import { register, rec, isStated, handleFromUrl, ca } from './register.js';
import { classify, messageFor, scanDom } from './gate.js';
import { loadMarket, loadOwn, startPolling, sourceStatus, pingRpc } from './market.js';
import { initBoard, setState, boardAddresses } from './board.js';
import { initReveal, initSpotlight, initProgress, initParallax } from './fx.js';
import { initOrb } from './globe.js';

const $ = (s) => document.querySelector(s);

/* ---------- socials: link rule — href only for stated records, handle derived from the stored URL ---------- */
const SOCIAL_NAME = { x: 'X', github: 'GitHub' };
for (const name of Object.keys(SOCIAL_NAME)) {
  const a = document.querySelector(`[data-social="${name}"]`);
  const r = rec(name);
  if (isStated(r) && r.url) {
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const h = handleFromUrl(r.url);
    a.setAttribute('aria-label', `${SOCIAL_NAME[name]}${h ? ' ' + h : ''}`);
  } else {
    a.removeAttribute('href');
    a.setAttribute('aria-disabled', 'true');
    a.setAttribute('aria-label', `${SOCIAL_NAME[name]} (not available yet)`);
  }
}

/* ---------- toast + clipboard ---------- */
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/* ---------- CA slot: both branches live from day one ---------- */
const CA = ca();
const caBox = $('#ca'), caBtn = $('#ca-copy'), caVal = $('#ca-value'), caHint = $('#ca-hint');
if (CA) {
  caBox.dataset.state = 'stated';
  caVal.textContent = CA;
  caBtn.setAttribute('aria-label', 'Copy mint address');
  let t = 0;
  caBtn.addEventListener('click', async () => {
    const ok = await copyText(CA);
    caBtn.classList.add('copied');
    caHint.textContent = ok ? 'COPIED' : 'COPY FAILED';
    toast(ok ? 'Mint address copied' : 'Copy failed. Select the address by hand.');
    clearTimeout(t);
    t = setTimeout(() => { caBtn.classList.remove('copied'); caHint.textContent = 'COPY'; }, 1600);
  });
} else {
  caBox.dataset.state = 'absent';
  caBtn.disabled = true;
  caBtn.setAttribute('aria-label', 'Mint address not announced yet');
}

/* ---------- board ---------- */
initBoard({
  rows: $('#rows'), ticker: $('#ticker-track'), count: $('#board-count'), note: $('#board-status'),
  pill: $('#pill'), pillText: $('#pill-text'), statCount: $('#stat-count'), statVol: $('#stat-vol'),
});
setState({ ca: CA, own: { mode: CA ? 'loading' : 'absent', data: null } });

let hadMarket = false;
async function runMarket() {
  try {
    const rows = await loadMarket();
    hadMarket = true;
    setState({ rows, status: 'ok' });
    orb && orb.setSignals(rows.length);
    return true;
  } catch {
    setState({ status: hadMarket ? 'error' : 'error' });
    return false;
  }
}
let hadOwn = false;
async function runOwn() {
  if (!CA) return true;
  try {
    const data = await loadOwn(CA);
    hadOwn = true;
    setState({ own: { mode: 'ok', data } });
    return true;
  } catch {
    if (!hadOwn) setState({ own: { mode: 'error', data: null } });
    return false;
  }
}
// independent: neither source waits on the other
const poll = startPolling(async () => {
  const [m, o] = await Promise.all([runMarket(), runOwn()]);
  return m && o;
}, rec('market').pollMs);

$('#refresh').addEventListener('click', () => { setState({ status: 'loading' }); poll.now(); });

/* sort + search/gate */
document.querySelectorAll('.filters [data-sort]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.filters [data-sort]').forEach((x) => { x.classList.toggle('sel', x === b); x.setAttribute('aria-pressed', String(x === b)); });
  setState({ sort: b.dataset.sort });
}));
const gateMsg = $('#gate-msg');
$('#search').addEventListener('input', (e) => {
  const v = e.target.value;
  const c = classify(v, register, boardAddresses());
  const m = messageFor(c);
  gateMsg.hidden = !m;
  if (m) { gateMsg.textContent = m.text; gateMsg.classList.toggle('ok', m.ok); }
  setState({ query: c.kind === 'text' || c.kind === 'board' ? v.trim() : '' });
});

/* ---------- sources dialog ---------- */
const dlg = $('#sources');
async function openSources() {
  const list = $('#sources-list');
  const row = (name, url, state) => `<div class="src"><div><b>${name}</b><small>${url}</small></div><em class="${state === 'ok' ? 'ok' : ''}">${state === 'ok' ? 'OK' : state === 'failed' ? 'FAILED' : state === 'pending' ? 'LOADING' : 'IDLE'}</em></div>`;
  const m = rec('market'), o = rec('ownSources');
  const draw = (rpc) => {
    list.innerHTML = row('Boost ranking', m.boosts, sourceStatus.boosts) + row('Token pairs', m.tokens, sourceStatus.tokens)
      + (CA ? row('Own token pairs', o.dex, sourceStatus.dex) + row('Own token coin data', o.pump, sourceStatus.pump) : '')
      + row('Solana RPC', register.chain.rpc, rpc);
  };
  draw('pending');
  if (!dlg.open) dlg.showModal();
  draw((await pingRpc()) ? 'ok' : 'failed');
}
['#open-sources', '#open-sources-2', '#open-sources-3'].forEach((s) => $(s).addEventListener('click', openSources));
$('#close-sources').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

/* ---------- visuals ---------- */
const hero = $('#overview');
const orb = initOrb($('#orb'), hero);
initParallax(hero);
initReveal();
initSpotlight();
initProgress();
scanDom(document, register);
