// Audit axe-core (WCAG 2.2 A/AA + bonnes pratiques) sur /, /cv/ et /classique/, thèmes sombre et clair,
// avec et sans animations. La page est parcourue jusqu'en bas avant l'audit (révélations jouées).
// Usage : npm run build && node scripts/a11y.mjs   (Edge ou Chrome installé requis)
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { launchOptions, serve } from './serve.mjs';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');


const { url, close } = await serve(4322);
const browser = await chromium.launch(launchOptions());
let failures = 0;

// /classique/ n'est qu'une redirection : on vérifie qu'elle aboutit sur /
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url + 'classique/#projets', { waitUntil: 'networkidle' });
  console.log(`redirection /classique/#projets → ${page.url().replace(url, '/')}`);
  await ctx.close();
}

for (const path of ['', 'cv/']) {
  for (const colorScheme of ['dark', 'light']) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme, reducedMotion });
      const page = await ctx.newPage();
      await page.goto(url + path, { waitUntil: 'networkidle' });
      // parcours complet pour déclencher toutes les révélations
      await page.waitForTimeout(1500);
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += 500) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(90);
      }
      await page.waitForTimeout(2200);
      await page.addScriptTag({ path: axePath });
      const res = await page.evaluate(() =>
        // @ts-ignore
        window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        }),
      );
      const label = `/${path} · ${colorScheme} · ${reducedMotion}`;
      if (res.violations.length) {
        failures += res.violations.length;
        console.log(`✗ ${label} : ${res.violations.length} violation(s)`);
        for (const v of res.violations) {
          console.log(`  - [${v.impact}] ${v.id} : ${v.help}`);
          for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
        }
      } else {
        console.log(`✓ ${label} : 0 violation (${res.passes.length} règles passées, ${res.incomplete.length} à vérifier)`);
      }
      await ctx.close();
    }
  }
}

await browser.close();
close();
process.exit(failures ? 1 : 0);
