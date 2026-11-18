export const DASH = '—';
const ok = (n) => typeof n === 'number' && isFinite(n);

export function fmtPrice(n) {
  if (!ok(n)) return DASH;
  if (n === 0) return '$0';
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(4);
  const dec = Math.min(12, 3 - Math.floor(Math.log10(n)));
  return '$' + n.toFixed(dec);
}

export function fmtCompact(n) {
  if (!ok(n)) return DASH;
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

export function fmtPct(n) {
  if (!ok(n)) return DASH;
  const arrow = n > 0 ? '▲ +' : n < 0 ? '▼ −' : '';
  return arrow + Math.abs(n).toFixed(2) + '%';
}

export const fmtInt = (n) => (ok(n) ? String(Math.round(n)) : DASH);
export const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return ok(n) ? n : null;
};
