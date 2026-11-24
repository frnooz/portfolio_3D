/**
 * Page 2D — script de base, chargé tout de suite (petit, sans librairie).
 * La page est complète sans lui : il ajoute l'horloge, le menu, la copie d'e-mail, la fiche projet,
 * les câbles, l'indicateur de section… puis charge le motion design APRÈS le premier rendu.
 */
import '../styles/tokens.css';
import './styles/base.css';
import './styles/hero.css';
import './styles/noc.css';
import './styles/aisle.css';
import './styles/patch.css';
import './styles/ticket.css';
import './styles/door.css';
import './styles/fx.css';
import './styles/print.css';
import { hasWebGL, store } from '../shared/env';
import { emit, scroller } from './scroll';
import { initSheets } from './sheet';
import { initPatch } from './patch';

const root = document.documentElement;
root.classList.add('enh');
const rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => rmQuery.matches;
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];

// ── horloge réelle (barre d'état) ─────────────────────────────────────────
{
  const wrap = $('.sb-clock');
  const el = $('.clock');
  if (wrap && el) {
    const fmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let timer = 0;
    const tick = () => {
      el.textContent = fmt.format(new Date());
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    wrap.hidden = false;
    tick();
    document.addEventListener('visibilitychange', () => {
      clearTimeout(timer);
      if (!document.hidden) tick();
    });
  }
}

// ── menu mobile ───────────────────────────────────────────────────────────
const hd = $('.hd')!;
const menuBtn = $<HTMLButtonElement>('.hd-menu')!;
const setMenu = (open: boolean) => {
  hd.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
};
menuBtn.addEventListener('click', () => setMenu(!hd.classList.contains('open')));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && hd.classList.contains('open')) {
    setMenu(false);
    menuBtn.focus();
  }
});
document.addEventListener('click', (e) => {
  if (hd.classList.contains('open') && !hd.contains(e.target as Node)) setMenu(false);
});

// ── pause globale des animations (WCAG 2.2.2) ─────────────────────────────
{
  const btn = $<HTMLButtonElement>('.hd-motion')!;
  const sync = () => btn.setAttribute('aria-pressed', String(root.classList.contains('motion-off')));
  sync();
  btn.addEventListener('click', () => {
    const off = !root.classList.contains('motion-off');
    root.classList.toggle('motion-off', off);
    store.set('dc01-motion', off ? 'off' : 'on');
    sync();
    emit('dc:motion', !off);
  });
}

// ── ancres internes : défilement + focus sur le titre de la section ──────
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const id = decodeURIComponent(a.hash.slice(1));
  const target = id && document.getElementById(id);
  if (!target || a.classList.contains('skip-link')) return;
  e.preventDefault();
  setMenu(false);
  scroller.to(target, !reduced());
  history.pushState(null, '', `#${id}`);
  const focusable = target.matches('section') ? target.querySelector<HTMLElement>('h1, h2[tabindex]') : null;
  (focusable ?? target).focus({ preventScroll: true });
});
// le h1 sert de cible au lien « haut de page »
$('.hero-name')?.setAttribute('tabindex', '-1');

// ── section courante : header « 03/06 — PROJETS », aria-current, rail ────
{
  const sections = $$('main > section[data-n]');
  const where = { n: $('.hd-n')!, l: $('.hd-l')! };
  const links = $$<HTMLAnchorElement>('[data-nav]');
  let current = '';
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const s = en.target as HTMLElement;
        if (s.id === current) continue;
        current = s.id;
        where.n.textContent = s.dataset.n!;
        where.l.textContent = s.dataset.label!;
        for (const l of links) {
          if (l.dataset.nav === s.id) l.setAttribute('aria-current', 'true');
          else l.removeAttribute('aria-current');
        }
        emit('dc:section', s.id);
      }
    },
    { rootMargin: '-45% 0px -54% 0px' },
  );
  sections.forEach((s) => io.observe(s));

  // rail : un repère qui descend de U42 à U01 avec la progression
  const mark = $('.rail-mark');
  const u = $('.rail-u');
  const scale = $('.rail-scale');
  if (mark && u && scale) {
    let raf = 0;
    let lastU = '';
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const room = scale.clientHeight - mark.offsetHeight;
      mark.style.transform = `translate3d(0, ${(p * room).toFixed(1)}px, 0)`;
      const label = `U${String(42 - Math.round(p * 41)).padStart(2, '0')}`;
      if (label !== lastU) u.textContent = lastU = label;
    };
    const req = () => (raf ||= requestAnimationFrame(update));
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    update();
  }
}

// ── bandeau d'état : en pause hors écran ──────────────────────────────────
{
  const track = $('.mq-track');
  if (track) {
    new IntersectionObserver(([en]) => track.classList.toggle('paused', !en.isIntersecting)).observe(track);
  }
}

// ── copier l'e-mail (toast annoncé aux lecteurs d'écran) ──────────────────
{
  const toastEl = $('.toast')!;
  let t = 0;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(t);
    t = window.setTimeout(() => {
      toastEl.classList.remove('show');
      t = window.setTimeout(() => (toastEl.textContent = ''), 400);
    }, 3200);
  };
  for (const btn of $$<HTMLButtonElement>('[data-copy]')) {
    btn.addEventListener('click', async () => {
      const value = btn.dataset.copy!;
      try {
        await navigator.clipboard.writeText(value);
        toast(`Adresse e-mail copiée : ${value}`);
      } catch {
        // repli : sélectionne l'adresse pour une copie manuelle
        const link = btn.parentElement?.querySelector('a');
        if (link) window.getSelection()?.selectAllChildren(link);
        toast('Copie automatique impossible : l’adresse est sélectionnée, fais Ctrl + C.');
      }
    });
  }
}

// ── fiche projet + câbles de brassage ─────────────────────────────────────
initSheets(reduced);
initPatch();

// ── WebGL 2 : sans lui, la porte reste fermée et le lien 3D disparaît ─────
const idle = (cb: () => void) =>
  typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout: 1500 }) : globalThis.setTimeout(cb, 300);

idle(() => {
  if (hasWebGL()) return;
  root.classList.add('no-webgl');
  const door = $<HTMLAnchorElement>('.door');
  // un <a> sans href n'est plus un lien : ni focus, ni lien mort
  door?.removeAttribute('href');
});

const notice = $('#notice');
if (notice && new URLSearchParams(window.location.search).get('raison') === 'webgl') {
  notice.textContent =
    "WebGL 2 n'est pas disponible sur cet appareil : la salle 3D ne peut pas démarrer. Tout le contenu est sur cette page.";
  notice.hidden = false;
}

// ── motion design : chargé après le premier rendu, jamais en reduced-motion ──
if (reduced()) {
  import('./wall').then((m) => m.staticWall());
} else {
  import('./motion').then((m) => m.startMotion());
}
