/**
 * Rendu statique de la page 2D (`/`).
 * Toute la page est générée ici depuis `src/data/` : lisible et navigable sans JavaScript.
 * Le script (src/site/) n'ajoute que de petites interactions par-dessus ce HTML.
 *
 * Parti pris : une page courte et calme. Cinq blocs, chacun avec sa propre forme,
 * une seule couleur d'ambiance, et le thème datacenter porté par les détails
 * (baie illustrée, écrans, LEDs d'état, étiquettes d'inventaire), pas par des effets.
 */
import { profile } from '../data/profile.ts';
import { projects } from '../data/projects.ts';
import { levelLabel, skillDomains } from '../data/skills.ts';
import type { Project, SkillDomain, SkillLevel } from '../data/types.ts';
import { STATUS, code, esc, ext, prettyUrl, stats, tidy } from './shared.ts';

const LEVELS: SkillLevel[] = ['solide', 'pratique', 'apprentissage'];
const safeColor = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : 'currentColor');

/** Styles dépendant des données (couleur de chaque domaine), injectés dans le <head>. */
export function renderSiteHead(): string {
  return `<style>${skillDomains.map((d) => `.dom-${esc(d.id)}{--dom:${safeColor(d.color)}}`).join('')}</style>`;
}

export function renderSite(): string {
  return tidy(
    [
      '<a class="skip-link" href="#contenu">Aller au contenu</a>',
      renderNav(),
      '<main id="contenu" tabindex="-1">',
      renderHero(),
      renderProjects(),
      renderSkills(),
      renderAbout(),
      renderContact(),
      renderSas(),
      '</main>',
      renderFooter(),
      '<div class="toast" role="status" aria-live="polite" aria-atomic="true"></div>',
    ].join('\n'),
  );
}

// ── navigation : une pilule flottante, items en commentaires de code ───────
const NAV = [
  ['projets', 'projets'],
  ['competences', 'compétences'],
  ['a-propos', 'à propos'],
  ['contact', 'contact'],
] as const;

