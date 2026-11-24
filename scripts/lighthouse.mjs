// Lighthouse (desktop) sur / et /cv/ : performance, accessibilité, bonnes pratiques, SEO.
// Usage : npm run build && node scripts/lighthouse.mjs   (Edge ou Chrome installé requis)
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { launchOptions, serve } from './serve.mjs';

const { url, close } = await serve(4324);
const chromePath = launchOptions().executablePath;
const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new'] });
let ok = true;

for (const path of ['', 'cv/']) {
  const res = await lighthouse(url + path, { port: chrome.port, output: 'json', logLevel: 'error' }, {
    extends: 'lighthouse:default',
    settings: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttlingMethod: 'simulate', throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } },
  });
  const lhr = res.lhr;
  const scores = Object.values(lhr.categories).map((c) => `${c.title} ${Math.round(c.score * 100)}`);
  const a = lhr.audits;
  console.log(`/${path} — ${scores.join(' · ')}`);
  console.log(`   LCP ${a['largest-contentful-paint'].displayValue} · CLS ${a['cumulative-layout-shift'].displayValue} · TBT ${a['total-blocking-time'].displayValue} · FCP ${a['first-contentful-paint'].displayValue}`);
  for (const c of Object.values(lhr.categories)) {
    if (c.score < 0.95) ok = false;
    for (const ref of c.auditRefs) {
      const au = a[ref.id];
      if (ref.weight > 0 && au.score !== null && au.score < 0.9) console.log(`   ↳ ${c.title} : ${au.title} (${au.displayValue ?? au.score})`);
    }
  }
}

await chrome.kill();
close();
process.exit(ok ? 0 : 1);
