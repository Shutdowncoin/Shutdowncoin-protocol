// Gate: match address-shaped strings against the stated registry. Never a blanket reject of 0x hex.
export const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_SCAN = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const EVM_SCAN = /0x[0-9a-fA-F]{40}/g;

/** All stated registry values that are address-shaped. */
export function statedAddresses(register) {
  const out = [];
  for (const [key, r] of Object.entries(register)) {
    if (r && r.state === 'stated' && typeof r.value === 'string' && (SOL_RE.test(r.value) || EVM_RE.test(r.value))) out.push({ key, value: r.value });
  }
  return out;
}

const same = (a, b) => (EVM_RE.test(a) ? a.toLowerCase() === b.toLowerCase() : a === b);

/** -> { kind: 'text' | 'registered' | 'board' | 'none-stated' | 'foreign-sol' | 'foreign-evm' } */
export function classify(input, register, boardAddresses = new Set()) {
  const s = (input || '').trim();
  const sol = SOL_RE.test(s);
  const evm = EVM_RE.test(s);
  if (!sol && !evm) return { kind: 'text' };
  for (const a of statedAddresses(register)) if (same(a.value, s)) return { kind: 'registered', key: a.key };
  if (boardAddresses.has(s)) return { kind: 'board' };
  if (register.ca.state !== 'stated') return { kind: 'none-stated' };
  return { kind: evm ? 'foreign-evm' : 'foreign-sol' };
}

export function messageFor(c) {
  switch (c.kind) {
    case 'registered': return { ok: true, text: 'Match. Registered Shutdown mint.' };
    case 'board': return { ok: false, text: 'Address-shaped and sitting among the board rows, yet absent from the Shutdown registry.' };
    case 'none-stated': return { ok: false, text: 'No mint address is stated yet, so nothing can match. Treat every address you meet as unverified.' };
    case 'foreign-evm': return { ok: false, text: 'A 0x-style string. The registry holds no match, and Shutdown lives on Solana. Unverified.' };
    case 'foreign-sol': return { ok: false, text: 'Address-shaped, yet missing from the Shutdown registry. Unverified.' };
    default: return null;
  }
}

/** Scan copy regions (data-scan) for address-shaped strings outside the registry. The CA slot is exempt. */
export function scanDom(root, register) {
  const reg = statedAddresses(register);
  let flagged = 0;
  root.querySelectorAll('[data-scan]').forEach((el) => {
    if (el.closest('[data-ca-exempt]')) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const hits = [...(n.nodeValue.match(SOL_SCAN) || []), ...(n.nodeValue.match(EVM_SCAN) || [])];
      for (const h of hits) {
        if (!reg.some((a) => same(a.value, h))) {
          n.parentElement.classList.add('addr-unverified');
          n.parentElement.title = 'Unregistered address';
          flagged++;
        }
      }
    }
  });
  return flagged;
}
