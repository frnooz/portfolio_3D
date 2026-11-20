import { profile } from '../../data/profile';
import { levelLabel } from '../../data/skills';
import type { ProjectLink, SkillLevel } from '../../data/types';
import type { Item } from '../world/layout';
import { LEVEL_COLOR } from '../world/layout';
import { prefersReducedMotion } from '../../shared/env';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const paragraphs = (s: string) =>
  s
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim())}</p>`)
    .join('');

const ICON: Record<ProjectLink['kind'], string> = {
  github:
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"/></svg>',
  demo: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M6 3H3v10h10v-3M9 2h5v5M14 2 7 9"/></svg>',
  doc: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M4 1.5h5.5L12.5 4.5v10h-8.5zM9 1.5v3.5h3.5M6 8h4.5M6 11h4.5"/></svg>',
  other: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M6 3H3v10h10v-3M9 2h5v5M14 2 7 9"/></svg>',
};

function linkList(links: ProjectLink[]): string {
  if (!links.length) return '';
  return `<ul class="pl-links" role="list">${links
    .map(
      (l) =>
        `<li><a class="pl-btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${ICON[l.kind]}<span>${esc(l.label)}</span><span class="sr-only"> (nouvel onglet)</span></a></li>`,
    )
    .join('')}</ul>`;
}

const STATUS_TEXT = {
  online: 'En ligne',
  building: 'En cours',
  slot: 'Slot libre',
} as const;

interface Rendered {
  code: string;
  host: string;
  status: { kind: string; text: string };
  title: string;
  tagline: string;
  body: string;
}

function render(item: Item): Rendered {
  switch (item.kind) {
    case 'project': {
      const p = item.project!;
      if (p.status === 'slot') {
        return {
          code: `BAIE ${item.code}`,
          host: p.hostname,
          status: { kind: 'slot', text: STATUS_TEXT.slot },
          title: p.title,
          tagline: 'Emplacement réservé — prochain déploiement en préparation.',
          body: `<pre class="pl-term" aria-label="Sortie de terminal"><span class="dim">$</span> kubectl get pods -n ${esc(p.hostname)}
