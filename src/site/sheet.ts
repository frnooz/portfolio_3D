/**
 * Fiche détaillée d'un projet : <dialog> natif (focus piégé, Échap, retour du focus).
 * Ouverture morphée depuis la lame avec la View Transitions API si elle existe,
 * sinon une courte animation transform/opacity ; rien du tout en reduced-motion.
 * Le détail est DÉPLACÉ (pas copié) dans la fiche : aucun id dupliqué, et sans JS il reste dans la lame.
 */
import { emit } from './scroll';

const ICON_X =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="1.5"/></svg>';

interface Open {
  id: string;
  blade: HTMLElement;
  detail: HTMLElement;
  trigger: HTMLElement | null;
}

export function initSheets(reduced: () => boolean): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-open]');
  if (!buttons.length) return;

  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.setAttribute('aria-labelledby', 'sheet-t');
  dlg.setAttribute('data-lenis-prevent', '');
  dlg.innerHTML = `<div class="sheet-panel">
      <div class="sheet-top"><div class="sheet-id"></div><button type="button" class="sheet-x">${ICON_X}<span class="sr-only">Fermer la fiche</span></button></div>
      <div class="sheet-status"></div>
      <h2 id="sheet-t" class="sheet-title" tabindex="-1"></h2>
      <p class="sheet-tag"></p>
      <div class="sheet-meta"></div>
      <div class="sheet-body"></div>
    </div>`;
  document.body.append(dlg);
  const panel = dlg.querySelector<HTMLElement>('.sheet-panel')!;
  const q = (s: string) => dlg.querySelector<HTMLElement>(s)!;
  let cur: Open | null = null;

  const fill = (o: Open) => {
    const b = o.blade;
    q('.sheet-id').replaceChildren(b.querySelector('.blade-top')!.cloneNode(true));
    q('.sheet-status').replaceChildren(b.querySelector('.status')!.cloneNode(true));
    q('.sheet-title').textContent = b.querySelector('.blade-title')!.textContent;
    q('.sheet-tag').textContent = b.querySelector('.blade-tag')?.textContent ?? '';
    const meta = q('.sheet-meta');
    meta.replaceChildren();
    const m = b.querySelector('.blade-meta');
    const tags = b.querySelector('.tags');
    if (m) meta.append(m.cloneNode(true));
    if (tags) meta.append(tags.cloneNode(true));
    q('.sheet-body').replaceChildren(o.detail);
  };

  const vt = (cb: () => void) => {
    if (reduced() || typeof document.startViewTransition !== 'function') return null;
    return document.startViewTransition(cb);
  };

  function open(id: string, trigger: HTMLElement | null, animate = true): void {
    if (cur) return;
    const blade = document.querySelector<HTMLElement>(`#${CSS.escape(id)} .blade`);
    const detail = document.getElementById(`d-${id}`);
    if (!blade || !detail) return;
    cur = { id, blade, detail, trigger };
    const o = cur;
    const show = () => {
      fill(o);
      dlg.showModal();
      q('.sheet-title').focus({ preventScroll: true });
    };
    emit('dc:modal', true);
    history.replaceState(null, '', `#${id}`);

    if (!animate) return show();
    blade.style.viewTransitionName = 'sheet';
    const t = vt(() => {
      blade.style.viewTransitionName = '';
      show();
      panel.style.viewTransitionName = 'sheet';
    });
    if (t) {
      t.finished.finally(() => (panel.style.viewTransitionName = ''));
      return;
    }
    blade.style.viewTransitionName = '';
    show();
    if (!reduced()) {
      panel.animate(
        [
          { opacity: 0, transform: 'translateY(24px) scale(0.98)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    }
  }

  function close(): void {
    if (!cur) return;
    const o = cur;
    const finish = () => {
      dlg.close();
      o.blade.querySelector('.blade-open')!.after(o.detail);
      cur = null;
      emit('dc:modal', false);
      history.replaceState(null, '', '#projets');
      (o.trigger ?? o.blade.querySelector<HTMLElement>('.blade-open'))?.focus({ preventScroll: true });
    };
    panel.style.viewTransitionName = 'sheet';
    const t = vt(() => {
      panel.style.viewTransitionName = '';
      finish();
      o.blade.style.viewTransitionName = 'sheet';
    });
    if (t) {
      t.finished.finally(() => (o.blade.style.viewTransitionName = ''));
      return;
    }
    panel.style.viewTransitionName = '';
    if (reduced()) return finish();
    panel
      .animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(16px) scale(0.98)' },
        ],
        { duration: 220, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
      )
      .finished.then(finish, finish);
  }

  for (const b of buttons) b.addEventListener('click', () => open(b.dataset.open!, b));
  q('.sheet-x').addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  // clic hors du panneau
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });

  // lien direct : /#ubertaxi ouvre la fiche
  const fromHash = () => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id && document.querySelector(`[data-open="${CSS.escape(id)}"]`)) open(id, null, false);
  };
  fromHash();
  window.addEventListener('hashchange', fromHash);
}
