import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  // Chemins relatifs : le site marche sur GitHub Pages (/portfolio_3d/), Vercel ou un domaine perso.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 2048,
    rollupOptions: {
      input: {
        home: resolve(root, 'index.html'),
        salle: resolve(root, '3d/index.html'),
        classique: resolve(root, 'classique/index.html'),
      },
    },
  },
});
