import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import * as staticRender from './src/classic/render.ts';

const root = import.meta.dirname;

/**
 * Pré-rendu : la version classique et l'index de l'accueil sont générés en HTML statique
 * depuis src/data/ → valides W3C, lisibles sans JavaScript, indexables.
 */
function prerender(): Plugin {
  let server: ViteDevServer | undefined;
  return {
    name: 'dc01-prerender',
    configureServer(s) {
      server = s;
    },
    async transformIndexHtml(html, ctx) {
      const r = (server
        ? await server.ssrLoadModule('/src/classic/render.ts')
        : staticRender) as typeof staticRender;
      const file = ctx.filename.replace(/\\/g, '/');
      if (file.endsWith('/classique/index.html')) return html.replace(/[ \t]*<!--CLASSIC-->/, r.renderClassic());
      if (file.endsWith('/index.html') && !file.includes('/3d/')) return html.replace(/[ \t]*<!--HOME-INDEX-->/, r.renderHomeIndex());
      return html;
    },
    handleHotUpdate({ file, server: s }) {
      if (file.includes('/src/data/') || file.includes('/src/classic/render')) s.ws.send({ type: 'full-reload' });
    },
  };
}

export default defineConfig({
  // Chemins relatifs : le site marche sur GitHub Pages (/portfolio_3d/), Vercel ou un domaine perso.
  base: './',
  plugins: [prerender()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 2048,
    // le chunk three.js (~170 Ko gzip) n'est chargé qu'à l'entrée dans la salle, jamais sur l'accueil
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        home: resolve(root, 'index.html'),
        salle: resolve(root, '3d/index.html'),
        classique: resolve(root, 'classique/index.html'),
      },
    },
  },
});