No resources found.
<span class="dim">$</span> echo "bientôt"
bientôt<span class="caret" aria-hidden="true">▍</span></pre>`,
        };
      }
      const meta = [p.context, p.year].filter(Boolean).map((s) => esc(s!)).join(' · ');
      return {
        code: `BAIE ${item.code}`,
        host: p.hostname,
        status: { kind: p.status, text: STATUS_TEXT[p.status] },
        title: p.title,
        tagline: p.tagline,
        body: `
          ${meta ? `<p class="pl-meta">${meta}</p>` : ''}
          <div class="pl-desc">${paragraphs(p.description)}</div>
          ${p.highlights?.length ? `<h3 class="pl-h">Points clés</h3><ul class="pl-list">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
          ${p.stack.length ? `<h3 class="pl-h">Stack</h3><ul class="pl-tags" role="list">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
          ${linkList(p.links)}`,
      };
    }
    case 'skill': {
      const d = item.domain!;
      const order: SkillLevel[] = ['solide', 'pratique', 'apprentissage'];
      const groups = order
        .map((lvl) => {
          const list = d.skills.filter((s) => s.level === lvl);
          if (!list.length) return '';
          return `<h3 class="pl-h"><span class="led" style="--c:${LEVEL_COLOR[lvl]}" aria-hidden="true"></span>${levelLabel[lvl]}</h3>
            <ul class="pl-skills" role="list">${list
              .map((s) => `<li><span>${esc(s.name)}</span>${s.note ? `<small>${esc(s.note)}</small>` : ''}</li>`)
              .join('')}</ul>`;
        })
        .join('');
      return {
        code: `BAIE ${item.code}`,
        host: d.hostname,
        status: { kind: 'online', text: `${d.skills.length} services` },
        title: d.title,
        tagline: d.summary,
        body: `${groups}<p class="pl-legend">Une compétence = un serveur dans la baie. LED verte : solide · cyan : en pratique · ambre : en apprentissage.</p>`,
      };
    }
    case 'about':
      return {
        code: 'NOC',
        host: 'supervision-01',
        status: { kind: 'online', text: 'Opérateur en poste' },
        title: profile.name,
        tagline: profile.role,
        body: `
          <div class="pl-desc">${profile.about.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
          <dl class="pl-facts">${profile.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>
          ${linkList(profile.links)}
          ${profile.email ? `<p class="pl-mail"><a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a></p>` : ''}
          <p class="pl-legend">Indice : le CV tourne encore sur un vieux serveur, tout au fond de la salle.</p>`,
      };
    case 'cv':
      return {
        code: 'LEGACY',
        host: 'legacy-srv-1998',
        status: { kind: 'legacy', text: 'Uptime : 28 ans' },
        title: 'Curriculum vitæ',
        tagline: 'Le serveur le plus vieux de la salle. Et le seul qui imprime encore.',
        body: `
          <pre class="pl-term" aria-hidden="true"><span class="dim">C:\\&gt;</span> DIR CV
 ${esc(profile.cv.fileName.toUpperCase().slice(0, 30))}
 1 fichier(s) — mis à jour ${esc(profile.cv.updated)}</pre>
          <p>Toute mon expérience, mes formations et mes compétences sur une page.</p>
          <ul class="pl-links" role="list"><li><a class="pl-btn pl-btn--primary" href="../${esc(profile.cv.path)}" download="${esc(profile.cv.fileName)}">${ICON.doc}<span>Télécharger le CV</span><span class="sr-only"> (PDF)</span></a></li>
          <li><a class="pl-btn" href="../${esc(profile.cv.path)}" target="_blank" rel="noopener">${ICON.demo}<span>Ouvrir dans le navigateur</span><span class="sr-only"> (nouvel onglet)</span></a></li></ul>`,
      };
  }
}

/** Effet « déchiffrement » sur le titre — désactivé si animations réduites. */
function scramble(el: HTMLElement, text: string) {
  if (prefersReducedMotion()) {
    el.textContent = text;
    return;
  }
  const glyphs = '01<>/\\[]{}#$%&*+=?ABCDEFXZ';
  const start = performance.now();
  const dur = 420;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    const solid = Math.floor(t * text.length);
    let out = text.slice(0, solid);
    for (let i = solid; i < text.length; i++) out += text[i] === ' ' ? ' ' : glyphs[(Math.random() * glyphs.length) | 0];
    el.textContent = out;
    if (t < 1 && el.dataset.text === text) requestAnimationFrame(tick);
    else if (el.dataset.text === text) el.textContent = text;
  };
  el.dataset.text = text;
  requestAnimationFrame(tick);
}

export class Panel {
  private readonly root: HTMLElement;
  private readonly announcer: HTMLElement;
  current: Item | null = null;
  /** Fermé à la main : on ne le rouvre pas tant que le robot n'est pas sorti de la zone. */
  dismissed: string | null = null;
  onClose?: () => void;

  constructor() {
    this.root = document.getElementById('panel')!;
    this.announcer = document.getElementById('announcer')!;
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-close]')) this.close(true);
    });
  }

  get isOpen() {
    return this.current !== null;
  }

  show(item: Item) {
    if (this.current?.id === item.id) return;
    this.current = item;
    const r = render(item);
    this.root.dataset.kind = item.kind;
    this.root.innerHTML = `
      <div class="pl-inner">
        <div class="pl-head">
          <span class="pl-code">${esc(r.code)}</span>
          <span class="pl-host">${esc(r.host)}</span>
          <span class="pl-status" data-status="${esc(r.status.kind)}"><span class="led" aria-hidden="true"></span>${esc(r.status.text)}</span>
          <button type="button" class="pl-close" data-close aria-label="Fermer le panneau">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="1.6"/></svg>
          </button>
        </div>
        <div class="pl-scroll">
          <h2 class="pl-title" id="panel-title" tabindex="-1"></h2>
          <p class="pl-tagline">${esc(r.tagline)}</p>
          <div class="pl-body">${r.body}</div>
        </div>
        <p class="pl-foot" aria-hidden="true"><kbd>Entrée</kbd> lire · <kbd>Échap</kbd> fermer</p>
      </div>`;
    scramble(this.root.querySelector('.pl-title')!, r.title);
    this.root.hidden = false;
    // force reflow pour relancer la transition d'entrée
    void this.root.offsetWidth;
    this.root.classList.add('is-open');
    this.announcer.textContent = `${r.code} : ${r.title}. Appuie sur Entrée pour lire le détail.`;
  }

  hide() {
    if (!this.current) return;
    const hadFocus = this.root.contains(document.activeElement);
    this.current = null;
    this.root.classList.remove('is-open');
    window.setTimeout(() => {
      if (!this.current) this.root.hidden = true;
    }, 260);
    if (hadFocus) document.getElementById('scene-title')?.focus({ preventScroll: true });
  }

  close(manual: boolean) {
    if (manual && this.current) this.dismissed = this.current.id;
    this.hide();
    this.onClose?.();
  }

  /** Déplace le focus clavier dans le panneau (touche Entrée / E). */
  focus() {
    const title = this.root.querySelector<HTMLElement>('.pl-title');
    if (title) {
      title.textContent = title.dataset.text ?? title.textContent;
      title.focus();
    }
  }
}
