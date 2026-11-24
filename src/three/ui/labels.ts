import * as THREE from 'three';
import type { Item } from '../world/layout';
import { RACK } from '../world/layout';

/** Étiquettes flottantes au-dessus des baies (purement visuelles, aria-hidden). */
export class Labels {
  /** Dernières valeurs écrites : on ne touche au style que si quelque chose change. */
  private readonly entries: { item: Item; el: HTMLElement; pos: THREE.Vector3; op: string; tf: string; far: boolean | null }[] = [];
  private readonly v = new THREE.Vector3();

  constructor(items: Item[], container: HTMLElement) {
    for (const item of items) {
      const el = document.createElement('div');
      el.className = `rack-label rack-label--${item.kind}`;
      el.dataset.status = item.project?.status ?? item.kind;
      el.innerHTML = `<span class="rl-code"></span><span class="rl-name"></span>`;
      el.querySelector('.rl-code')!.textContent = item.code;
      el.querySelector('.rl-name')!.textContent = item.label;
      container.appendChild(el);
      const y = item.kind === 'about' ? 3.35 : item.kind === 'cv' ? 2.55 : RACK.h + 0.38;
      this.entries.push({ item, el, pos: new THREE.Vector3(item.fx, y, item.fz), op: '', tf: '', far: null });
    }
  }

  markVisited(id: string) {
    this.entries.find((e) => e.item.id === id)?.el.classList.add('is-visited');
  }

  update(camera: THREE.Camera, robot: THREE.Vector3, activeId: string | null, w: number, h: number, power: number) {
    for (const e of this.entries) {
      this.v.copy(e.pos).project(camera);
      const behind = this.v.z > 1;
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      const d = Math.hypot(robot.x - e.item.x, robot.z - e.item.z);
      const near = Math.max(0, Math.min(1, 1.2 - d / 9));
      const op = behind || e.item.id === activeId ? 0 : (0.4 + near * 0.6) * power;
      // pas de 0,05 : chaque changement relance la transition CSS de 0,25 s, qui lisse déjà
      const o = (Math.round(op * 20) / 20).toFixed(2);
      if (o !== e.op) e.el.style.opacity = e.op = o;
      const far = d > 2.6;
      if (far !== e.far) e.el.classList.toggle('is-far', (e.far = far));
      const tf = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      if (tf !== e.tf) e.el.style.transform = e.tf = tf;
    }
  }
}
