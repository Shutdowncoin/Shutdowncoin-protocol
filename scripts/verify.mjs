// Gate runner: node scripts/verify.mjs  (exit 0 only if every gate passes)
// Mutation anchors are state-independent: the register is read at runtime and the CA record is *set* (never string-replaced).
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => join(root, ...a);
const read = (p) => readFileSync(P(p), 'utf8');
let total = 0, failed = 0;
const gate = (name, cond, detail = '') => {
  total++;
  if (cond) console.log(`  PASS  ${name}`);
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
};
const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    if (['node_modules', '.git', '.verify-tmp'].includes(f)) continue;
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const build = (env = {}) => spawnSync(process.execPath, [P('scripts/build.mjs')], { env: { ...process.env, ...env }, encoding: 'utf8' });

const SAMPLE_MINT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'; // syntactically valid base58, test value
const SAMPLE_EVM = '0x52908400098527886E0F7030069857D2E4169EE7';
const reg = JSON.parse(read('src/register.json'));

console.log('\n[build]');
const b0 = build();
gate('npm run build exit 0 (committed register)', b0.status === 0, b0.stderr);

console.log('\n[assets / logo in dist]');
const idx = read('dist/index.html');
gate('dist/assets/logo.png exists', existsSync(P('dist/assets/logo.png')));
const png = readFileSync(P('dist/assets/logo.png'));
gate('logo is a PNG, IHDR colortype 6 (RGBA)', png.subarray(1, 4).toString() === 'PNG' && png[25] === 6);
gate('index.html references ./assets/logo.png (relative)', idx.includes('src="./assets/logo.png"'));
gate('no absolute-path asset refs in index.html', !/(?:src|href)="\/(?!\/)/.test(idx));
const refs = [...idx.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map((m) => m[1]);
gate('every ./ reference in index.html resolves inside dist', refs.every((r) => existsSync(P('dist', r))), refs.filter((r) => !existsSync(P('dist', r))).join(','));
const fav = read('dist/assets/favicon.svg');
gate('favicon is SVG 32x32', /viewBox="0 0 32 32"/.test(fav) && /width="32"/.test(fav) && /height="32"/.test(fav));
gate('favicon linked from index.html', idx.includes('rel="icon" href="./assets/favicon.svg"'));
gate('premultiplied resize: opaque edge colour not darkened toward black', (() => {
  const r = spawnSync('python', ['-I', '-c', "from PIL import Image;import numpy as np;a=np.array(Image.open(r'" + P('dist/assets/logo.png') + "'));e=(a[...,3]>0)&(a[...,3]<255);print(round(float(a[e][:,:3].mean())) if e.any() else 0)"], { encoding: 'utf8' });
  return Number(r.stdout.trim()) > 200;
})());
gate('dist/ is the deploy output with CNAME', existsSync(P('dist/CNAME')) && read('dist/CNAME').trim() === reg.domain.value);

console.log('\n[register + link rule]');
const states = ['stated', 'absent', 'unconfirmed'];
gate('every register record has a valid state', Object.values(reg).every((r) => states.includes(r.state)));
gate('absent records carry no value/url', Object.values(reg).every((r) => r.state === 'stated' || (!r.value && !r.url)));
gate('x record stores URL; handle derivable', reg.x.state !== 'stated' || (/^https:\/\/x\.com\/[A-Za-z0-9_]+$/.test(reg.x.url)));
gate('index.html has no hard-coded social href', !/href="https?:\/\/(x|twitter|github)\.com/.test(read('src/index.html')));
gate('both social icons present, icon only (no text children)', (() => {
  const a = [...read('src/index.html').matchAll(/<a class="icon-btn"[^>]*data-social="(x|github)"[^>]*>([\s\S]*?)<\/a>/g)];
  return a.length === 2 && a.every((m) => !m[2].replace(/<svg[\s\S]*?<\/svg>/g, '').trim());
})());
gate('official X mark path + Octicon mark-github path', read('src/index.html').includes('M18.244 2.25h3.308l-7.227 8.26') && read('src/index.html').includes('M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59'));
gate('main.js sets href only inside stated branch (link rule)', /if \(isStated\(r\) && r\.url\) \{[\s\S]*?a\.href = r\.url;[\s\S]*?\} else \{[\s\S]*?removeAttribute\('href'\)/.test(read('src/js/main.js')));
gate('socials sit in the top header at every breakpoint (no display:none on .socials)', !/\.socials\s*\{[^}]*display:\s*none/.test(read('src/css/main.css')) && !/\.icon-btn\s*\{[^}]*display:\s*none/.test(read('src/css/main.css')));

console.log('\n[palette rule]');
const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
const code = walk(P('src')).filter((f) => ['.css', '.js', '.html'].includes(extname(f)) && !f.endsWith('tokens.css'));
const offenders = code.filter((f) => (readFileSync(f, 'utf8').replace(/href="#[^"]*"/g, '').replace(/url\(#/g, '').match(hexRe) || []).some((h) => /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{8}$/.test(h)));
gate('no colour literals outside tokens.css', offenders.length === 0, offenders.join(','));
gate('tokens.css carries provenance comment', /Provenance/.test(read('src/css/tokens.css')) && /dominant/.test(read('src/css/tokens.css')));
gate('theme-color injected from tokens', idx.includes('name="theme-color" content="' + read('src/css/tokens.css').match(/--color-bg:\s*(#[0-9a-fA-F]{6})/)[1] + '"'));

console.log('\n[CA gate: both branches]');
const tmp = P('.verify-tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const variant = (name, mut) => {
  const r = JSON.parse(read('src/register.json'));
  mut(r);
  const f = join(tmp, name + '.json');
  writeFileSync(f, JSON.stringify(r));
  const out = join('.verify-tmp', name + '-dist');
  const res = build({ SHUTDOWN_REGISTER: f, SHUTDOWN_OUT: out });
  return { res, r, out, file: f };
};
const A = variant('absent', (r) => { r.ca = { state: 'absent', value: null }; });
const S = variant('stated', (r) => { r.ca = { state: 'stated', value: SAMPLE_MINT }; });
const E = variant('stated-evm', (r) => { r.ca = { state: 'stated', value: SAMPLE_MINT }; r.evmprobe = { state: 'stated', value: SAMPLE_EVM }; });
const BAD = variant('bad', (r) => { r.ca = { state: 'stated', value: 'not-an-address' }; });
gate('absent branch: build exit 0', A.res.status === 0, A.res.stderr);
gate('stated branch: build exit 0', S.res.status === 0, S.res.stderr);
gate('stated branch with invalid CA: build refuses (exit != 0)', BAD.res.status !== 0);
const embedded = (out) => JSON.parse(readFileSync(P(out, 'index.html'), 'utf8').match(/<script id="register" type="application\/json">([\s\S]*?)<\/script>/)[1]);
gate('absent dist embeds ca.state=absent', embedded(A.out).ca.state === 'absent');
gate('stated dist embeds ca.state=stated + full address', embedded(S.out).ca.state === 'stated' && embedded(S.out).ca.value === SAMPLE_MINT);
const gm = await import(pathToFileURL(P('src/js/gate.js')).href);
const boardSet = new Set(['BoardTokenAddr11111111111111111111111111111']);
gate('absent: valid-shaped address -> none-stated (inert)', gm.classify(SAMPLE_MINT, A.r, boardSet).kind === 'none-stated');
gate('stated: exact CA -> registered', gm.classify(SAMPLE_MINT, S.r).kind === 'registered');
gate('stated: other Solana address -> foreign-sol (warn, not crash)', gm.classify('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', S.r).kind === 'foreign-sol');
gate('0x hex is not blanket-rejected: stated 0x record -> registered', gm.classify(SAMPLE_EVM, E.r).kind === 'registered');
gate('0x hex not in registry -> foreign-evm (matched against registry)', gm.classify(SAMPLE_EVM, S.r).kind === 'foreign-evm');
gate('0x match is case-insensitive', gm.classify(SAMPLE_EVM.toLowerCase().replace('0x', '0x'), E.r).kind === 'registered');
gate('free text -> filter, never treated as address', gm.classify('bonk', S.r).kind === 'text');
gate('CA exempt from scanner (source + markup)', /closest\('\[data-ca-exempt\]'\)/.test(read('src/js/gate.js')) && /id="ca"[^>]*data-ca-exempt/.test(read('src/index.html')));
gate('CA slot is first element in top chrome, large font token', /<div class="top"[\s\S]*?<div class="ca"/.test(read('src/index.html')) && /\.ca-value\{font:500 clamp\(14px,1\.55vw \+ 7px,26px\)/.test(read('src/css/main.css')));
gate('absent: copy button disabled (inert)', /caBtn\.disabled = true/.test(read('src/js/main.js')));
gate('stated: click-to-copy with feedback (hint + toast)', /COPIED/.test(read('src/js/main.js')) && /toast\(/.test(read('src/js/main.js')));

console.log('\n[market + own token]');
const mk = read('src/js/market.js');
const loadMarketBody = mk.slice(mk.indexOf('export async function loadMarket'), mk.indexOf('/** Own token'));
gate('market loader never reads CA state', !/\bca\b|register\.ca|rec\('ca'\)/.test(loadMarketBody));
gate('market source comes from register record', /rec\('market'\)/.test(loadMarketBody) && reg.market.boosts === 'https://api.dexscreener.com/token-boosts/top/v1' && reg.market.tokens === 'https://api.dexscreener.com/tokens/v1/solana/{address}');
gate('chainId filter + totalAmount sort + top-N', /b\.chainId !== m\.chainId/.test(mk) && /totalAmount/.test(mk) && /slice\(0, m\.limit\)/.test(mk) && reg.market.limit === 10 && reg.market.chainId === 'solana');
gate('exponential backoff in fetchJson', /base \* 2 \*\* i/.test(mk));
gate('poll 60s, hidden pause, immediate on visible', reg.market.pollMs === 60000 && /document\.hidden/.test(mk) && /visibilitychange/.test(mk));
const ownBody = mk.slice(mk.indexOf('export async function loadOwn'), mk.indexOf('export async function pingRpc'));
gate('own: DexScreener + pump.fun fetched in parallel (allSettled)', /Promise\.allSettled\(\[dexP, pumpP\]\)/.test(ownBody) && /frontend-api\.pump\.fun\/coins\/\{ca\}/.test(read('src/register.json')) && /latest\/dex\/tokens\/\{ca\}/.test(read('src/register.json')));
gate('own: pair = volume.h24 desc, pairs[0]', /volume && b\.volume\.h24[\s\S]*?\[0\]/.test(ownBody));
gate('own: logo chain pump -> dex -> brand -> letter', /logos: \[pump && pump\.image_uri, pair && pair\.info && pair\.info\.imageUrl\]/.test(ownBody) && /\.\.\.\(d\.logos \|\| \[\]\), BRAND_LOGO/.test(read('src/js/board.js')));
gate('own row placeholder uses brand logo, non-clickable, dots', /setLogo\(el\.querySelector\('\.lg'\), \[BRAND_LOGO\], 'S'\)/.test(read('src/js/board.js')) && /· · · · ·/.test(read('src/js/board.js')) && /aria-disabled/.test(read('src/js/board.js')));
gate('dedup: own token removed from trending', /r\.key !== st\.ca/.test(read('src/js/board.js')));
const css = read('src/css/main.css');
gate('own row: border-left 2px accent + ownPulse', /\.row\.own\{[^}]*border-left:2px solid var\(--color-accent\)[^}]*animation:ownPulse/.test(css) && /@keyframes ownPulse/.test(css));
gate('reduced-motion kills animation globally + own row', /prefers-reduced-motion:reduce[\s\S]*animation:none!important/.test(css) && /\.row\.own\{animation:none\}/.test(css));
gate('skeleton -> data fade-in stagger present', /skeletonRow/.test(read('src/js/board.js')) && /springIn\(el, i \* 45\)/.test(read('src/js/board.js')));
gate('letter tile fallback on image error', /img\.onerror/.test(read('src/js/board.js')) && /tile\(\)/.test(read('src/js/board.js')));
gate('last good data kept on failed refresh', /hadMarket/.test(read('src/js/main.js')) && !/setState\(\{ rows: \[\]/.test(read('src/js/main.js')));

console.log('\n[animation + social audit]');
const kfs = [...css.matchAll(/@keyframes ([A-Za-z]+)/g)].map((m) => m[1]);
const applied = (k) => new RegExp('animation:[^;}]*\\b' + k + '\\b').test(css);
gate(`every @keyframes is applied by an animation declaration (${kfs.length})`, kfs.every(applied), kfs.filter((k) => !applied(k)).join(','));
gate('reduced-motion block disables every animation and transition', /prefers-reduced-motion:reduce\)\{[\s\S]*\*,\*::before,\*::after\{transition:none!important;animation:none!important\}/.test(css));
gate('blink keyframe matches reference (1s infinite)', /animation:blink 1s infinite/.test(css));
gate('exactly one X anchor in markup, no hard-coded x.com', (read('src/index.html').match(/data-social="x"/g) || []).length === 1 && !/x\.com/.test(read('src/index.html')));
gate('github anchor has no href in markup (inert)', !/<a[^>]*data-social="github"[^>]*href=/.test(read('src/index.html')) && !/<a[^>]*href=[^>]*data-social="github"/.test(read('src/index.html')));
gate('reference-matched values: row padding 25/24, column gap 58, hero 840, toast 2400', /padding:25px 0 24px/.test(css) && /column-gap:58px/.test(css) && /min-height:max\(840px,100svh\)/.test(css) && /2400/.test(read('src/js/main.js')));

console.log('\n[hygiene + content]');
const files = walk(root).filter((f) => !f.includes('.verify-tmp') && !/[\\/](dist|brand|reference)[\\/]/.test(f));
const joinedText = files.filter((f) => /\.(md|json|mjs|js|css|html|txt)$/.test(f) || f.endsWith('LICENSE')).filter((f) => !f.endsWith('verify.mjs'));
gate('no CLAUDE.md / .claude/', !existsSync(P('CLAUDE.md')) && !existsSync(P('.claude')));
gate('no AI attribution strings', joinedText.every((f) => !/(claude|anthropic|co-authored-by|generated with|ai-generated|chatgpt|openai)/i.test(readFileSync(f, 'utf8'))), '');
const visible = read('src/index.html').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
gate('no dates / timestamps / clock strings in copy', !/(19|20)\d{2}|\d{1,2}:\d{2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d|\d\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|as of|checked|updated|utc|ago/i.test(visible));
gate('no Date / toLocale*String time APIs rendered', walk(P('src/js')).every((f) => !/\bnew Date\b|Date\.now|toLocaleDateString|toLocaleTimeString/.test(readFileSync(f, 'utf8'))));
gate('no ch units in CSS', !/[0-9.]\s?ch\b/.test(css));
gate('README, whitepaper, LICENSE present', existsSync(P('README.md')) && existsSync(P('docs/whitepaper.md')) && existsSync(P('LICENSE')));
gate('LICENSE is MIT, SHUTDOWN, 2026', /MIT License/.test(read('LICENSE')) && /Copyright \(c\) 2026 SHUTDOWN/.test(read('LICENSE')));
gate('README has live badge, Solana, CA placeholder, Overview/Features/Links', ['badge', 'Solana', 'Contract address', '## Overview', '## Features', '## Links'].every((s) => new RegExp(s, 'i').test(read('README.md'))));
gate('whitepaper has vision, tokenomics, roadmap phases, team placeholder', ['Vision', 'Tokenomics', 'Phase 1', 'Phase 3', 'Team'].every((s) => read('docs/whitepaper.md').includes(s)));
gate('scroll progress, reveal, spotlight, count-up, parallax wired', ['initProgress', 'initReveal', 'initSpotlight', 'initParallax'].every((s) => read('src/js/main.js').includes(s)) && /setNumber/.test(read('src/js/board.js')));
gate('tap targets 44px declared (icon-btn, filters, search, ca-copy)', /\.icon-btn\{[^}]*width:44px;height:44px/.test(css) && /\.filters button\{min-height:44px/.test(css) && /\.search input\{[^}]*min-height:44px/.test(css) && /\.ca-copy\{[^}]*min-height:44px/.test(css));

rmSync(tmp, { recursive: true, force: true });
const b1 = build();
gate('final npm run build exit 0 (dist/ restored to committed register)', b1.status === 0);
console.log(`\ngates: ${total - failed}/${total} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
