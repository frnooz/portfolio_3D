import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import * as siteRender from './src/render/site.ts';
import * as cvRender from './src/render/cv.ts';

const root = import.meta.dirname;

/**
 * Pré-rendu : la page 2D et /cv/ sont générées en HTML statique depuis src/data/
 * → valides W3C, lisibles sans JavaScript, indexables, et le LCP n'attend pas le JS.
 */
function prerender(): Plugin {
  let server: ViteDevServer | undefined;
  const load = async () => {
    if (!server) return { site: siteRender, cv: cvRender };
    return {
      site: (await server.ssrLoadModule('/src/render/site.ts')) as typeof siteRender,
      cv: (await server.ssrLoadModule('/src/render/cv.ts')) as typeof cvRender,
    };
  };
  return {
    name: 'dc01-prerender',
    configureServer(s) {
      server = s;
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        const file = ctx.filename.replace(/\\/g, '/');
        const r = await load();
        if (file.endsWith('/cv/index.html')) return html.replace(/[ \t]*<!--CV-->/, r.cv.renderCv());
        if (file === `${root.replace(/\\/g, '/')}/index.html`) {
          return html.replace(/[ \t]*<!--SITE-HEAD-->/, r.site.renderSiteHead()).replace(/[ \t]*<!--SITE-->/, r.site.renderSite());
        }
        return html;
      },
    },
    handleHotUpdate({ file, server: s }) {
      if (file.includes('/src/data/') || file.includes('/src/render/')) s.ws.send({ type: 'full-reload' });
    },
  };
}

/**
 * Précharge les seules polices de la page (Archivo variable + mono 400/500, sous-ensembles latins) :
 * elles arrivent avant le premier rendu → pas de changement de police visible ni de décalage.
 */
function preloadFonts(): Plugin {
  const wanted = [/archivo-latin-wdth-normal-.*\.woff2$/, /ibm-plex-mono-latin-[45]00-normal-.*\.woff2$/];
  return {
    name: 'dc01-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const file = ctx.filename.replace(/\\/g, '/');
        if (!ctx.bundle || file.includes('/3d/') || file.includes('/classique/')) return html;
        const prefix = file.endsWith('/cv/index.html') ? '../' : './';
        const links = Object.keys(ctx.bundle)
          .filter((f) => wanted.some((re) => re.test(f)))
          .map((f) => `<link rel="preload" href="${prefix}${f}" as="font" type="font/woff2" crossorigin>`);
        return html.replace('</title>', `</title>\n    ${links.join('\n    ')}`);
      },
    },
  };
}

export default defineConfig({
  // Chemins relatifs : le site marche sur GitHub Pages (/portfolio_3d/), Vercel ou un domaine perso.
  base: './',
  plugins: [prerender(), preloadFonts()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 2048,
    // sert à scripts/budget.mjs pour mesurer tout le JS atteignable depuis la page 2D
    manifest: true,
    // le chunk three.js (~175 Ko gzip) n'est chargé que dans /3d/, jamais sur la page 2D
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        site: resolve(root, 'index.html'),
        salle: resolve(root, '3d/index.html'),
        cv: resolve(root, 'cv/index.html'),
        classique: resolve(root, 'classique/index.html'),
      },
    },
  },
});
