/**
 * Rendu statique de la page 2D (`/`).
 * Toute la page est générée ici depuis `src/data/` : lisible et navigable sans JavaScript,
 * le motion design (src/site/) ne fait qu'animer ce HTML.
 */
import { profile } from '../data/profile.ts';
import { projects } from '../data/projects.ts';
import { levelLabel, skillDomains } from '../data/skills.ts';
import type { Project, SkillDomain, SkillLevel } from '../data/types.ts';
import { STATUS, code, esc, ext, pad2, prettyUrl, scr, split, splitChars, stats, tidy } from './shared.ts';

/** Les six sections, numérotées comme des unités de baie (U42 en haut → U01 en bas). */
export const SECTIONS = [
  { id: 'accueil', label: 'Accueil', tag: 'Fiche', u: [42, 37] },
  { id: 'a-propos', label: 'À propos', tag: 'NOC', u: [36, 29] },
  { id: 'projets', label: 'Projets', tag: 'Allée A', u: [28, 19] },
  { id: 'competences', label: 'Compétences', tag: 'Allée B', u: [18, 10] },
  { id: 'contact', label: 'Contact', tag: 'Ticket', u: [9, 5] },
  { id: 'acces', label: 'Accès', title: 'Accès au datacenter', tag: 'Sas', u: [4, 1] },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
const sec = (id: SectionId) => {
  const i = SECTIONS.findIndex((s) => s.id === id);
  return { ...SECTIONS[i], n: pad2(i + 1), range: `U${pad2(SECTIONS[i].u[0])}–U${pad2(SECTIONS[i].u[1])}` };
};
const TOTAL = pad2(SECTIONS.length);
const LEVELS: SkillLevel[] = ['solide', 'pratique', 'apprentissage'];
const host = profile.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
const prompt = `${profile.firstName.toLowerCase()}@dc-01:~$`;

/** Styles dépendant des données (couleur de chaque domaine), injectés dans le <head>. */
export function renderSiteHead(): string {
  const rules = skillDomains.map((d) => `.dom-${esc(d.id)}{--dom:${/^#[0-9a-f]{3,8}$/i.test(d.color) ? d.color : 'currentColor'}}`);
  return `<style>${rules.join('')}</style>`;
}

export function renderSite(): string {
  return tidy(
    [renderPost(), renderHeader(), renderRail(), '<main id="contenu" tabindex="-1">', renderHero(), renderAbout(), renderProjects(), renderSkills(), renderContact(), renderDoor(), '</main>', renderFooter(), '<div class="toast" role="status" aria-live="polite" aria-atomic="true"></div>'].join('\n'),
  );
}

// ── en-tête de section ─────────────────────────────────────────────────────
function head(id: SectionId, lede?: string): string {
  const s = sec(id);
  return `
  <div class="sec-head">
    <span class="scan" aria-hidden="true"></span>
    <p class="sec-meta" aria-hidden="true"><span class="scr">${s.n}/${TOTAL}</span><span class="scr">${esc(s.tag)}</span><span class="scr">${s.range}</span></p>
    <h2 id="h-${s.id}" class="sec-title" tabindex="-1">${split('title' in s ? s.title : s.label)}</h2>
    ${lede ? `<p class="sec-lede">${lede}</p>` : ''}
  </div>`;
}

const sectionAttrs = (id: SectionId) => {
  const s = sec(id);
  const dark = id === 'accueil' || id === 'acces' ? ' zone-dark' : '';
  return `id="${s.id}" class="sec sec-${s.id}${dark}" aria-labelledby="h-${s.id}" data-n="${s.n}" data-label="${esc(s.label)}" data-u="${s.u[0]}"`;
};

// ── préchargement (POST) ───────────────────────────────────────────────────
// Visible seulement si le petit script du <head> a ajouté `.post` (première visite, JS actif).
function renderPost(): string {
  const lines = [
    `Allée A ··· ${stats.projects} baies`,
    `Allée B ··· ${stats.domains} baies`,
    `Brassage ··· ${stats.skills} ports`,
    `Services en ligne ··· ${stats.online}`,
  ];
  return `
<div class="post-screen" aria-hidden="true">
  <div class="post-in">
    <p class="post-h"><span>DC-01</span><span>POST</span></p>
    <ol class="post-log">
      ${lines.map((l) => `<li><span class="ok">[ OK ]</span> ${esc(l)}</li>`).join('')}
      <li class="post-boot">Démarrage de ${esc(host)}<span class="blink">_</span></li>
    </ol>
    <p class="post-skip">Entrée pour passer</p>
  </div>
</div>`;
}

// ── header ─────────────────────────────────────────────────────────────────
function renderHeader(): string {
  const nav = SECTIONS.slice(1, 5)
    .map((s) => `<li><a href="#${s.id}" data-nav="${s.id}">${esc(s.label)}</a></li>`)
    .join('');
  return `
<a class="skip-link" href="#contenu">Aller au contenu</a>
<header class="hd">
  <a class="hd-brand" href="#accueil"><span class="hd-tag">DC-01</span><span class="hd-name">${esc(profile.name)}</span></a>
  <p class="hd-where" aria-hidden="true"><span class="led led-ok"></span><span class="hd-roll"><span class="hd-n">01</span></span><span class="hd-t">/${TOTAL}</span><span class="hd-sep">—</span><span class="hd-roll"><span class="hd-l">Accueil</span></span></p>
  <button class="hd-menu" type="button" aria-expanded="false" aria-controls="hd-nav"><span class="hd-burger" aria-hidden="true"><i></i><i></i></span>Menu</button>
  <nav id="hd-nav" class="hd-nav" aria-label="Navigation principale">
    <ul>${nav}</ul>
    <ul class="hd-aux">
      <li><a class="hd-cv" href="./cv/">CV</a></li>
      <li class="needs-webgl"><a class="hd-3d" href="./3d/?choix=3d">3D<span class="sr-only"> : salle serveur</span><span class="arr" aria-hidden="true">→</span></a></li>
      <li class="hd-motion-li"><button class="hd-motion" type="button" aria-pressed="false"><span class="led" aria-hidden="true"></span><span class="hd-motion-t">Animations</span><span class="sr-only"> : mettre en pause</span></button></li>
    </ul>
  </nav>
</header>`;
}

// ── rail de baie (décoratif : la navigation porte déjà l'info) ─────────────
function renderRail(): string {
  const tops = new Set<number>(SECTIONS.map((s) => s.u[0]));
  const ticks = Array.from({ length: 42 }, (_, k) => {
    const u = 42 - k;
    const t = tops.has(u);
    return `<i${t ? ' class="top"' : ''}>${u % 6 === 0 || u === 1 ? `<s>${pad2(u)}</s>` : ''}</i>`;
  }).join('');
  return `
<div class="rail" aria-hidden="true">
  <div class="rail-scale">${ticks}</div>
  <div class="rail-mark"><span class="rail-u">U42</span></div>
</div>`;
}

// ── 01 · hero ──────────────────────────────────────────────────────────────
function renderHero(): string {
  const s = sec('accueil');
  const [first, ...rest] = profile.name.split(/\s+/);
  const spec = [
    ['Rôle', profile.role],
    ['Profil', profile.headline],
    ...(profile.location ? [['Localisation', profile.location]] : []),
  ];
  const marquee = [
    ...projects.map((p) => `<span class="mq-i"><span class="led led-${p.status}"></span>${esc(p.hostname)}<em>${STATUS[p.status]}</em></span>`),
    ...skillDomains.map((d) => `<span class="mq-i"><span class="led led-dom dom-${esc(d.id)}"></span>${esc(d.hostname)}<em>${d.skills.length} ports</em></span>`),
  ].join('');
  const index = SECTIONS.slice(1)
    .map((x, i) => `<li><a href="#${x.id}"><span class="ix-n" aria-hidden="true">${pad2(i + 2)}</span><span class="ix-l">${esc(x.label)}</span><span class="ix-u" aria-hidden="true">U${pad2(x.u[0])}</span></a></li>`)
    .join('');

  return `
<section ${sectionAttrs('accueil')} >
  <div class="hero-bg" aria-hidden="true"><canvas class="hero-wall"></canvas><span class="hero-shade"></span></div>
  <div class="hero-in">
    <p class="statusbar hx">
      <span class="sb-k">DC-01</span>
      <span class="sb-i"><span class="led led-ok" aria-hidden="true"></span>${stats.online} service${stats.online > 1 ? 's' : ''} en ligne</span>
      <span class="sb-i sb-clock" hidden>Heure locale <span class="clock">--:--:--</span></span>
    </p>
    <p id="notice" class="notice" role="status" hidden></p>
    <div class="hero-main">
      <p class="hero-meta hx" aria-hidden="true"><span class="scr">${s.n}/${TOTAL}</span><span class="scr">${s.range}</span><span class="scr">${esc(host)}</span></p>
      <h1 id="h-accueil" class="hero-name">
        <span class="sr-only">${esc(profile.name)}</span>
        <span class="split" aria-hidden="true"><span class="hn-l">${splitChars(first)}</span><span class="hn-l">${splitChars(rest.join(' '))}</span></span>
        <span class="hero-scan" aria-hidden="true"></span>
      </h1>
      <div class="hero-foot hx">
        <dl class="spec">${spec.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <nav class="hero-index" aria-label="Sommaire"><ol>${index}</ol></nav>
      </div>
    </div>
  </div>
  <div class="marquee hx" aria-hidden="true"><div class="mq-track"><div class="mq-run">${marquee}</div><div class="mq-run">${marquee}</div></div></div>
</section>`;
}

// ── 02 · à propos = NOC ────────────────────────────────────────────────────
function renderAbout(): string {
  const [lead, ...paras] = profile.about;
  const metrics = [
    ['Services en ligne', stats.online],
    ['Projets', stats.deployed],
    ['Compétences', stats.skills],
    ['Domaines', stats.domains],
  ] as const;
  return `
<section ${sectionAttrs('a-propos')}>
  <div class="wrap">
    ${head('a-propos')}
    <div class="noc-grid">
      <div class="noc-about">
        ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
        ${paras.map((p) => `<p>${esc(p)}</p>`).join('')}
      </div>
      <div class="term">
        <p class="term-bar" aria-hidden="true"><span>tty1</span><span>${esc(prompt.slice(0, -3))} ~</span><span class="term-dots"><i></i><i></i><i></i></span></p>
        <div class="term-body">
          <p class="tl"><span class="pr" aria-hidden="true">${esc(prompt)}</span> <span class="cmd">whoami</span></p>
          <p class="out">${esc(profile.name)}</p>
          <p class="tl"><span class="pr" aria-hidden="true">${esc(prompt)}</span> <span class="cmd">cat profil.txt</span></p>
          <p class="out">${esc(profile.role)}</p>
          <p class="out">${esc(profile.headline)}</p>
          <p class="tl tl-end" aria-hidden="true"><span class="pr">${esc(prompt)}</span> <span class="caret"></span></p>
        </div>
      </div>
    </div>
    <dl class="facts">
      ${profile.facts
        .map(
          (f, i) => `
      <div class="fact">
        <dt><span class="fact-id" aria-hidden="true">F-${pad2(i + 1)}<span class="led led-ok"></span></span>${scr(f.label)}</dt>
        <dd>${esc(f.value)}</dd>
      </div>`,
        )
        .join('')}
    </dl>
    <div class="noc-row">
      <dl class="metrics">
        ${metrics
          .map(
            ([k, v]) => `
        <div class="metric">
          <dt>${esc(k)}</dt>
          <dd><span class="sr-only">${v}</span><span class="count" data-to="${v}" aria-hidden="true">${pad2(v)}</span></dd>
        </div>`,
          )
          .join('')}
      </dl>
      <figure class="topo">
        ${topology('d')}
        ${topology('m')}
        <figcaption class="topo-cap" aria-hidden="true"><span>Topologie</span><span>dc-01 · ${stats.domains + stats.projects} liens</span></figcaption>
      </figure>
    </div>
  </div>
</section>`;
}

/** Arrondit les angles d'une ligne brisée orthogonale. */
function roundPath(pts: [number, number][], r = 10): string {
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
    const ax = x1 - ((x1 - x0) / l1) * k;
    const ay = y1 - ((y1 - y0) / l1) * k;
    const bx = x1 + ((x2 - x1) / l2) * k;
    const by = y1 + ((y2 - y1) / l2) * k;
    d += ` L${+ax.toFixed(1)} ${+ay.toFixed(1)} Q${x1} ${y1} ${+bx.toFixed(1)} ${+by.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0]} ${last[1]}`;
}

interface Node {
  host: string;
  sub: string;
  kind: 'dom' | 'online' | 'building' | 'slot';
  dom?: string;
}

/** Topologie réseau : dc-01 relié aux domaines (allée B) et aux projets (allée A). Deux variantes : large et mobile. */
function topology(v: 'd' | 'm'): string {
  const doms: Node[] = skillDomains.map((d) => ({ host: d.hostname, sub: d.title, kind: 'dom', dom: d.id }));
  const projs: Node[] = projects.map((p) => ({ host: p.hostname, sub: STATUS[p.status], kind: p.status }));
  const all = [...doms, ...projs];
  const title = `Topologie : dc-01 relié aux domaines ${doms.map((n) => `${n.host} (${n.sub})`).join(', ')} et aux projets ${projs.map((n) => `${n.host} (${n.sub})`).join(', ')}.`;
  const links: string[] = [];
  const boxes: string[] = [];

  const box = (n: Node, x: number, y: number, w: number, h: number) => {
    const cls = n.kind === 'dom' ? `n-dom dom-${esc(n.dom!)}` : `n-${n.kind}`;
    boxes.push(`
      <g class="node ${cls}">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>
        <rect class="n-led" x="${x + 12}" y="${y + h / 2 - 3}" width="6" height="6" rx="1"/>
        <text x="${x + 28}" y="${y + h / 2 - 3}">${esc(n.host)}</text>
        <text class="n-sub" x="${x + 28}" y="${y + h / 2 + 12}">${esc(n.sub)}</text>
      </g>`);
  };
  const link = (pts: [number, number][], n: Node) => {
    const live = n.kind !== 'slot';
    links.push(`<path class="lk${live ? '' : ' lk-off'}" d="${roundPath(pts)}"${live ? ` data-pts="${pts.map((p) => p.join(',')).join(' ')}"` : ''}/>`);
  };

  let vb: string;
  let core: string;
  if (v === 'd') {
    const W = 920;
    const H = Math.max(380, Math.max(doms.length, projs.length) * 68 + 40);
    const cy = H / 2;
    const bw = 210;
    const bh = 46;
    vb = `0 0 ${W} ${H}`;
    const place = (list: Node[], side: -1 | 1) => {
      const gap = 68;
      list.forEach((n, i) => {
        const y = cy + (i - (list.length - 1) / 2) * gap;
        const off = (i - (list.length - 1) / 2) * 6;
        const x0 = side < 0 ? W / 2 - 80 : W / 2 + 80;
        const mid = side < 0 ? Math.round((16 + bw + W / 2 - 80) / 2) : Math.round((W - 16 - bw + W / 2 + 80) / 2);
        const xe = side < 0 ? 16 + bw : W - 16 - bw;
        link([[x0, cy + off], [mid, cy + off], [mid, y], [xe, y]], n);
        box(n, side < 0 ? 16 : W - 16 - bw, y - bh / 2, bw, bh);
      });
    };
    place(doms, -1);
    place(projs, 1);
    const cx = W / 2 - 80;
    core = `<g class="node n-core"><rect x="${cx}" y="${cy - 34}" width="160" height="68" rx="2"/><rect class="n-led" x="${cx + 12}" y="${cy - 3}" width="6" height="6" rx="1"/><text x="${cx + 26}" y="${cy - 4}">dc-01</text><text class="n-sub" x="${cx + 26}" y="${cy + 14}">${esc(host)}</text></g>`;
  } else {
    const W = 360;
    const top = 20;
    const step = 58;
    const y0 = 112;
    const H = y0 + (all.length - 1) * step + 40;
    vb = `0 0 ${W} ${H}`;
    all.forEach((n, i) => {
      const y = y0 + i * step;
      link([[36, top + 58], [36, y], [80, y]], n);
      box(n, 80, y - 21, 260, 42);
    });
    core = `<g class="node n-core"><rect x="16" y="${top}" width="230" height="58" rx="2"/><rect class="n-led" x="30" y="${top + 26}" width="6" height="6" rx="1"/><text x="46" y="${top + 25}">dc-01</text><text class="n-sub" x="46" y="${top + 42}">${esc(host)}</text></g>`;
  }
  return `<svg class="topo-svg topo-${v}" viewBox="${vb}" role="img" aria-labelledby="topo-t-${v}"><title id="topo-t-${v}">${esc(title)}</title><g class="links">${links.join('')}</g><g class="packets"></g>${boxes.join('')}${core}</svg>`;
}

// ── 03 · projets = allée A ─────────────────────────────────────────────────
function blade(p: Project, i: number): string {
  const c = code('A', i);
  const id = esc(p.id);
  if (p.status === 'slot') {
    return `
      <li class="bay bay-slot" id="${id}">
        <article class="blade blade-slot" aria-labelledby="t-${id}">
          <p class="blade-top"><span class="blade-code">${c}</span><span class="blade-host">${esc(p.hostname)}</span></p>
          <div class="blade-face" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <p class="status status-slot"><span class="led" aria-hidden="true"></span>${STATUS.slot}</p>
          <h3 id="t-${id}" class="blade-title">${esc(p.title)}</h3>
          <p class="blade-tag">${esc(p.description)}</p>
        </article>
      </li>`;
  }
  const meta = [p.context, p.year].filter(Boolean).map((s) => esc(s!)).join(' · ');
  return `
      <li class="bay" id="${id}">
        <article class="blade blade-${p.status}" aria-labelledby="t-${id}">
          <p class="blade-top"><span class="blade-code">${c}</span><span class="blade-host">${esc(p.hostname)}</span></p>
          <div class="blade-vent" aria-hidden="true"></div>
          <p class="status status-${p.status}"><span class="led" aria-hidden="true"></span>${STATUS[p.status]}</p>
          <h3 id="t-${id}" class="blade-title">${esc(p.title)}</h3>
          <p class="blade-tag">${esc(p.tagline)}</p>
          ${meta ? `<p class="blade-meta">${meta}</p>` : ''}
          ${p.stack.length ? `<ul class="tags" aria-label="Stack">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
          <button class="blade-open" type="button" aria-haspopup="dialog" data-open="${id}">Ouvrir la fiche<span class="sr-only"> ${esc(p.title)}</span><span class="arr" aria-hidden="true">→</span></button>
          <div class="blade-detail" id="d-${id}">
            ${p.description
              .split(/\n\s*\n/)
              .map((d) => `<p>${esc(d.trim())}</p>`)
              .join('')}
            ${p.highlights?.length ? `<h4>Points clés</h4><ul class="list">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
            ${p.links.length ? `<h4>Liens</h4><ul class="links">${p.links.map((l) => `<li>${ext(l)}</li>`).join('')}</ul>` : ''}
          </div>
        </article>
      </li>`;
}

function renderProjects(): string {
  const lede = `${stats.projects} baies · ${stats.deployed} en service${stats.slots ? ` · ${stats.slots} emplacement${stats.slots > 1 ? 's' : ''} libre${stats.slots > 1 ? 's' : ''}` : ''}`;
  return `
<section ${sectionAttrs('projets')}>
  <div class="wrap">${head('projets', esc(lede))}</div>
  <div class="aisle">
    <div class="aisle-view">
      <p class="aisle-cap" aria-hidden="true"><span>Allée A</span><span class="aisle-bar"><i></i></span><span>${code('A', 0)} → ${code('A', projects.length - 1)}</span></p>
      <ol class="rack">${projects.map(blade).join('')}</ol>
    </div>
  </div>
</section>`;
}

// ── 04 · compétences = panneau de brassage ─────────────────────────────────
function domain(d: SkillDomain, i: number): string {
  const id = esc(d.id);
  return `
    <section class="dom dom-${id}" aria-labelledby="t-${id}" data-dom="${id}">
      <div class="dom-head">
        <p class="dom-top" aria-hidden="true"><span>${code('B', i)}</span><span>${d.skills.length} ports</span></p>
        <h3 id="t-${id}" class="dom-title">${esc(d.title)}</h3>
        <p class="dom-host">${esc(d.hostname)}</p>
        <p class="dom-sum">${esc(d.summary)}</p>
        <p class="dom-uplink" aria-hidden="true">${d.skills.map(() => '<i></i>').join('')}</p>
      </div>
      <ul class="ports">
        ${d.skills
          .map(
            (s, k) => `
        <li class="port port-${s.level}">
          <span class="rj" aria-hidden="true"></span>
          <span class="port-n" aria-hidden="true">P${pad2(k + 1)}</span>
          <span class="port-name">${esc(s.name)}${s.note ? ` <span class="port-note">— ${esc(s.note)}</span>` : ''}</span>
          <span class="port-lvl"><span class="led" aria-hidden="true"></span><span class="sr-only">Niveau : </span>${esc(levelLabel[s.level])}</span>
        </li>`,
          )
          .join('')}
      </ul>
      <svg class="cables" aria-hidden="true" focusable="false"></svg>
    </section>`;
}

function renderSkills(): string {
  const legend = LEVELS.map((l) => `<li class="port-${l}"><span class="led" aria-hidden="true"></span>${esc(levelLabel[l])}</li>`).join('');
  return `
<section ${sectionAttrs('competences')}>
  <div class="wrap">
    ${head('competences', `${stats.skills} ports sur ${stats.domains} baies. Le niveau est écrit en toutes lettres sur chaque port.`)}
    <ul class="legend" aria-label="Niveaux">${legend}</ul>
    <div class="patch">${skillDomains.map(domain).join('')}</div>
  </div>
</section>`;
}

// ── 05 · contact = ticket ──────────────────────────────────────────────────
function renderContact(): string {
  const rows: string[] = [];
  rows.push(`<div class="tk-row"><dt>Destinataire</dt><dd>${esc(profile.name)}</dd></div>`);
  if (profile.email) {
    rows.push(
      `<div class="tk-row"><dt>E-mail</dt><dd><a class="tk-mail" href="mailto:${esc(profile.email)}">${esc(profile.email)}</a><button class="copy" type="button" data-copy="${esc(profile.email)}">Copier l'e-mail</button></dd></div>`,
    );
  }
  for (const l of profile.links) rows.push(`<div class="tk-row"><dt>${esc(l.label)}</dt><dd>${ext(l, prettyUrl(l.url))}</dd></div>`);
  rows.push(`<div class="tk-row"><dt>CV</dt><dd><a href="./cv/">Consulter le CV<span class="arr" aria-hidden="true">→</span></a></dd></div>`);

  return `
<section ${sectionAttrs('contact')}>
  <div class="wrap">
    ${head('contact')}
    <div class="ticket">
      <p class="tk-head" aria-hidden="true"><span>Ticket</span><span>Nouveau</span><span class="led led-ok"></span></p>
      <dl class="tk-fields">${rows.join('')}</dl>
      ${profile.email ? `<p class="tk-act"><a class="btn btn-solid mag" href="mailto:${esc(profile.email)}">Ouvrir un ticket par e-mail<span class="arr" aria-hidden="true">→</span></a></p>` : ''}
      <span class="tk-perf" aria-hidden="true"></span>
    </div>
  </div>
</section>`;
}

// ── 06 · le sas ────────────────────────────────────────────────────────────
function renderDoor(): string {
  const leaf = (side: 'l' | 'r') => `
          <span class="leaf leaf-${side}">
            <span class="leaf-plate">${side === 'l' ? 'SAS 01' : 'ZONE RESTREINTE'}</span>
            <span class="leaf-win"></span>
            <span class="leaf-bars"><i></i><i></i><i></i></span>
            <span class="leaf-rivets"></span>
          </span>`;
  return `
<section ${sectionAttrs('acces')}>
  <div class="wrap">
    ${head('acces', 'La salle serveur en 3D : pilote le robot de maintenance entre les baies.')}
    <div class="door-wrap">
      <a class="door" href="./3d/?choix=3d">
        <span class="door-label">Entrer dans la salle serveur<span class="sr-only"> (version 3D)</span><span class="arr" aria-hidden="true">→</span></span>
        <span class="door-frame" aria-hidden="true">
          <span class="hazard hazard-t"></span>
          <span class="door-gap">
            <span class="door-room"></span>
            <span class="door-glow"></span>
            ${leaf('l')}
            ${leaf('r')}
          </span>
          <span class="hazard hazard-b"></span>
        </span>
        <span class="reader" aria-hidden="true">
          <span class="reader-led"></span>
          <span class="reader-s reader-wait">En attente de badge</span>
          <span class="reader-s reader-ok">Badge accepté</span>
          <span class="reader-s reader-off">Accès indisponible</span>
          <span class="reader-slot"></span>
        </span>
      </a>
      <p class="door-off" role="note">La salle 3D a besoin de WebGL 2, indisponible sur cet appareil : la porte reste fermée. Tout le contenu est sur cette page.</p>
    </div>
  </div>
</section>`;
}

function renderFooter(): string {
  return `
<footer class="ft">
  <div class="wrap ft-in">
    <p>© 2026 ${esc(profile.name)}</p>
    <ul class="ft-links">
      <li><a href="./cv/">CV</a></li>
      ${profile.links.map((l) => `<li>${ext(l)}</li>`).join('')}
      <li><a href="#accueil">Haut de page<span class="arr" aria-hidden="true">↑</span></a></li>
    </ul>
    <p class="ft-u" aria-hidden="true">DC-01 · U01</p>
  </div>
</footer>`;
}
