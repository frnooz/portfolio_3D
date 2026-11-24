// Captures de contrôle : desktop 1440×900, mobile 390×844, reduced-motion, sans JS, /cv/ (sombre et clair).
// Usage : npm run build && node scripts/shots.mjs [dossier de sortie]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchOptions, serve } from './serve.mjs';

const out = resolve(process.argv[2] ?? 'shots');
mkdirSync(out, { recursive: true });

const { url, close } = await serve(4323);
const browser = await chromium.launch(launchOptions());

const DESKTOP = { viewport: { width: 1440, height: 900 } };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SECTIONS = ['accueil', 'a-propos', 'projets', 'competences', 'contact', 'acces'];

async function tour(name, opts, { sections = true, full = false, js = true, path = '' } = {}) {
  const ctx = await browser.newContext({ ...opts, javaScriptEnabled: js });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/${name}-00-top.png` });
  if (sections && !path) {
    for (const [i, id] of SECTIONS.entries()) {
      if (!i) continue;
      const y = await page.evaluate((s) => {
        const el = document.getElementById(s);
        return el ? el.getBoundingClientRect().top + window.scrollY : 0;
      }, id);
      // on avance par paliers pour déclencher les animations liées au scroll
      const from = await page.evaluate(() => window.scrollY);
      for (let k = 1; k <= 6; k++) {
        await page.evaluate((v) => window.scrollTo(0, v), from + ((y - from) * k) / 6);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${out}/${name}-${String(i).padStart(2, '0')}-${id}.png` });
      if (id === 'projets' || id === 'competences' || id === 'a-propos') {
        for (const step of [0.5, 1]) {
          await page.evaluate(({ y, s }) => window.scrollTo(0, y + window.innerHeight * s * (document.documentElement.classList.contains('hz') && s ? 1.4 : 0.9)), { y, s: step });
          await page.waitForTimeout(1500);
          await page.screenshot({ path: `${out}/${name}-${String(i).padStart(2, '0')}-${id}-${step}.png` });
        }
      }
    }
  }
  if (full) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 600) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
  }
  if (errors.length) console.log(`  erreurs console (${name}) :`, errors);
  await ctx.close();
  console.log(`✓ ${name}`);
}

await tour('desktop-dark', { ...DESKTOP, colorScheme: 'dark' });
await tour('desktop-light', { ...DESKTOP, colorScheme: 'light' }, { sections: true });
await tour('mobile-dark', { ...MOBILE, colorScheme: 'dark' });
await tour('reduced-desktop', { ...DESKTOP, colorScheme: 'dark', reducedMotion: 'reduce' }, { sections: false, full: true });
await tour('reduced-mobile', { ...MOBILE, colorScheme: 'light', reducedMotion: 'reduce' }, { sections: false, full: true });
await tour('nojs-desktop', { ...DESKTOP, colorScheme: 'dark' }, { sections: false, full: true, js: false });
await tour('cv-dark', { ...DESKTOP, colorScheme: 'dark' }, { path: 'cv/' });
await tour('cv-light', { ...MOBILE, colorScheme: 'light' }, { path: 'cv/' });

await browser.close();
close();
