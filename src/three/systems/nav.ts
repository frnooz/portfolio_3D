import type { Physics } from './physics';

/**
 * Pathfinding A* sur une grille de 25 cm, précalculée une fois à partir des collisions.
 * Le chemin est ensuite « tendu » (string pulling) pour que le robot coupe les virages
 * comme un vrai petit robot pressé.
 */
export class NavGrid {
  private readonly cell = 0.25;
  private readonly cols: number;
  private readonly rows: number;
  private readonly ox: number;
  private readonly oz: number;
  private readonly blocked: Uint8Array;

  constructor(physics: Physics, radius: number) {
    const b = physics.bounds;
    this.ox = b.minX;
    this.oz = b.minZ;
    this.cols = Math.ceil((b.maxX - b.minX) / this.cell);
    this.rows = Math.ceil((b.maxZ - b.minZ) / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const [x, z] = this.center(c, r);
        this.blocked[r * this.cols + c] = physics.blocked(x, z, radius + 0.06) ? 1 : 0;
      }
    }
  }

  private center(c: number, r: number): [number, number] {
    return [this.ox + (c + 0.5) * this.cell, this.oz + (r + 0.5) * this.cell];
  }

  private toCell(x: number, z: number): [number, number] {
    return [
      Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.ox) / this.cell))),
      Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.oz) / this.cell))),
    ];
  }

  private free(c: number, r: number) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && !this.blocked[r * this.cols + c];
  }

  /** Cellule libre la plus proche (recherche en spirale). */
  private nearestFree(c: number, r: number): [number, number] | null {
    if (this.free(c, r)) return [c, r];
    for (let rad = 1; rad < 24; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          if (this.free(c + dc, r + dr)) return [c + dc, r + dr];
        }
      }
    }
    return null;
  }

  isFree(x: number, z: number) {
    const [c, r] = this.toCell(x, z);
    return this.free(c, r);
  }

  /** Ligne de vue entre deux points (échantillonnage tous les 10 cm). */
  private sight(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.1);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!this.isFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  find(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[] | null {
    const s = this.nearestFree(...this.toCell(fromX, fromZ));
    const g = this.nearestFree(...this.toCell(toX, toZ));
    if (!s || !g) return null;
    const N = this.cols * this.rows;
    const start = s[1] * this.cols + s[0];
    const goal = g[1] * this.cols + g[0];
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap: [number, number][] = []; // [f, index]
    const push = (f: number, i: number) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const h = (i: number) => {
      const c = i % this.cols;
      const r = (i / this.cols) | 0;
      const dx = Math.abs(c - g[0]);
      const dz = Math.abs(r - g[1]);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    gScore[start] = 0;
    push(h(start), start);
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
    ];
    let found = false;
    while (heap.length) {
      const [, cur] = pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const c = cur % this.cols;
      const r = (cur / this.cols) | 0;
      for (const [dc, dr, cost] of dirs) {
        const nc = c + dc;
        const nr = r + dr;
        if (!this.free(nc, nr)) continue;
        if (dc && dr && (!this.free(c + dc, r) || !this.free(c, r + dr))) continue; // pas de coin coupé
        const ni = nr * this.cols + nc;
        const ng = gScore[cur] + cost;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          push(ng + h(ni), ni);
        }
      }
    }
    if (!found) return null;

    const raw: { x: number; z: number }[] = [];
    for (let i = goal; i !== -1; i = came[i]) {
      const [x, z] = this.center(i % this.cols, (i / this.cols) | 0);
      raw.push({ x, z });
    }
    raw.reverse();
    raw[raw.length - 1] = { x: toX, z: toZ };

    // string pulling
    const out: { x: number; z: number }[] = [];
    let anchor = { x: fromX, z: fromZ };
    let i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      while (j > i && !this.sight(anchor.x, anchor.z, raw[j].x, raw[j].z)) j--;
      out.push(raw[j]);
      anchor = raw[j];
      i = j + 1;
    }
    return out;
  }
}
