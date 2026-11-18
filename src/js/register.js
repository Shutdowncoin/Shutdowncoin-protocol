// Register: every external fact is one record with state stated|absent|unconfirmed.
const raw = JSON.parse(document.getElementById('register').textContent);
export const register = raw;
export const isStated = (rec) => !!rec && rec.state === 'stated';
export const rec = (name) => raw[name];
export const handleFromUrl = (url) => {
  try {
    const p = new URL(url).pathname.split('/').filter(Boolean);
    return p.length ? '@' + p[0] : null;
  } catch {
    return null;
  }
};
export const ca = () => (isStated(raw.ca) ? raw.ca.value : null);
