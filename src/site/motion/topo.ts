/**
 * Paquets qui circulent sur la topologie réseau.
 * Chaque lien est échantillonné une fois en keyframes `translate` → Web Animations API :
 * entièrement composité, aucun JS par image. Pause hors écran / onglet caché / bouton « Animations ».
 */
const NS = 'http://www.w3.org/2000/svg';

export function initTopology(enabled: () => boolean): (on: boolean) => void {
  const anims: Animation[] = [];
  let visible = false;

  const build = () => {
    anims.forEach((a) => a.cancel());
    anims.length = 0;
    const svg = [...document.querySelectorAll<SVGSVGElement>('.topo-svg')].find((s) => s.getBoundingClientRect().width > 0);
    if (!svg) return;
    const layer = svg.querySelector('.packets')!;
    layer.replaceChildren();
    svg.querySelectorAll<SVGPathElement>('.lk[data-pts]').forEach((path, li) => {
      const pts = path.dataset.pts!.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
      const lens = [0];
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = lens[lens.length - 1];
      if (!total) return;
      const frames = pts.map((p, i) => ({ transform: `translate(${p[0]}px, ${p[1]}px)`, offset: lens[i] / total }));
      for (let k = 0; k < 2; k++) {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', '-4');
        r.setAttribute('y', '-2');
        r.setAttribute('width', '8');
        r.setAttribute('height', '4');
        layer.append(r);
        const out = (li + k) % 2 === 0;
        const duration = (total / 150) * 1000;
        const a = r.animate(out ? frames : [...frames].reverse().map((f) => ({ ...f, offset: 1 - f.offset })), {
          duration,
          iterations: Infinity,
          delay: -((li * 0.37 + k * 0.5) % 1) * duration,
          easing: 'linear',
        });
        anims.push(a);
        anims.push(
          r.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], {
            duration,
            iterations: Infinity,
            delay: a.effect?.getTiming().delay,
          }),
        );
      }
    });
    sync();
  };

  const sync = () => {
    const on = visible && enabled() && !document.hidden;
    for (const a of anims) {
      if (on) a.play();
      else a.pause();
    }
  };

  const fig = document.querySelector('.topo');
  if (!fig) return () => {};
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    sync();
  }).observe(fig);
  document.addEventListener('visibilitychange', sync);
  let mobile = window.matchMedia('(max-width: 47.99em)').matches;
  window.addEventListener('resize', () => {
    const m = window.matchMedia('(max-width: 47.99em)').matches;
    if (m !== mobile) {
      mobile = m;
      build();
    }
  });
  build();
  return () => sync();
}
