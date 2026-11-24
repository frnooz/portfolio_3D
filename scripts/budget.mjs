// Budget JS de la page 2D : tout le JS atteignable depuis index.html (imports statiques ET dynamiques),
// librairies comprises, mesuré en gzip. Échoue au-delà de 80 Ko.
// Usage : npm run build && node scripts/budget.mjs
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const LIMIT = 80 * 1024;
const dist = resolve(import.meta.dirname, '../dist');
const manifest = JSON.parse(readFileSync(resolve(dist, '.vite/manifest.json'), 'utf8'));

const seen = new Set();
const walk = (key) => {
  const entry = manifest[key];
  if (!entry || seen.has(key)) return;
  seen.add(key);
  for (const k of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) walk(k);
};
walk('index.html');

let total = 0;
const rows = [];
for (const key of seen) {
  const file = manifest[key].file;
  if (!file.endsWith('.js')) continue;
  const gz = gzipSync(readFileSync(resolve(dist, file)), { level: 9 }).length;
  total += gz;
  rows.push([file, gz]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [f, gz] of rows) console.log(`${(gz / 1024).toFixed(1).padStart(6)} Ko  ${f}`);
console.log(`${(total / 1024).toFixed(1).padStart(6)} Ko  TOTAL (limite ${LIMIT / 1024} Ko)`);
if (total > LIMIT) {
  console.error('Budget JS dépassé.');
  process.exit(1);
}
