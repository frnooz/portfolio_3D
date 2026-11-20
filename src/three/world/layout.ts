import { projects } from '../../data/projects';
import { skillDomains } from '../../data/skills';
import type { Project, ProjectStatus, SkillDomain, SkillLevel } from '../../data/types';
import { hashString, rng } from '../core/math';

/**
 * Plan de la salle, calculé à partir des données.
 * Ajouter un projet dans `src/data/projects.ts` = une baie de plus, la salle s'élargit toute seule.
 *
 *   nord (-z)
 *   ┌──────────────── LEGACY (CV) ────────────────┐
 *   │            allée chaude (hot aisle)          │
 *   │  ▓▓ [P1] [P2] [P3] [P4] [P5] ▓▓  allée A     │
 *   │  ▓▓▓  [RÉSEAU] [CLOUD] [DEV]  ▓▓▓ allée B    │
 *   │              [ NOC / À propos ]              │
 *   └────────────────── entrée ───────────────────┘
 *   sud (+z) — la caméra regarde vers le nord
 */

export const RACK = { w: 1.1, d: 1.25, h: 2.3 } as const;
export const U = 0.092; // hauteur d'une unité de baie (stylisée)
const RACK_INNER_BOTTOM = 0.16;
const RACK_INNER_TOP = RACK.h - 0.14;

export const PROJECT_ROW_Z = -7.2;
export const SKILL_ROW_Z = -1.2;
export const NOC = { x: 0, z: 4.5, w: 3.8, d: 1.1 };
export const LEGACY = { x: 0, z: -11.7, w: 2.6, d: 1.3 };
export const SPAWN = { x: 0, z: 7.95 };

const PROJECT_SPACING = 1.55;
const SKILL_SPACING = 2.1;
const FILLER_SPACING = 1.16;

export type UnitStyle = 0 | 1 | 2 | 3 | 4; // serveur · stockage · switch · obturateur · onduleur
export interface Unit {
  y: number;
  h: number;
  style: UnitStyle;
  led: string;
  /** Les « tiroirs » qui glissent quand la baie s'ouvre. */
  slides: boolean;
}

export type RackKind = 'project' | 'skill' | 'filler';

export interface RackSpec {
  index: number;
  kind: RackKind;
  x: number;
  z: number;
  /** 0 → façade vers +z (sud). */
  rot: number;
  status: ProjectStatus | 'skill' | 'filler';
  /** Couleur de la barre de statut. */
  color: string;
  itemId?: string;
  code: string;
  units: Unit[];
}

export type ItemKind = 'project' | 'skill' | 'about' | 'cv';

export interface Item {
  id: string;
  kind: ItemKind;
  /** Code court affiché (ex : A-01). */
  code: string;
  label: string;
  /** Point où le robot doit se tenir. */
  x: number;
  z: number;
  /** Ce que la caméra / le robot regardent. */
  fx: number;
  fz: number;
  rackIndex?: number;
  project?: Project;
  domain?: SkillDomain;
}

export interface Layout {
  room: { minX: number; maxX: number; minZ: number; maxZ: number };
  racks: RackSpec[];
  items: Item[];
  /** Colonnes de brassage entre les baies projet. */
  managers: { x: number; z: number }[];
  rowHalf: number;
}

const STATUS_COLOR: Record<string, string> = {
  online: '#39e58c',
  building: '#ffb020',
  slot: '#ffb020',
  filler: '#2f6f8a',
};

export const LEVEL_COLOR: Record<SkillLevel, string> = {
  solide: '#39e58c',
  pratique: '#5ce1ff',
  apprentissage: '#ffb020',
};

/** Remplit une baie avec un mélange crédible de serveurs. */
function fillUnits(seed: number, density: number, led: string): Unit[] {
  const r = rng(seed);
  const units: Unit[] = [];
  let y = RACK_INNER_BOTTOM;
  // onduleur en bas
  if (r() < 0.6) {
    units.push({ y, h: U * 3, style: 4, led: '#5ce1ff', slides: false });
    y += U * 3 + 0.01;
  }
  while (y < RACK_INNER_TOP - U) {
    const roll = r();
    if (roll > density) {
      // trou → obturateur
      const h = U * (1 + Math.floor(r() * 2));
      if (y + h > RACK_INNER_TOP) break;
      units.push({ y, h, style: 3, led, slides: false });
      y += h + 0.004;
      continue;
    }
    const pick = r();
    const [style, n]: [UnitStyle, number] =
      pick < 0.45 ? [0, 1 + Math.floor(r() * 2)] : pick < 0.75 ? [1, 2 + Math.floor(r() * 3)] : [2, 1];
    const h = U * n;
    if (y + h > RACK_INNER_TOP) break;
    units.push({ y, h, style, led: style === 2 ? '#39e58c' : led, slides: style !== 2 });
    y += h + 0.004;
  }
  return units;
}

