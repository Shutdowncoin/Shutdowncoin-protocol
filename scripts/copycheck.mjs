// Usage: node scripts/copycheck.mjs <reference-corpus-dir> [files...]
// Reports 2-grams (lowercased word tokens) shared between reference text and this project's visible copy.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const words = (s) => s.toLowerCase().replace(/&[a-z#0-9]+;/g, ' ').match(/[a-z0-9$']+|\./g) || [];
const grams = (s) => {
  const w = words(s);
  const o = new Set();
  for (let i = 0; i < w.length - 1; i++) o.add(w[i] + ' ' + w[i + 1]);
  return o;
};
const brk = (s) => s.replace(/[.,:;!?()\-–—↗↓·/|]/g, ' . ');
const htmlText = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' . ');
const attrText = (h) => [...h.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]+)"/g)].map((m) => m[1]).join(' . ');
const strings = (js) => [...js.matchAll(/(['"`])((?:\\.|(?!\1).)*?)\1/g)]
  .map((m) => m[2])
  .filter((t) => /[A-Za-z]+ [A-Za-z]+/.test(t) && !/[{}<>=;]/.test(t.replace(/\$\{[^}]*\}/g, '')))
  .join(' . ');
const jsonStrings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => jsonStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => jsonStrings(x, out));
  return out;
};

const ref = new Set();
for (const f of readdirSync(dir)) {
  const t = readFileSync(join(dir, f), 'utf8');
  let txt = '';
  if (f.endsWith('.html')) txt = htmlText(t) + ' . ' + attrText(t);
  else if (f.endsWith('.js')) txt = strings(t);
  else if (f.endsWith('.json')) txt = jsonStrings(JSON.parse(t)).join(' . ');
  for (const g of grams(brk(txt))) if (!g.includes('.')) ref.add(g);
}
const mine = process.argv.slice(3).map((f) => {
  const t = readFileSync(f, 'utf8');
  if (f.endsWith('.js')) return strings(t);
  if (f.endsWith('.html')) return htmlText(t) + ' . ' + attrText(t);
  return t;
}).join(' . ');
const hits = [...grams(brk(mine))].filter((g) => ref.has(g));
console.log('reference 2-grams:', ref.size, '| shared:', hits.length);
hits.forEach((h) => console.log('  ', h));
process.exit(hits.length ? 1 : 0);