function renderNav(): string {
  return `
<header class="nav">
  <nav class="pill" aria-label="Navigation principale">
    <a class="pill-home" href="#top"><span class="sr-only">${esc(profile.name)} — haut de page</span><span aria-hidden="true">${esc(initials(profile.name))}</span></a>
    <ul class="pill-links">
      ${NAV.map(([id, label]) => `<li><a href="#${id}" data-nav="${id}"><span class="slashes" aria-hidden="true">//</span>${esc(label)}</a></li>`).join('')}
    </ul>
    <a class="pill-3d needs-webgl" href="./3d/?choix=3d">3D<span class="sr-only"> : la salle serveur</span><span class="arr" aria-hidden="true">→</span></a>
  </nav>
</header>`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// ── hero : le nom, une ligne, une baie illustrée ───────────────────────────
function renderHero(): string {
  return `
<section id="top" class="hero" aria-labelledby="h-top">
  <div class="hero-rack" aria-hidden="true">${rackSvg()}</div>
  <div class="hero-text">
    <p class="kicker"><span class="dot dot-ok" aria-hidden="true"></span>dc-01 · ${stats.online} service${stats.online > 1 ? 's' : ''} en ligne</p>
    <h1 id="h-top" class="hero-name" tabindex="-1">${esc(profile.name)}</h1>
    <p class="hero-role">${esc(profile.role)}</p>
    <p id="notice" class="notice" role="status" hidden></p>
  </div>
  <a class="hero-down" href="#projets"><span class="sr-only">Aller aux projets</span><span aria-hidden="true">↓</span></a>
</section>`;
}

/** Une baie de serveurs en SVG : unités, grilles d'aération et LEDs (animées en CSS). Déterministe. */
function rackSvg(): string {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const W = 300;
  const X = 30;
  const units: string[] = [];
  const leds: string[] = [];
  let y = 46;
  const kinds = [1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 1, 1, 2, 1];
  kinds.forEach((h, i) => {
    const hh = h * 24 - 4;
    const empty = i === 4 || i === 9;
    units.push(
      `<rect class="u${empty ? ' u-empty' : ''}" x="${X + 14}" y="${y}" width="${W - 28}" height="${hh}" rx="3"/>`,
    );
    if (!empty) {
      for (let v = 0; v < 6; v++) units.push(`<rect class="vent" x="${X + 26 + v * 7}" y="${y + 6}" width="3" height="${hh - 12}" rx="1"/>`);
      const n = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const tone = rnd() < 0.8 ? 'ok' : rnd() < 0.5 ? 'info' : 'warn';
        leds.push(
          `<circle class="l l-${tone}" cx="${X + W - 30 - k * 12}" cy="${y + 10}" r="2.6" style="--d:${(rnd() * 3).toFixed(2)}s;--p:${(1.4 + rnd() * 3).toFixed(2)}s"/>`,
        );
      }
    }
    y += h * 24;
  });
  const H = y + 30;
  return `<svg viewBox="0 0 ${W + 2 * X} ${H}" focusable="false">
    <rect class="frame" x="${X}" y="18" width="${W}" height="${H - 30}" rx="10"/>
    <rect class="post" x="${X + 4}" y="30" width="6" height="${H - 54}" rx="2"/>
    <rect class="post" x="${X + W - 10}" y="30" width="6" height="${H - 54}" rx="2"/>
    <rect class="crown" x="${X + 40}" y="26" width="${W - 80}" height="6" rx="3"/>
    ${units.join('')}
    ${leds.join('')}
  </svg>`;
}

// ── projets : des cartes avec un écran ─────────────────────────────────────
function screen(p: Project): string {
  if (p.cover) {
    return `<div class="screen screen-img"><img src="./${esc(p.cover)}" alt="${esc(p.coverAlt ?? '')}" loading="lazy" decoding="async" width="1280" height="800"></div>`;
  }
  const lines = [
    `<span class="pr">$</span> ssh ${esc(p.hostname)}`,
    `<span class="st st-${p.status}">●</span> ${esc(STATUS[p.status].toLowerCase())}`,
    `<span class="pr">$</span> ls services/`,
    ...p.stack.slice(0, 4).map((s) => `<span class="dim">▸</span> ${esc(s.toLowerCase())}`),
  ];
  return `<div class="screen" aria-hidden="true"><div class="screen-bar"><i></i><i></i><i></i><span>${esc(p.hostname)}</span></div><pre>${lines.join('\n')}<span class="caret"></span></pre></div>`;
}

function card(p: Project): string {
  const i = projects.indexOf(p);
  const id = esc(p.id);
  const meta = [p.context, p.year].filter(Boolean).map((s) => esc(s!)).join(' · ');
  return `
    <li class="card card-${p.status}" id="${id}">
      <article aria-labelledby="t-${id}">
        ${screen(p)}
        <div class="card-body">
          <p class="card-meta"><span class="status"><span class="dot dot-${p.status}" aria-hidden="true"></span>${STATUS[p.status]}</span><span class="tagcode">${code('A', i)}</span></p>
          <h3 id="t-${id}" class="card-title">${esc(p.title)}</h3>
          <p class="card-tag">${esc(p.tagline)}</p>
          ${meta ? `<p class="card-ctx">${meta}</p>` : ''}
          ${p.stack.length ? `<ul class="tags" aria-label="Stack">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
          <div class="card-detail" id="d-${id}">
            ${p.description
              .split(/\n\s*\n/)
              .map((d) => `<p>${esc(d.trim())}</p>`)
              .join('')}
            ${p.highlights?.length ? `<h4>Points clés</h4><ul class="list">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
            ${p.links.length ? `<h4>Liens</h4><ul class="links">${p.links.map((l) => `<li>${ext(l)}</li>`).join('')}</ul>` : ''}
          </div>
          <button class="card-open" type="button" aria-haspopup="dialog" data-open="${id}">Voir le projet<span class="sr-only"> ${esc(p.title)}</span><span class="arr" aria-hidden="true">→</span></button>
        </div>
      </article>
    </li>`;
}

function slotsCard(slots: Project[]): string {
  if (!slots.length) return '';
  const n = slots.length;
  return `
    <li class="card card-slots" id="${esc(slots[0].id)}">
      <article aria-labelledby="t-slots">
        <div class="slots-rack" aria-hidden="true">${slots.map(() => '<i><b></b></i>').join('')}</div>
        <div class="card-body">
          <p class="card-meta"><span class="status"><span class="dot dot-slot" aria-hidden="true"></span>${STATUS.slot}</span><span class="tagcode">${code('A', projects.indexOf(slots[0]))} → ${code('A', projects.indexOf(slots[n - 1]))}</span></p>
          <h3 id="t-slots" class="card-title">${n > 1 ? `${n} emplacements libres` : 'Un emplacement libre'}</h3>
          <p class="card-tag">${esc(slots[0].description)}</p>
          <ul class="slot-list">${slots.map((s) => `<li><span class="tagcode">${code('A', projects.indexOf(s))}</span> ${esc(s.hostname)}</li>`).join('')}</ul>
        </div>
      </article>
    </li>`;
}

function renderProjects(): string {
  const real = projects.filter((p) => p.status !== 'slot');
  const slots = projects.filter((p) => p.status === 'slot');
  const lede = `${stats.deployed} en service${stats.slots ? `, ${stats.slots} emplacement${stats.slots > 1 ? 's' : ''} pour la suite` : ''}.`;
  return `
<section id="projets" class="sec" aria-labelledby="h-projets">
  <div class="wrap">
    <div class="sec-head reveal">
      <p class="kicker">// allée a</p>
      <h2 id="h-projets" tabindex="-1">Projets</h2>
      <p class="lede">${esc(lede)}</p>
    </div>
    <ul class="cards">
      ${real.map(card).join('')}
      ${slotsCard(slots)}
    </ul>
  </div>
</section>`;
}

// ── compétences : trois baies côte à côte ──────────────────────────────────
function domain(d: SkillDomain, i: number): string {
  const id = esc(d.id);
  const sorted = [...d.skills].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
  return `
    <section class="dom dom-${id} reveal" aria-labelledby="t-${id}">
      <p class="dom-top"><span class="tagcode">${code('B', i)}</span><span class="dom-host">${esc(d.hostname)}</span></p>
      <h3 id="t-${id}" class="dom-title"><span class="dom-dot" aria-hidden="true"></span>${esc(d.title)}</h3>
      <p class="dom-sum">${esc(d.summary)}</p>
      <ul class="skills">
        ${sorted
          .map(
            (s) => `
        <li class="skill"><span class="skill-name">${esc(s.name)}${s.note ? ` <small>— ${esc(s.note)}</small>` : ''}</span><span class="level level-${s.level}"><span class="dot" aria-hidden="true"></span>${levelLabel[s.level]}</span></li>`,
          )
          .join('')}
      </ul>
    </section>`;
}

function renderSkills(): string {
  return `
<section id="competences" class="sec" aria-labelledby="h-competences">
  <div class="wrap">
    <div class="sec-head reveal">
      <p class="kicker">// allée b</p>
      <h2 id="h-competences" tabindex="-1">Compétences</h2>
      <p class="lede">Trois domaines, et pour chaque compétence un niveau écrit en toutes lettres.</p>
    </div>
    <div class="doms">${skillDomains.map(domain).join('')}</div>
  </div>
</section>`;
}

// ── à propos : du texte, simplement ────────────────────────────────────────
function renderAbout(): string {
  return `
<section id="a-propos" class="sec" aria-labelledby="h-a-propos">
  <div class="wrap about">
    <div class="sec-head reveal">
      <p class="kicker">// poste de supervision</p>
      <h2 id="h-a-propos" tabindex="-1">À propos</h2>
    </div>
    <div class="about-text reveal">
      ${profile.about.map((p, i) => `<p${i === 0 ? ' class="about-lead"' : ''}>${esc(p)}</p>`).join('')}
    </div>
    <dl class="facts reveal">
      ${profile.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}
    </dl>
  </div>
</section>`;
}

// ── contact ────────────────────────────────────────────────────────────────
function renderContact(): string {
  const rows: string[] = [];
  for (const l of profile.links) rows.push(`<li><span class="row-k">${esc(l.label)}</span>${ext(l, prettyUrl(l.url))}</li>`);
  rows.push(`<li><span class="row-k">CV</span><a href="./cv/">Consulter le CV<span class="arr" aria-hidden="true">→</span></a></li>`);
  return `
<section id="contact" class="sec" aria-labelledby="h-contact">
  <div class="wrap contact">
    <div class="sec-head reveal">
      <p class="kicker">// ouvrir un ticket</p>
      <h2 id="h-contact" tabindex="-1">Contact</h2>
    </div>
    <div class="contact-main reveal">
      ${
        profile.email
          ? `<p class="mail"><a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a><button class="copy" type="button" data-copy="${esc(profile.email)}">Copier<span class="sr-only"> l'adresse e-mail</span></button></p>`
          : ''
      }
      <ul class="rows">${rows.join('')}</ul>
    </div>
  </div>
</section>`;
}

// ── fin de page : le sas vers la salle 3D ──────────────────────────────────
function renderSas(): string {
  const leaf = (side: 'l' | 'r') =>
    `<span class="leaf leaf-${side}"><span class="leaf-win"></span><span class="leaf-bars"><i></i><i></i><i></i></span></span>`;
  return `
<section id="acces" class="sec sas" aria-labelledby="h-acces">
  <div class="wrap sas-in">
    <div class="sec-head reveal">
      <p class="kicker">// sas 01</p>
      <h2 id="h-acces" tabindex="-1">Envie de voir la salle&nbsp;?</h2>
      <p class="lede">Le même portfolio, en 3D : tu pilotes un petit robot de maintenance entre les baies.</p>
    </div>
    <div class="door-wrap reveal">
      <a class="door" href="./3d/?choix=3d">
        <span class="door-frame" aria-hidden="true">
          <span class="hazard"></span>
          <span class="door-gap"><span class="door-glow"></span>${leaf('l')}${leaf('r')}</span>
          <span class="reader"><span class="reader-led"></span></span>
        </span>
        <span class="door-cta">Entrer dans la salle serveur<span class="sr-only"> (version 3D)</span><span class="arr" aria-hidden="true">→</span></span>
      </a>
      <p class="door-off">La salle 3D a besoin de WebGL 2, indisponible sur cet appareil : la porte reste fermée. Tout le contenu est sur cette page.</p>
    </div>
  </div>
</section>`;
}

function renderFooter(): string {
  return `
<footer class="foot">
  <div class="wrap foot-in">
    <p>© 2026 ${esc(profile.name)}</p>
    <ul>
      <li><a href="./cv/">CV</a></li>
      ${profile.links.map((l) => `<li>${ext(l)}</li>`).join('')}
      <li><a href="#top">Haut de page<span class="arr" aria-hidden="true">↑</span></a></li>
    </ul>
  </div>
</footer>`;
}