export function buildLayout(): Layout {
  const racks: RackSpec[] = [];
  const items: Item[] = [];
  const managers: { x: number; z: number }[] = [];

  // ── allée A : projets ────────────────────────────────────
  const n = projects.length;
  const projHalf = ((n - 1) / 2) * PROJECT_SPACING + RACK.w / 2;
  const skillHalf = ((skillDomains.length - 1) / 2) * SKILL_SPACING + RACK.w / 2;
  const coreHalf = Math.max(projHalf, skillHalf);
  const fillers = 2;
  const rowHalf = coreHalf + fillers * FILLER_SPACING;

  projects.forEach((p, i) => {
    const x = (i - (n - 1) / 2) * PROJECT_SPACING;
    const seed = hashString(p.id);
    const code = `A-${String(i + 1).padStart(2, '0')}`;
    const units =
      p.status === 'slot'
        ? [
            { y: RACK_INNER_BOTTOM, h: U * 2, style: 3 as UnitStyle, led: '#ffb020', slides: false },
            { y: RACK.h * 0.5, h: U, style: 3 as UnitStyle, led: '#ffb020', slides: false },
          ]
        : fillUnits(seed, 0.92, STATUS_COLOR[p.status]);
    const index = racks.length;
    racks.push({
      index, kind: 'project', x, z: PROJECT_ROW_Z, rot: 0,
      status: p.status, color: STATUS_COLOR[p.status], itemId: p.id, code, units,
    });
    items.push({
      id: p.id, kind: 'project', code, label: p.title,
      x, z: PROJECT_ROW_Z + RACK.d / 2 + 1.05, fx: x, fz: PROJECT_ROW_Z,
      rackIndex: index, project: p,
    });
    if (i < n - 1) managers.push({ x: x + PROJECT_SPACING / 2, z: PROJECT_ROW_Z });
  });

  // baies d'infra de part et d'autre (décor, non interactives)
  const addFillers = (rowZ: number, fromHalf: number, count: number, tag: string) => {
    for (const side of [-1, 1]) {
      for (let k = 0; k < count; k++) {
        const x = side * (fromHalf + 0.1 + RACK.w / 2 + k * FILLER_SPACING);
        const seed = hashString(`${tag}${side}${k}`);
        racks.push({
          index: racks.length, kind: 'filler', x, z: rowZ, rot: 0, status: 'filler',
          color: STATUS_COLOR.filler, code: `${tag}-${side < 0 ? 'W' : 'E'}${k + 1}`,
          units: fillUnits(seed, 0.8, '#2f9bc0'),
        });
      }
    }
  };
  addFillers(PROJECT_ROW_Z, projHalf, Math.round((rowHalf - projHalf) / FILLER_SPACING), 'INF');

  // ── allée B : compétences ────────────────────────────────
  const m = skillDomains.length;
  skillDomains.forEach((d, i) => {
    const x = (i - (m - 1) / 2) * SKILL_SPACING;
    const code = `B-${String(i + 1).padStart(2, '0')}`;
    const style: UnitStyle = d.id === 'reseau' ? 2 : d.id === 'cloud' ? 1 : 0;
    const units: Unit[] = [];
    let y = RACK_INNER_BOTTOM + U * 3 + 0.01;
    const per = Math.min(2, (RACK_INNER_TOP - y) / Math.max(1, d.skills.length) / U - 0.05);
    const h = U * Math.max(1, Math.floor(per));
    units.push({ y: RACK_INNER_BOTTOM, h: U * 3, style: 4, led: '#5ce1ff', slides: false });
    for (const s of d.skills) {
      if (y + h > RACK_INNER_TOP) break;
      units.push({ y, h, style, led: LEVEL_COLOR[s.level], slides: true });
      y += h + 0.006;
    }
    const index = racks.length;
    racks.push({
      index, kind: 'skill', x, z: SKILL_ROW_Z, rot: 0, status: 'skill',
      color: d.color, itemId: `skill-${d.id}`, code, units,
    });
    items.push({
      id: `skill-${d.id}`, kind: 'skill', code, label: d.title,
      x, z: SKILL_ROW_Z + RACK.d / 2 + 1.05, fx: x, fz: SKILL_ROW_Z,
      rackIndex: index, domain: d,
    });
  });
  addFillers(SKILL_ROW_Z, skillHalf, Math.round((rowHalf - skillHalf) / FILLER_SPACING), 'SRV');

  // ── poste de supervision & legacy ─────────────────────────
  items.push({
    id: 'a-propos', kind: 'about', code: 'NOC', label: 'À propos',
    x: NOC.x, z: NOC.z + NOC.d / 2 + 1.0, fx: NOC.x, fz: NOC.z,
  });
  items.push({
    id: 'cv', kind: 'cv', code: 'LEGACY', label: 'CV',
    x: LEGACY.x, z: LEGACY.z + LEGACY.d / 2 + 1.0, fx: LEGACY.x, fz: LEGACY.z,
  });

  const halfW = Math.max(10.5, rowHalf + 3.4);
  return {
    room: { minX: -halfW, maxX: halfW, minZ: -13.6, maxZ: 8.6 },
    racks,
    items,
    managers,
    rowHalf,
  };
}
