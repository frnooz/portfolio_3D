import { esc } from '../../shared/html';
import type { Item, Layout } from '../world/layout';
import { LEGACY, NOC, RACK } from '../world/layout';

const ZONES: { kind: Item['kind']; title: string }[] = [
  { kind: 'about', title: 'Entrée — poste de supervision' },
  { kind: 'project', title: 'Allée A — Projets' },
  { kind: 'skill', title: 'Allée B — Compétences' },
  { kind: 'cv', title: 'Fond de salle — Legacy' },
];

/**
 * « Plan de salle » : une vraie liste de boutons (navigation clavier / lecteur d'écran)
 * + un plan SVG cliquable. Choisir une baie y envoie le robot en pilote automatique.
 */
export class RoomMap {
  private readonly dialog: HTMLDialogElement;
  private readonly robotDot: SVGCircleElement;
  private readonly sx: (x: number) => number;
  private readonly sz: (z: number) => number;
  onGo?: (id: string) => void;
  onToggle?: (open: boolean) => void;

  constructor(layout: Layout, items: Item[]) {
    this.dialog = document.getElementById('map') as HTMLDialogElement;
    const { minX, maxX, minZ, maxZ } = layout.room;
    const W = 320;
    const scale = W / (maxX - minX);
    const H = (maxZ - minZ) * scale;
    this.sx = (x) => (x - minX) * scale;
    this.sz = (z) => (z - minZ) * scale;

    const rects = layout.racks
      .map((r) => {
        const item = items.find((i) => i.id === r.itemId);
        const cls = item ? `m-rack m-${r.kind}${r.status === 'slot' ? ' m-slot' : ''}` : 'm-rack m-filler';
        return `<rect class="${cls}" ${item ? `data-goto="${item.id}"` : ''} x="${this.sx(r.x - RACK.w / 2).toFixed(1)}" y="${this.sz(r.z - RACK.d / 2).toFixed(1)}" width="${(RACK.w * scale).toFixed(1)}" height="${(RACK.d * scale).toFixed(1)}"/>`;
      })
      .join('');
    const svg = `
      <svg class="map-svg" viewBox="-6 -6 ${W + 12} ${(H + 12).toFixed(0)}" aria-hidden="true" focusable="false">
        <rect class="m-room" x="0" y="0" width="${W}" height="${H.toFixed(1)}"/>
        <rect class="m-noc" data-goto="a-propos" x="${this.sx(NOC.x - NOC.w / 2)}" y="${this.sz(NOC.z - NOC.d / 2)}" width="${NOC.w * scale}" height="${NOC.d * scale}"/>
        <rect class="m-legacy" data-goto="cv" x="${this.sx(LEGACY.x - LEGACY.w / 2)}" y="${this.sz(LEGACY.z - LEGACY.d / 2)}" width="${LEGACY.w * scale}" height="${LEGACY.d * scale}"/>
        ${rects}
        <line class="m-door" x1="${this.sx(-1.4)}" y1="${H}" x2="${this.sx(1.4)}" y2="${H}"/>
        <circle class="m-robot" r="5" cx="0" cy="0"/>
      </svg>`;

    const lists = ZONES.map((z) => {
      const zoneItems = items.filter((i) => i.kind === z.kind);
      if (!zoneItems.length) return '';
      return `<h3 class="map-zone">${z.title}</h3><ul class="map-list" role="list">${zoneItems
        .map(
          (i) =>
            `<li><button type="button" class="map-go" data-goto="${i.id}"><span class="mg-code">${esc(i.code)}</span><span class="mg-name">${esc(i.label)}${i.project?.status === 'slot' ? ' <small>(à venir)</small>' : ''}</span><span class="mg-check" aria-hidden="true"></span><span class="sr-only mg-sr"></span></button></li>`,
        )
        .join('')}</ul>`;
    }).join('');

    this.dialog.querySelector('.map-grid')!.innerHTML = `
          ${svg}
          <nav class="map-nav" aria-label="Destinations">${lists}</nav>`;
    this.robotDot = this.dialog.querySelector('.m-robot')!;

    this.dialog.addEventListener('click', (e) => {
      const t = e.target as Element;
      if (t === this.dialog || t.closest('[data-close-map]')) return this.close();
      const go = t.closest('[data-goto]') as HTMLElement | SVGElement | null;
      if (go) {
        const id = go.getAttribute('data-goto')!;
        this.close();
        this.onGo?.(id);
      }
    });
    this.dialog.addEventListener('close', () => this.onToggle?.(false));
  }

  get isOpen() {
    return this.dialog.open;
  }

  open() {
    if (this.dialog.open) return;
    this.dialog.showModal();
    this.onToggle?.(true);
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  setRobot(x: number, z: number) {
    if (!this.dialog.open) return;
    this.robotDot.setAttribute('cx', this.sx(x).toFixed(1));
    this.robotDot.setAttribute('cy', this.sz(z).toFixed(1));
  }

  markVisited(id: string) {
    this.dialog.querySelectorAll(`[data-goto="${id}"]`).forEach((el) => {
      el.classList.add('is-visited');
      const sr = el.querySelector('.mg-sr');
      if (sr) sr.textContent = ' (déjà inspectée)';
    });
  }
}
