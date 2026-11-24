/**
 * Motion design de la page 2D (chargé après le premier rendu, jamais en reduced-motion).
 * GSAP + ScrollTrigger + Lenis. Règles : seules transform et opacity sont animées
 * (exception assumée : stroke-dashoffset pour tracer les câbles), tout ce qui boucle
 * se met en pause hors écran, onglet caché, ou via le bouton « Animations ».
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { scroller } from './scroll';
import { cables } from './patch';
import { Wall } from './wall';
import { indexChars, scheduleTerminal, scramble } from './motion/text';
import { initTopology } from './motion/topo';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const $ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => [...el.querySelectorAll<T>(s)];
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const motionOn = () => !root.classList.contains('motion-off');

export function startMotion(): void {
  const lenis = smoothScroll();
  const wall = heroWall();
  intro();
  reveals();
  aisle();
  patchCables();
  door();
  headerRoll();
  if (fine) {
    reticle();
    magnetic();
  }
  const topo = initTopology(motionOn);
  document.addEventListener('dc:motion', () => {
    wall?.setEnabled(motionOn());
    topo(motionOn());
  });
  document.addEventListener('dc:modal', (e) => {
    if ((e as CustomEvent<boolean>).detail) lenis?.stop();
    else lenis?.start();
  });
  // les polices peuvent changer les hauteurs : on recalcule une fois chargées
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

// ── scroll fluide (desktop, pointeur fin uniquement) ────────────────────────
function smoothScroll(): Lenis | null {
  if (!fine) return null;
  const lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  const hdr = () => $('.hd')?.offsetHeight ?? 0;
  scroller.to = (el, smooth = true) => lenis.scrollTo(el, { offset: -hdr(), immediate: !smooth, duration: 1.2 });
  scroller.jump = (y) => lenis.scrollTo(y, { immediate: true, force: true });
  scroller.stop = () => lenis.stop();
  scroller.start = () => lenis.start();
  return lenis;
}

// ── mur de baies + parallaxe ────────────────────────────────────────────────
function heroWall(): Wall | null {
  const canvas = $<HTMLCanvasElement>('.hero-wall');
  if (!canvas) return null;
  const wall = new Wall(canvas);
  wall.setEnabled(motionOn());
  wall.start();
  if (fine) {
    window.addEventListener(
      'pointermove',
      (e) => wall.pointer(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5),
      { passive: true },
    );
  }
  return wall;
}

// ── POST + révélation du nom ───────────────────────────────────────────────
function intro(): void {
  const name = $('.hero-name');
  if (!name || !root.classList.contains('intro')) return;

  // délai de chaque lettre = moment où la scanline passe dessus
  const sweep = 1000;
  const box = name.getBoundingClientRect();
  for (const c of $$('.c', name)) {
    const r = c.getBoundingClientRect();
    const d = ((r.left + r.width / 2 - box.left) / Math.max(1, box.width)) * sweep * 0.92;
    c.style.setProperty('--d', `${Math.round(d + Math.random() * 40)}ms`);
  }
  name.style.setProperty('--sweep', `${sweep}ms`);
  root.classList.add('hero-armed');

  const hx = $$('.hx');
  gsap.set(hx, { opacity: 0, y: 14 });

  const go = () => {
    root.classList.add('hero-go');
    gsap.to(hx, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, delay: 0.35 });
    $$('.hero-meta .scr').forEach((el, i) => scramble(el, 700, 380 + i * 90));
  };

  if (!root.classList.contains('post')) return go();

  root.classList.add('post-armed');
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', end, true);
    root.classList.add('post-out');
    go();
    window.setTimeout(() => root.classList.remove('post', 'post-out', 'post-armed'), 560);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      end();
    }
  };
  // ≤ 1,2 s en tout depuis le début du chargement
  const timer = window.setTimeout(end, Math.max(0, 1150 - performance.now()));
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', end, true);
}

// ── révélations au scroll ──────────────────────────────────────────────────
function reveals(): void {
  root.classList.add('rv');

  for (const head of $$('.sec-head')) {
    indexChars(head);
    ScrollTrigger.create({
      trigger: head,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        head.classList.add('in');
        $$('.sec-meta .scr', head).forEach((el, i) => scramble(el, 600, 200 + i * 110));
      },
    });
  }

  // blocs qui montent en fondu (les lames de l'allée A sont gérées à part)
  const items = $$(
    '.noc-about > *, .term, .fact, .metric, .topo, .legend, .dom, .ticket, .door-wrap',
  );
  gsap.set(items, { opacity: 0, y: 28 });
  ScrollTrigger.batch(items, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.07, overwrite: true }),
  });

  // facts : l'étiquette se déchiffre
  for (const fact of $$('.fact')) {
    ScrollTrigger.create({
      trigger: fact,
      start: 'top 88%',
      once: true,
      onEnter: () => $$('.scr', fact).forEach((el) => scramble(el, 650, 150)),
    });
  }

  // compteurs (le vrai chiffre est en sr-only, celui-ci est décoratif)
  for (const el of $$('.count')) {
    const to = Number(el.dataset.to ?? 0);
    const pad = (v: number) => String(Math.round(v)).padStart(2, '0');
    el.textContent = pad(0);
    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        const o = { v: 0 };
        gsap.to(o, { v: to, duration: 1.6, ease: 'power3.out', onUpdate: () => (el.textContent = pad(o.v)) });
      },
    });
  }

  // terminal whoami
  const term = $('.term');
  if (term) {
    scheduleTerminal(term);
    ScrollTrigger.create({ trigger: term, start: 'top 80%', once: true, onEnter: () => term.classList.add('in') });
  }
}

// ── allée A : section épinglée + défilement horizontal (desktop) ───────────
function aisle(): void {
  const view = $('.aisle-view');
  const rack = $('.rack');
  const bar = $('.aisle-bar i');
  if (!view || !rack) return;
  const bays = $$('.bay', rack);
  const mm = gsap.matchMedia();

  mm.add('(min-width: 64em) and (min-height: 36em)', () => {
    root.classList.add('hz');
    // épinglage en position: sticky (géré par le navigateur) plutôt qu'avec `pin` :
    // aucun passage en position fixed, donc aucun décalage de mise en page (CLS 0).
    // La hauteur de l'allée = un écran + la distance horizontale à parcourir.
    const aisleEl = view.parentElement!;
    const dist = () => Math.max(0, rack.scrollWidth - view.clientWidth);
    const size = () => (aisleEl.style.height = `${view.offsetHeight + dist()}px`);
    size();
    ScrollTrigger.addEventListener('refreshInit', size);
    const tween = gsap.to(rack, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: aisleEl,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.7,
        invalidateOnRefresh: true,
        onUpdate: (self) => bar && gsap.set(bar, { scaleX: self.progress }),
      },
    });
    // chaque lame glisse hors du rack en entrant à l'écran, sa LED s'allume
    for (const bay of bays) {
      const blade = $('.blade', bay)!;
      gsap.fromTo(
        blade,
        { opacity: 0.3, scale: 0.9, y: 18 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          ease: 'power2.out',
          scrollTrigger: { trigger: bay, containerAnimation: tween, start: 'left 102%', end: 'left 62%', scrub: true },
        },
      );
      ScrollTrigger.create({
        trigger: bay,
        containerAnimation: tween,
        start: 'left 78%',
        toggleClass: { targets: bay, className: 'lit' },
      });
    }
    // clavier : une lame qui reçoit le focus est amenée au centre de l'écran
    const onFocus = (e: FocusEvent) => {
      const bay = (e.target as Element).closest<HTMLElement>('.bay');
      const st = tween.scrollTrigger;
      if (!bay || !st) return;
      const d = dist();
      const x = bay.offsetLeft - (view.clientWidth - bay.offsetWidth) / 2;
      const p = d ? Math.min(1, Math.max(0, x / d)) : 0;
      scroller.jump(st.start + p * (st.end - st.start));
    };
    rack.addEventListener('focusin', onFocus);
    return () => {
      rack.removeEventListener('focusin', onFocus);
      ScrollTrigger.removeEventListener('refreshInit', size);
      aisleEl.style.height = '';
      root.classList.remove('hz');
    };
  });

  mm.add('not ((min-width: 64em) and (min-height: 36em))', () => {
    gsap.set(bays, { opacity: 0, y: 32 });
    ScrollTrigger.batch(bays, {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => {
        batch.forEach((b) => b.classList.add('lit'));
        gsap.to(batch, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 });
      },
    });
    return () => gsap.set(bays, { clearProps: 'opacity,transform' });
  });
}

// ── câbles de brassage : tracés au scroll ──────────────────────────────────
function patchCables(): void {
  const tweens = new Map<HTMLElement, gsap.core.Tween>();
  const arm = () => {
    for (const [dom, paths] of cables) {
      const prev = tweens.get(dom);
      const progress = prev?.scrollTrigger?.progress ?? 0;
      prev?.scrollTrigger?.kill();
      prev?.kill();
      for (const p of paths) {
        const len = p.getTotalLength();
        p.style.strokeDasharray = `${len}`;
        p.style.strokeDashoffset = `${len * (1 - progress)}`;
      }
      tweens.set(
        dom,
        gsap.to(paths, {
          strokeDashoffset: 0,
          ease: 'none',
          stagger: 0.04,
          scrollTrigger: { trigger: dom, start: 'top 82%', end: 'bottom 75%', scrub: 0.6 },
        }),
      );
    }
  };
  arm();
  document.addEventListener('dc:cables', arm);
}

// ── la porte du sas ────────────────────────────────────────────────────────
function door(): void {
  const el = $<HTMLAnchorElement>('.door');
  if (!el) return;
  const leaves = { l: $('.leaf-l', el)!, r: $('.leaf-r', el)! };
  const glow = $('.door-glow', el)!;
  let overlay: HTMLElement | null = null;
  let tl: gsap.core.Timeline | null = null;

  el.addEventListener('click', (e) => {
    const href = el.getAttribute('href');
    if (!href || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    el.classList.add('opening');
    overlay = document.createElement('div');
    overlay.className = 'crt-off';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<i class="crt-t"></i><i class="crt-b"></i><i class="crt-line"></i>';
    document.body.append(overlay);
    const [top, bottom, line] = $$('i', overlay);
    tl = gsap.timeline({ onComplete: () => window.location.assign(el.href) });
    tl.to(leaves.l, { xPercent: -101, duration: 0.8, ease: 'power3.inOut' }, 0)
      .to(leaves.r, { xPercent: 101, duration: 0.8, ease: 'power3.inOut' }, 0)
      .to(glow, { opacity: 1, scale: 1.6, duration: 0.8, ease: 'power2.inOut' }, 0)
      // extinction cathodique : l'image s'écrase en une ligne, puis en un point
      .set(overlay, { visibility: 'visible' }, 0.62)
      .fromTo(top, { yPercent: -100 }, { yPercent: 0, duration: 0.3, ease: 'power3.in' }, 0.62)
      .fromTo(bottom, { yPercent: 100 }, { yPercent: 0, duration: 0.3, ease: 'power3.in' }, 0.62)
      .to(line, { opacity: 1, duration: 0.04 }, 0.9)
      .to(line, { scaleX: 0.003, duration: 0.24, ease: 'power2.in' }, 0.96)
      .to(line, { opacity: 0, duration: 0.14 }, 1.18);
  });

  // retour arrière (bfcache) : la porte est refermée, l'écran rallumé
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    tl?.kill();
    overlay?.remove();
    overlay = null;
    el.classList.remove('opening');
    gsap.set([leaves.l, leaves.r, glow], { clearProps: 'transform,opacity' });
  });
}

// ── header : le numéro de section roule ────────────────────────────────────
function headerRoll(): void {
  const els = $$('.hd-n, .hd-l');
  document.addEventListener('dc:section', () => {
    gsap.fromTo(els, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.45, ease: 'expo.out', stagger: 0.04, overwrite: true });
  });
}

// ── réticule avec coordonnées (le curseur natif reste visible) ──────────────
function reticle(): void {
  const r = document.createElement('div');
  r.className = 'reticle';
  r.setAttribute('aria-hidden', 'true');
  r.innerHTML = '<span class="ret-box"></span><span class="ret-c"></span>';
  document.body.append(r);
  const label = $('.ret-c', r)!;
  const xTo = gsap.quickTo(r, 'x', { duration: 0.35, ease: 'power3' });
  const yTo = gsap.quickTo(r, 'y', { duration: 0.35, ease: 'power3' });
  const pad = (n: number) => String(Math.max(0, Math.round(n))).padStart(4, '0');
  let pending = false;
  let cx = 0;
  let cy = 0;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      r.classList.add('on');
      xTo(e.clientX);
      yTo(e.clientY);
      cx = e.pageX;
      cy = e.pageY;
      if (!pending) {
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          label.textContent = `X ${pad(cx)} · Y ${pad(cy)}`;
        });
      }
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => r.classList.remove('on'));
  document.addEventListener('pointerover', (e) => {
    const t = (e.target as Element).closest('a[href], button, [tabindex="0"]');
    r.classList.toggle('target', !!t);
  });
}

// ── boutons magnétiques ─────────────────────────────────────────────────────
function magnetic(): void {
  for (const el of $$('.mag, .blade-open, .copy, .hd-cv, .cv-btn')) {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      if (!motionOn()) return;
      const b = el.getBoundingClientRect();
      xTo(Math.max(-10, Math.min(10, (e.clientX - (b.left + b.width / 2)) * 0.28)));
      yTo(Math.max(-8, Math.min(8, (e.clientY - (b.top + b.height / 2)) * 0.32)));
    });
    el.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
    });
  }
}
