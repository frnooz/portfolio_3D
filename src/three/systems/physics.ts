import type { Vector3 } from 'three';

/** Boîte alignée sur les axes, sur le plan du sol (XZ). */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function boxFromCenter(x: number, z: number, w: number, d: number): Box {
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

/**
 * Physique ultra-légère : le robot est un cercle, le décor des boîtes.
 * Résolution par projection + suppression de la composante normale de la vitesse
 * → le robot glisse le long des baies au lieu de se bloquer net.
 */
export class Physics {
  readonly boxes: Box[] = [];

  constructor(public bounds: Box) {}

  add(box: Box): Box {
    this.boxes.push(box);
    return box;
  }

  /** Retourne l'intensité de l'impact (vitesse normale absorbée), utile pour le feedback. */
  resolve(pos: Vector3, vel: Vector3, r: number): number {
    let impact = 0;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        const cx = pos.x < b.minX ? b.minX : pos.x > b.maxX ? b.maxX : pos.x;
        const cz = pos.z < b.minZ ? b.minZ : pos.z > b.maxZ ? b.maxZ : pos.z;
        let nx = pos.x - cx;
        let nz = pos.z - cz;
        const d2 = nx * nx + nz * nz;
        if (d2 >= r * r) continue;
        let depth: number;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx /= d;
          nz /= d;
          depth = r - d;
        } else {
          // centre à l'intérieur : sortie par l'axe de moindre pénétration
          const pens = [
            [pos.x - b.minX + r, -1, 0],
            [b.maxX - pos.x + r, 1, 0],
            [pos.z - b.minZ + r, 0, -1],
            [b.maxZ - pos.z + r, 0, 1],
          ].sort((a, c) => a[0] - c[0])[0];
          depth = pens[0];
          nx = pens[1];
          nz = pens[2];
        }
        pos.x += nx * depth;
        pos.z += nz * depth;
        const vn = vel.x * nx + vel.z * nz;
        if (vn < 0) {
          vel.x -= vn * nx;
          vel.z -= vn * nz;
          impact = Math.max(impact, -vn);
        }
        moved = true;
      }
      if (!moved) break;
    }
    // murs de la salle
    const B = this.bounds;
    if (pos.x < B.minX + r) { pos.x = B.minX + r; impact = Math.max(impact, Math.abs(vel.x)); vel.x = Math.max(0, vel.x); }
    if (pos.x > B.maxX - r) { pos.x = B.maxX - r; impact = Math.max(impact, Math.abs(vel.x)); vel.x = Math.min(0, vel.x); }
    if (pos.z < B.minZ + r) { pos.z = B.minZ + r; impact = Math.max(impact, Math.abs(vel.z)); vel.z = Math.max(0, vel.z); }
    if (pos.z > B.maxZ - r) { pos.z = B.maxZ - r; impact = Math.max(impact, Math.abs(vel.z)); vel.z = Math.min(0, vel.z); }
    return impact;
  }

  /** Le cercle (x, z, r) touche-t-il un obstacle ? (utilisé par le pathfinding) */
  blocked(x: number, z: number, r: number): boolean {
    const B = this.bounds;
    if (x < B.minX + r || x > B.maxX - r || z < B.minZ + r || z > B.maxZ - r) return true;
    for (const b of this.boxes) {
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
}
