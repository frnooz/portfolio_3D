/**
 * Page 2D — un seul petit script, sans librairie.
 * La page est complète sans lui ; il ajoute :
 *  - l'apparition douce des blocs au scroll (jamais en animations réduites)
 *  - la fiche projet en <dialog> natif
 *  - la copie de l'e-mail (annoncée aux lecteurs d'écran)
 *  - la section courante dans la navigation
 *  - la porte du sas (et son repli sans WebGL 2)
 */
import '../styles/tokens.css';
import './site.css';
import { hasWebGL } from '../shared/env';

const root = document.documentElement;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];

// ── apparition au scroll ──────────────────────────────────────────────────
{
  const items = $$('.reveal, .card');
  // décalage léger entre les cartes d'une même rangée
  $$('.cards > .card').forEach((c, i) => c.style.setProperty('--delay', `${(i % 2) * 0.08}s`));
  if (reduced() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    items.forEach((el) => io.observe(el));
  }
}

// ── WCAG 2.2.2 : les LEDs clignotent 5 s puis se figent ──────────────────
window.setTimeout(() => root.classList.add('still'), 5000);

// ── section courante dans la pilule ───────────────────────────────────────
{
  const links = $$<HTMLAnchorElement>('[data-nav]');
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        for (const l of links) {
          if (l.dataset.nav === en.target.id) l.setAttribute('aria-current', 'true');
          else l.removeAttribute('aria-current');
        }
      }
    },
    { rootMargin: '-45% 0px -54% 0px' },
  );
  $$('main > section[id]').forEach((s) => io.observe(s));
}

// ── ancres : le focus suit le défilement (lecteurs d'écran, clavier) ──────
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!a || a.classList.contains('skip-link') || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  history.pushState(null, '', a.hash);
  const heading = target.querySelector<HTMLElement>('h1[tabindex], h2[tabindex]');
  (heading ?? target).focus({ preventScroll: true });
});

// ── toast ─────────────────────────────────────────────────────────────────
const toastEl = $('.toast')!;
let toastTimer = 0;
function toast(msg: string) {
  toastEl.textContent = msg;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove('show');
    toastTimer = window.setTimeout(() => (toastEl.textContent = ''), 400);
  }, 3000);
}

// ── copier l'e-mail ───────────────────────────────────────────────────────
for (const btn of $$<HTMLButtonElement>('[data-copy]')) {
  btn.addEventListener('click', async () => {
    const value = btn.dataset.copy!;
    try {
      await navigator.clipboard.writeText(value);
      toast(`Adresse copiée : ${value}`);
    } catch {
      const link = btn.parentElement?.querySelector('a');
      if (link) window.getSelection()?.selectAllChildren(link);
      toast('Copie automatique impossible : l’adresse est sélectionnée, fais Ctrl + C.');
    }
  });
}

// ── fiche projet (dialog natif : focus piégé, Échap, retour du focus) ─────
{
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.setAttribute('aria-labelledby', 'sheet-title');
  dlg.innerHTML = `<div class="sheet-in">
    <div class="sheet-head"><div><p class="card-meta"></p><h2 id="sheet-title" tabindex="-1"></h2></div>
    <button class="sheet-close" type="button"><span class="sr-only">Fermer la fiche</span><span aria-hidden="true">×</span></button></div>
    <div class="sheet-body"></div></div>`;
  document.body.append(dlg);
  const title = $('#sheet-title', dlg)!;
  const meta = $('.card-meta', dlg)!;
  const body = $('.sheet-body', dlg)!;
  let trigger: HTMLElement | null = null;

  const open = (id: string, from: HTMLElement | null) => {
    const card = document.getElementById(id);
    if (!card) return;
    trigger = from;
    meta.replaceChildren(...$$('.card-meta > *', card).map((n) => n.cloneNode(true)));
    title.textContent = $('.card-title', card)?.textContent ?? '';
    body.replaceChildren(
      ...['.card-tag', '.card-ctx', '.tags', '.card-detail']
        .map((s) => $(s, card))
        .filter((n): n is HTMLElement => !!n)
        .map((n) => n.cloneNode(true)),
    );
    dlg.showModal();
    title.focus();
    history.replaceState(null, '', `#${id}`);
  };
  const close = () => dlg.close();
  dlg.addEventListener('close', () => {
    history.replaceState(null, '', location.pathname + location.search);
    trigger?.focus();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || (e.target as Element).closest('.sheet-close')) close();
  });
  for (const b of $$<HTMLButtonElement>('[data-open]')) b.addEventListener('click', () => open(b.dataset.open!, b));
  // lien direct vers un projet (#ubertaxi) : on ouvre sa fiche
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash && $(`[data-open="${CSS.escape(hash)}"]`)) open(hash, $(`[data-open="${CSS.escape(hash)}"]`));
}

// ── WebGL 2 et porte du sas ───────────────────────────────────────────────
{
  const door = $<HTMLAnchorElement>('.door');
  const idle = (cb: () => void) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout: 1500 }) : globalThis.setTimeout(cb, 300);
  idle(() => {
    if (hasWebGL()) return;
    root.classList.add('no-webgl');
    door?.removeAttribute('href'); // plus un lien : ni focus, ni lien mort
  });

  door?.addEventListener('click', (e) => {
    if (reduced() || e.metaKey || e.ctrlKey || e.shiftKey || !door.href) return;
    e.preventDefault();
    door.classList.add('opening');
    window.setTimeout(() => document.body.classList.add('leaving'), 420);
    window.setTimeout(() => (location.href = door.href), 800);
  });
  // retour arrière depuis la 3D (bfcache) : on referme la porte
  window.addEventListener('pageshow', () => {
    door?.classList.remove('opening');
    document.body.classList.remove('leaving');
  });

  const notice = $('#notice');
  if (notice && new URLSearchParams(location.search).get('raison') === 'webgl') {
    notice.textContent = "WebGL 2 n'est pas disponible sur cet appareil : la salle 3D ne peut pas démarrer. Tout le contenu est sur cette page.";
    notice.hidden = false;
  }
}
