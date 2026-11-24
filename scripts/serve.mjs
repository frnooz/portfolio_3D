// Petit serveur statique pour les vérifications (dist/ servi sous /portfolio_3d/, comme sur GitHub Pages).
import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

export const BASE = '/portfolio_3d/';

export function serve(port = 4321) {
  const root = resolve(import.meta.dirname, '../dist');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith(BASE)) {
      // hors du sous-dossier (robots.txt du domaine…) : comme sur GitHub Pages, rien à nous
      if (url.pathname === '/') res.writeHead(302, { location: BASE });
      else res.writeHead(404);
      return res.end();
    }
    let file = join(root, decodeURIComponent(url.pathname.slice(BASE.length)));
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=3600' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('404');
    }
  });
  return new Promise((ok) => server.listen(port, () => ok({ url: `http://localhost:${port}${BASE}`, close: () => server.close() })));
}

/** Navigateur à piloter : BROWSER_PATH, sinon Edge/Chrome installés aux emplacements habituels. */
export function launchOptions() {
  const core = 'C:/Program Files (x86)/Microsoft/EdgeCore';
  const edgeCore = existsSync(core)
    ? readdirSync(core)
        .sort()
        .reverse()
        .map((v) => `${core}/${v}/msedge.exe`)
    : [];
  const candidates = [
    process.env.BROWSER_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ...edgeCore,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const exe = candidates.find((p) => existsSync(p));
  return exe ? { executablePath: exe } : { channel: 'chrome' };
}
