/**
 * Briques communes du rendu statique (exécuté par Vite au build, côté Node).
 * Rien ici n'invente de contenu : tout vient de `src/data/`.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { profile } from '../data/profile.ts';
import { projects } from '../data/projects.ts';
import { skillDomains } from '../data/skills.ts';
import type { ProjectLink, ProjectStatus } from '../data/types.ts';
import { esc } from '../shared/html.ts';

export { esc };

/** Supprime les espaces de fin de ligne et les lignes vides (sortie HTML compacte et stable). */
export const tidy = (html: string): string => html.replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n');

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const STATUS: Record<ProjectStatus, string> = {
  online: 'En ligne',
  building: 'En cours',
  slot: 'Slot libre',
};

/** Chiffres calculés depuis les données (jamais saisis à la main). */
export const stats = {
  projects: projects.length,
  deployed: projects.filter((p) => p.status !== 'slot').length,
  online: projects.filter((p) => p.status === 'online').length,
  slots: projects.filter((p) => p.status === 'slot').length,
  domains: skillDomains.length,
  skills: skillDomains.reduce((n, d) => n + d.skills.length, 0),
};

/** Code d'inventaire : A-01 (projets), B-01 (domaines). */
export const code = (aisle: 'A' | 'B', i: number): string => `${aisle}-${pad2(i + 1)}`;

/** Lien externe : nouvel onglet annoncé aux lecteurs d'écran. */
export const ext = (l: ProjectLink, text = l.label, cls = ''): string =>
  `<a${cls ? ` class="${cls}"` : ''} href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(text)}<span class="sr-only"> (nouvel onglet)</span><span class="arr" aria-hidden="true">↗</span></a>`;

/** URL lisible : `https://github.com/frnooz` → `github.com/frnooz`. */
export const prettyUrl = (url: string): string => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** Poids du CV (lu sur le disque au build). */
export function cvInfo(): { bytes: number; label: string; short: string } {
  const file = resolve(import.meta.dirname, '../../public', profile.cv.path);
  if (!existsSync(file)) return { bytes: 0, label: 'PDF', short: '—' };
  const bytes = statSync(file).size;
  const kb = bytes / 1024;
  const size = kb < 1024 ? `${Math.max(1, Math.round(kb))} Ko` : `${(kb / 1024).toFixed(1).replace('.', ',')} Mo`;
  const short = kb < 1024 ? `${Math.max(1, Math.round(kb))}K` : `${(kb / 1024).toFixed(1)}M`;
  return { bytes, label: `PDF, ${size}`, short };
}

// ── texte découpé pour les révélations ─────────────────────────────────────
// Le vrai texte est en `.sr-only` (lu une seule fois), la version découpée est `aria-hidden`.
// Chaque caractère porte un glyphe de « déchiffrement » tiré au hasard, mais de façon déterministe
// (même build → même HTML).
const GLYPHS = '#%&*+/<=>?@[]{}01ABCDEFHKMNRSTXZ$';
let seed = 7;
const rnd = (): number => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const glyph = (): string => GLYPHS[Math.floor(rnd() * GLYPHS.length)];

/** Découpe un texte en mots puis en caractères. */
export function splitChars(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (w) =>
        `<span class="w">${[...w].map((c) => `<span class="c" data-g="${esc(glyph())}">${esc(c)}</span>`).join('')}</span>`,
    )
    .join(' ');
}

/** Titre accessible + calque visuel découpé. */
export const split = (text: string): string =>
  `<span class="sr-only">${esc(text)}</span><span class="split" aria-hidden="true">${splitChars(text)}</span>`;

/** Étiquette mono « déchiffrable » : le calque animé est masqué aux lecteurs d'écran. */
export const scr = (text: string): string =>
  `<span class="sr-only">${esc(text)}</span><span class="scr" aria-hidden="true">${esc(text)}</span>`;
