/**
 * Rendu HTML statique (exécuté par Vite au build, côté Node).
 * La version classique et l'index de l'accueil sont générés depuis `src/data/`,
 * exactement comme la salle 3D : une seule source de vérité.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { profile } from '../data/profile.ts';
import { projects } from '../data/projects.ts';
import { levelLabel, skillDomains } from '../data/skills.ts';
import type { ProjectLink, SkillLevel } from '../data/types.ts';
import { esc } from '../shared/html.ts';

const LEVELS: SkillLevel[] = ['solide', 'pratique', 'apprentissage'];
const STATUS: Record<string, string> = { online: 'En ligne', building: 'En cours', slot: 'Slot libre' };

const ext = (l: ProjectLink) =>
  `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}<span class="sr-only"> (nouvel onglet)</span><span aria-hidden="true"> ↗</span></a>`;

function cvSize(): string {
  const file = resolve(import.meta.dirname, '../../public', profile.cv.path);
  if (!existsSync(file)) return 'PDF';
  const kb = statSync(file).size / 1024;
  return `PDF, ${kb < 1024 ? `${Math.max(1, Math.round(kb))} Ko` : `${(kb / 1024).toFixed(1).replace('.', ',')} Mo`}`;
}

const tidy = (html: string) => html.replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n');

export function renderClassic(): string {
  return tidy(renderClassicRaw());
}

function renderClassicRaw(): string {
  const real = projects.filter((p) => p.status !== 'slot');
  const slots = projects.filter((p) => p.status === 'slot');

  const projectHtml = real
    .map((p) => {
      const i = projects.indexOf(p);
      const code = `A-${String(i + 1).padStart(2, '0')}`;
      const meta = [p.context, p.year].filter(Boolean).map((s) => esc(s!)).join(' · ');
      return `
      <article class="unit" id="${esc(p.id)}" aria-labelledby="t-${esc(p.id)}">
        <div class="unit-tag" aria-hidden="true"><span>${code}</span></div>
        <div class="unit-body">
          <p class="unit-host"><span class="status" data-status="${p.status}"><span class="led" aria-hidden="true"></span>${STATUS[p.status]}</span> <span class="host">${esc(p.hostname)}</span></p>
          <h3 id="t-${esc(p.id)}">${esc(p.title)}</h3>
          <p class="tagline">${esc(p.tagline)}</p>
          ${meta ? `<p class="meta">${meta}</p>` : ''}
          ${p.description
            .split(/\n\s*\n/)
            .map((d) => `<p>${esc(d.trim())}</p>`)
            .join('')}
          ${p.highlights?.length ? `<h4>Points clés</h4><ul class="list">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
          ${p.stack.length ? `<h4>Stack</h4><ul class="tags">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
          ${p.links.length ? `<p class="links">${p.links.map(ext).join(' ')}</p>` : ''}
        </div>
      </article>`;
    })
    .join('');

  const slotHtml = slots.length
    ? `<div class="slots">
        <h3 class="slots-title">Emplacements réservés</h3>
        <ul>${slots
          .map((p) => {
            const code = `A-${String(projects.indexOf(p) + 1).padStart(2, '0')}`;
            return `<li><span class="code">${code}</span> ${esc(p.title)} <span class="dim">— ${esc(p.hostname)}</span></li>`;
          })
          .join('')}</ul>
      </div>`
    : '';

  const skillHtml = skillDomains
    .map((d, i) => {
      const code = `B-${String(i + 1).padStart(2, '0')}`;
      const groups = LEVELS.map((lvl) => {
        const list = d.skills.filter((s) => s.level === lvl);
        if (!list.length) return '';
        return `<div class="lvl lvl-${lvl}"><h4><span class="led" aria-hidden="true"></span>${levelLabel[lvl]}</h4><ul>${list
          .map((s) => `<li>${esc(s.name)}${s.note ? ` <span class="dim">— ${esc(s.note)}</span>` : ''}</li>`)
          .join('')}</ul></div>`;
      }).join('');
      return `
      <section class="unit" id="competences-${esc(d.id)}" aria-labelledby="t-${esc(d.id)}">
        <div class="unit-tag" aria-hidden="true"><span>${code}</span></div>
        <div class="unit-body">
          <p class="unit-host"><span class="host">${esc(d.hostname)}</span></p>
          <h3 id="t-${esc(d.id)}">${esc(d.title)}</h3>
          <p class="tagline">${esc(d.summary)}</p>
          <div class="levels">${groups}</div>
        </div>
      </section>`;
    })
    .join('');

  return `
    <section id="a-propos" class="block" aria-labelledby="h-about">
      <h2 id="h-about"><span class="num" aria-hidden="true">01</span> À propos</h2>
      <div class="about">
        <div>
          <p class="lead">${esc(profile.role)}</p>
          ${profile.about.map((p) => `<p>${esc(p)}</p>`).join('')}
        </div>
        <dl class="facts">${profile.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>
      </div>
    </section>

    <section id="projets" class="block" aria-labelledby="h-projects">
      <h2 id="h-projects"><span class="num" aria-hidden="true">02</span> Projets</h2>
      ${projectHtml}
      ${slotHtml}
    </section>

    <section id="competences" class="block" aria-labelledby="h-skills">
      <h2 id="h-skills"><span class="num" aria-hidden="true">03</span> Compétences</h2>
      <p class="legend">Trois niveaux, indiqués en toutes lettres : <strong>solide</strong>, <strong>en pratique</strong>, <strong>en apprentissage</strong>.</p>
      ${skillHtml}
    </section>

    <section id="cv" class="block" aria-labelledby="h-cv">
      <h2 id="h-cv"><span class="num" aria-hidden="true">04</span> CV</h2>
      <p>Mon parcours complet sur une page, mis à jour en ${esc(profile.cv.updated)}.</p>
      <p><a class="btn" href="../${esc(profile.cv.path)}" download="${esc(profile.cv.fileName)}">Télécharger le CV <span class="dim">(${cvSize()})</span></a></p>
    </section>

    <section id="contact" class="block" aria-labelledby="h-contact">
      <h2 id="h-contact"><span class="num" aria-hidden="true">05</span> Contact</h2>
      <ul class="contact">
        ${profile.email ? `<li><a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a></li>` : ''}
        ${profile.links.map((l) => `<li>${ext(l)}</li>`).join('')}
      </ul>
    </section>`;
}

/** Index « contenu disponible » de la page d'accueil. */
export function renderHomeIndex(): string {
  return tidy(renderHomeIndexRaw());
}

function renderHomeIndexRaw(): string {
  const online = projects.filter((p) => p.status !== 'slot').length;
  const slots = projects.length - online;
  const rows = [
    {
      id: 'projets',
      label: 'Projets',
      meta: `${projects.length} baies · ${online} en service${slots ? `, ${slots} à venir` : ''}`,
      led: 'ok',
    },
    {
      id: 'competences',
      label: 'Compétences',
      meta: `${skillDomains.length} domaines · ${skillDomains.map((d) => d.title.toLowerCase()).join(', ')}`,
      led: 'info',
    },
    { id: 'a-propos', label: 'À propos', meta: 'poste de supervision', led: 'warn' },
  ];
  return rows
    .map(
      (r, i) => `
      <li class="port">
        <span class="port-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        <span class="port-led port-led--${r.led}" aria-hidden="true"></span>
        <span class="port-label">${r.label}</span>
        <span class="port-meta">${esc(r.meta)}</span>
        <span class="port-links">
          <a href="./3d/?choix=3d#${r.id}" class="needs-webgl" aria-label="${r.label} — dans la salle 3D">3D</a>
          <a href="./classique/#${r.id}" aria-label="${r.label} — version classique">2D</a>
        </span>
      </li>`,
    )
    .join('');
}
