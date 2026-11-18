// Build: src/ -> dist/ (or $SHUTDOWN_OUT). $SHUTDOWN_REGISTER overrides the register file (used by verify to prove both CA branches).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.env.SHUTDOWN_OUT || 'dist');
const regPath = resolve(root, process.env.SHUTDOWN_REGISTER || 'src/register.json');
const src = (p) => join(root, 'src', p);

const register = JSON.parse(readFileSync(regPath, 'utf8'));
const tokens = readFileSync(src('css/tokens.css'), 'utf8');
const bg = tokens.match(/--color-bg:\s*(#[0-9a-fA-F]{6})/)?.[1];
if (!bg) throw new Error('tokens.css: --color-bg missing');

if (register.ca.state === 'stated' && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(register.ca.value || '')) {
  throw new Error('register: ca is stated but not a valid base58 Solana address');
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const d of ['css', 'js', 'assets']) cpSync(src(d), join(out, d), { recursive: true });
cpSync(regPath, join(out, 'register.json'));

// Logo: explicit copy of the premultiplied-resized brand logo into dist (index.html references ./assets/logo.png)
const logos = [['assets/logo.png', 'assets/logo.png'], ['assets/logo-192.png', 'assets/logo-192.png'], ['assets/favicon.svg', 'assets/favicon.svg'], ['assets/cover.jpg', 'assets/cover.jpg']];
for (const [from, to] of logos) {
  cpSync(src(from), join(out, to));
  if (!existsSync(join(out, to)) || statSync(join(out, to)).size === 0) throw new Error('missing in dist: ' + to);
}

const safeJson = JSON.stringify(register).replace(/</g, '\u003c');
const html = readFileSync(src('index.html'), 'utf8')
  .replaceAll('%%THEME_COLOR%%', bg)
  .replace('%%REGISTER%%', safeJson);
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, 'CNAME'), register.domain.value + '\n');
console.log(`build ok -> ${out} (ca: ${register.ca.state})`);
