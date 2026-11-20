import '../styles/tokens.css';
import './home.css';
import { hasWebGL, prefersReducedMotion } from '../shared/env';

/**
 * Accueil : détection des capacités + mur de LEDs en arrière-plan.
 * Sans JavaScript, les deux versions restent proposées (la page 3D gère seule ses replis).
 */

const body = document.body;
const notice = document.getElementById('notice')!;
const webgl = hasWebGL();
const reduced = prefersReducedMotion();

if (!webgl) {
  body.classList.add('no-webgl', 'prefers-classic');
  notice.textContent =
    "WebGL 2 n'est pas disponible sur cet appareil : la salle 3D ne peut pas démarrer. La version classique contient tout le contenu.";
  notice.hidden = false;
} else if (reduced) {
  body.classList.add('prefers-classic');
  notice.textContent =
    'Ton système demande de réduire les animations : la version classique est mise en avant. La salle 3D reste accessible.';
  notice.hidden = false;
}

// ── mur de LEDs ─────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('.field')!;
const g = canvas.getContext('2d')!;
let W = 0;
let H = 0;
let dpr = 1;
interface Led {
  x: number;
  y: number;
  c: string;
  rate: number;
  phase: number;
  duty: number;
}
let leds: Led[] = [];
const COLORS = ['#39e58c', '#39e58c', '#39e58c', '#39e58c', '#5ce1ff', '#5ce1ff', '#ffb020'];
let mx = 0;
let my = 0;
let px = 0;
let py = 0;
let boost = 0;
let boostTarget = 0;

function rand(seed: number) {
  const s = Math.sin(seed * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  leds = [];
  // des baies vues de face : colonnes de 1U, groupées par 5, séparées par une allée
  const rackW = 46;
  const gap = 22;
  const unit = 9;
  let seed = 1;
  for (let rx = 10; rx < W + rackW; rx += rackW + gap) {
    for (let y = 30; y < H - 20; y += unit) {
      const fill = rand(seed++ + rx);
      if (fill < 0.18) continue; // emplacement vide
      const n = 1 + Math.floor(rand(seed++) * 3);
      for (let k = 0; k < n; k++) {
        const r = rand(seed++);
        leds.push({
          x: rx + rackW - 6 - k * 6,
          y,
          c: COLORS[Math.floor(rand(seed++) * COLORS.length)],
          rate: 0.4 + r * 5,
          phase: rand(seed++) * 10,
          duty: 0.25 + rand(seed++) * 0.6,
        });
      }
    }
  }
}

function draw(t: number) {
  boost += (boostTarget - boost) * 0.08;
  px += (mx - px) * 0.05;
  py += (my - py) * 0.05;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const ox = px * -10;
  const oy = py * -6;
  for (const l of leds) {
    const on = ((t * l.rate * (1 + boost * 2) + l.phase) % 1) < l.duty + boost * 0.3;
    g.globalAlpha = on ? 0.5 + boost * 0.4 : 0.07;
    g.fillStyle = l.c;
    g.fillRect(l.x + ox, l.y + oy, 2, 2);
  }
  g.globalAlpha = 1;
}

let last = 0;
let running = true;
function loop(now: number) {
  if (!running) return;
  requestAnimationFrame(loop);
  if (now - last < 33) return; // 30 i/s suffisent
  last = now;
  draw(now / 1000);
}

layout();
if (reduced) {
  draw(0);
} else {
  requestAnimationFrame(loop);
  window.addEventListener(
    'pointermove',
    (e) => {
      mx = e.clientX / W - 0.5;
      my = e.clientY / H - 0.5;
    },
    { passive: true },
  );
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(loop);
  });
  // survoler « entrer dans la salle » réveille les serveurs
  const way3d = document.querySelector('.way--3d a');
  for (const ev of ['pointerenter', 'focus'] as const) way3d?.addEventListener(ev, () => (boostTarget = 1));
  for (const ev of ['pointerleave', 'blur'] as const) way3d?.addEventListener(ev, () => (boostTarget = 0));
}
window.addEventListener('resize', () => {
  layout();
  if (reduced) draw(0);
});
