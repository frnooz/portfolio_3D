/**
 * Panneau de brassage : un câble par compétence, de l'uplink du domaine à son port.
 * Les câbles sont tracés d'après la position réelle des ports (ResizeObserver) et ne se croisent
 * jamais : le port le plus à gauche de l'uplink va au port le plus bas, sur le couloir le plus extérieur.
 * Survol ou focus d'un port → son câble passe en surbrillance (opacité uniquement).
 */
import { emit } from './scroll';

const NS = 'http://www.w3.org/2000/svg';

function rounded(pts: [number, number][], r: number): string {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0);
    const l2 = Math.hypot(x2 - x1, y2 - y1);
    const k = Math.min(r, l1 / 2, l2 / 2);
    if (k < 0.5) {
      d += ` L${x1} ${y1}`;
      continue;
    }
    d += ` L${(x1 - ((x1 - x0) / l1) * k).toFixed(1)} ${(y1 - ((y1 - y0) / l1) * k).toFixed(1)} Q${x1} ${y1} ${(x1 + ((x2 - x1) / l2) * k).toFixed(1)} ${(y1 + ((y2 - y1) / l2) * k).toFixed(1)}`;
  }
  const l = pts[pts.length - 1];
  return `${d} L${l[0]} ${l[1]}`;
}

export const cables = new Map<HTMLElement, SVGPathElement[]>();

function layout(dom: HTMLElement): void {
  const svg = dom.querySelector('svg.cables')!;
  const ups = [...dom.querySelectorAll<HTMLElement>('.dom-uplink i')];
  const ports = [...dom.querySelectorAll<HTMLElement>('.port')];
  const box = dom.getBoundingClientRect();
  const W = box.width;
  const H = box.height;
  svg.setAttribute('viewBox', `0 0 ${W.toFixed(0)} ${H.toFixed(0)}`);
  const n = ports.length;
  const old = cables.get(dom);
  const paths: SVGPathElement[] = old && old.length === n ? old : [];
  if (!paths.length) {
    svg.replaceChildren();
    for (let k = 0; k < n; k++) {
      const p = document.createElementNS(NS, 'path');
      svg.append(p);
      paths.push(p);
    }
  }
  const laneL = 12;
  const laneR = 40;
  ports.forEach((port, k) => {
    // port k (de haut en bas) ← uplink n-1-k (de droite à gauche)
    const u = ups[n - 1 - k]?.getBoundingClientRect();
    const rj = port.querySelector('.rj')!.getBoundingClientRect();
    if (!u) return;
    const ux = Math.round(u.left + u.width / 2 - box.left) + 0.5;
    const uy = Math.round(u.bottom - box.top);
    const j = n - 1 - k; // 0 = port le plus bas
    const lane = Math.round(laneL + ((laneR - laneL) * j) / Math.max(1, n - 1)) + 0.5;
    // l'uplink le plus à gauche descend le moins : aucun croisement
    const hy = uy + 8 + Math.round((22 * j) / Math.max(1, n - 1));
    const py = Math.round(rj.top + rj.height * 0.36 - box.top) + 0.5;
    const px = Math.round(rj.left - box.left);
    paths[k].setAttribute(
      'd',
      rounded(
        [
          [ux, uy],
          [ux, hy],
          [lane, hy],
          [lane, py],
          [px, py],
        ],
        5,
      ),
    );
  });
  cables.set(dom, paths);
}

export function initPatch(): void {
  const doms = [...document.querySelectorAll<HTMLElement>('.dom')];
  if (!doms.length) return;

  let raf = 0;
  const relayout = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      doms.forEach(layout);
      emit('dc:cables');
    });
  };
  doms.forEach(layout);
  new ResizeObserver(relayout).observe(document.querySelector('.patch')!);
  document.fonts?.ready.then(relayout);

  for (const dom of doms) {
    const svg = dom.querySelector('svg.cables')!;
    dom.querySelectorAll<HTMLElement>('.port').forEach((port, k) => {
      port.tabIndex = 0;
      const on = () => {
        port.classList.add('hot');
        svg.classList.add('has-hot');
        cables.get(dom)?.[k]?.classList.add('hot');
      };
      const off = () => {
        port.classList.remove('hot');
        svg.classList.remove('has-hot');
        cables.get(dom)?.[k]?.classList.remove('hot');
      };
      port.addEventListener('pointerenter', on);
      port.addEventListener('pointerleave', () => document.activeElement !== port && off());
      port.addEventListener('focus', on);
      port.addEventListener('blur', off);
    });
  }
}
