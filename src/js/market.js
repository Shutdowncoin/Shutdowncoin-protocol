// Network layer. Market follows the market-source register record only; CA state never touches it.
import { register, rec, isStated } from './register.js';
import { num } from './format.js';

export const sourceStatus = { boosts: 'idle', tokens: 'idle', dex: 'idle', pump: 'idle' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch JSON with exponential backoff (base * 2^n, jittered). Throws after the last attempt. */
export async function fetchJson(url, { retries = 3, base = 700, timeout = 9000 } = {}) {
  let err;
  for (let i = 0; i <= retries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } catch (e) {
      err = e;
      if (i < retries) await sleep(base * 2 ** i * (0.8 + Math.random() * 0.4));
    } finally {
      clearTimeout(timer);
    }
  }
  throw err;
}

const iconUrl = (b) => {
  if (!b || !b.icon) return null;
  return /^https?:/.test(b.icon) ? b.icon : `https://cdn.dexscreener.com/cms/images/${b.icon}?width=64&height=64&fit=crop&quality=95&format=auto`;
};

const pickPair = (pairs, address) => {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  const mine = pairs.filter((p) => p.baseToken && p.baseToken.address === address);
  const pool = mine.length ? mine : pairs;
  return [...pool].sort((a, b) => (num(b.liquidity && b.liquidity.usd) || 0) - (num(a.liquidity && a.liquidity.usd) || 0))[0];
};

const toRow = (address, boost, pair) => ({
  key: address,
  symbol: (pair && pair.baseToken && pair.baseToken.symbol) || address.slice(0, 4).toUpperCase(),
  name: (pair && pair.baseToken && pair.baseToken.name) || '',
  price: pair ? num(pair.priceUsd) : null,
  chg: pair ? num(pair.priceChange && pair.priceChange.h24) : null,
  vol: pair ? num(pair.volume && pair.volume.h24) : null,
  liq: pair ? num(pair.liquidity && pair.liquidity.usd) : null,
  logos: [pair && pair.info && pair.info.imageUrl, iconUrl(boost)].filter(Boolean),
  url: (pair && pair.url) || (boost && boost.url) || null,
});

/** Trending: boosts/top -> solana only -> top N by totalAmount -> per-token pair lookup. */
export async function loadMarket() {
  const m = rec('market');
  if (!isStated(m)) throw new Error('market source not stated');
  sourceStatus.boosts = 'pending';
  let boosts;
  try { boosts = await fetchJson(m.boosts); sourceStatus.boosts = 'ok'; } catch (e) { sourceStatus.boosts = 'failed'; throw e; }
  const best = new Map();
  for (const b of Array.isArray(boosts) ? boosts : []) {
    if (b.chainId !== m.chainId || !b.tokenAddress) continue;
    const cur = best.get(b.tokenAddress);
    if (!cur || (num(b.totalAmount) || 0) > (num(cur.totalAmount) || 0)) best.set(b.tokenAddress, b);
  }
  const top = [...best.values()].sort((a, b) => (num(b.totalAmount) || 0) - (num(a.totalAmount) || 0)).slice(0, m.limit);
  if (!top.length) throw new Error('no solana tokens in boosts');
  sourceStatus.tokens = 'pending';
  const settled = await Promise.allSettled(top.map((b) => fetchJson(m.tokens.replace('{address}', encodeURIComponent(b.tokenAddress)), { retries: 2 })));
  const rows = top.map((b, i) => toRow(b.tokenAddress, b, settled[i].status === 'fulfilled' ? pickPair(settled[i].value, b.tokenAddress) : null));
  const good = rows.filter((r) => r.price != null).length;
  sourceStatus.tokens = good ? 'ok' : 'failed';
  if (!good) throw new Error('token lookups failed');
  return rows;
}

/** Own token: DexScreener and pump.fun in parallel, neither blocks the other. */
export async function loadOwn(address) {
  const o = rec('ownSources');
  sourceStatus.dex = 'pending'; sourceStatus.pump = 'pending';
  const dexP = fetchJson(o.dex.replace('{ca}', encodeURIComponent(address)), { retries: 2 }).then((v) => { sourceStatus.dex = 'ok'; return v; }, (e) => { sourceStatus.dex = 'failed'; throw e; });
  const pumpP = fetchJson(o.pump.replace('{ca}', encodeURIComponent(address)), { retries: 1, base: 500 }).then((v) => { sourceStatus.pump = 'ok'; return v; }, (e) => { sourceStatus.pump = 'failed'; throw e; });
  const [d, p] = await Promise.allSettled([dexP, pumpP]);
  const pairs = d.status === 'fulfilled' && Array.isArray(d.value && d.value.pairs) ? d.value.pairs : [];
  const pair = [...pairs].sort((a, b) => (num(b.volume && b.volume.h24) || 0) - (num(a.volume && a.volume.h24) || 0))[0] || null;
  const pump = p.status === 'fulfilled' ? p.value : null;
  if (!pair && !pump) throw new Error('own token sources failed');
  return {
    symbol: (pair && pair.baseToken && pair.baseToken.symbol) || (pump && pump.symbol) || null,
    name: (pair && pair.baseToken && pair.baseToken.name) || (pump && pump.name) || null,
    price: pair ? num(pair.priceUsd) : null,
    chg: pair ? num(pair.priceChange && pair.priceChange.h24) : null,
    vol: pair ? num(pair.volume && pair.volume.h24) : null,
    liq: pair ? num(pair.liquidity && pair.liquidity.usd) : null,
    logos: [pump && pump.image_uri, pair && pair.info && pair.info.imageUrl].filter(Boolean),
    url: (pair && pair.url) || null,
  };
}

export async function pingRpc() {
  try {
    const r = await fetch(register.chain.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }) });
    const j = await r.json();
    return j.result === 'ok';
  } catch { return false; }
}

/** Poll loop: fixed cadence on success, backoff on repeated failure, paused while hidden, immediate on visible. */
export function startPolling(run, baseMs) {
  let timer = 0, fails = 0, busy = false;
  const schedule = () => { clearTimeout(timer); if (document.hidden) return; timer = setTimeout(tick, fails ? Math.min(baseMs * 2 ** fails, baseMs * 8) : baseMs); };
  async function tick() {
    if (busy) return;
    busy = true;
    clearTimeout(timer);
    try { fails = (await run()) ? 0 : fails + 1; } catch { fails++; }
    busy = false;
    schedule();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else tick(); });
  tick();
  return { now: tick };
}
