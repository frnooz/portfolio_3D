import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { profile } from '../../data/profile';
import { projects } from '../../data/projects';
import { FONT_DISPLAY, FONT_MONO, ScreenTexture } from '../core/screen';
import { NOC } from './layout';

const BG = '#020608';
const CYAN = '#5ce1ff';
const GREEN = '#39e58c';
const AMBER = '#ffb020';
const DIM = '#3b5563';

function header(g: CanvasRenderingContext2D, w: number, title: string, right = '') {
  g.fillStyle = BG;
  g.fillRect(0, 0, w, 400);
  g.fillStyle = '#0b1a20';
  g.fillRect(0, 0, w, 34);
  g.font = `600 17px ${FONT_MONO}`;
  g.fillStyle = CYAN;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(title, 16, 18);
  g.textAlign = 'right';
  g.fillStyle = DIM;
  g.fillText(right, w - 16, 18);
  g.textAlign = 'left';
}

function scanlines(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
}

/** Écran gauche : trafic réseau en temps réel (faux, mais joli). */
function drawTraffic(): (g: CanvasRenderingContext2D, t: number, w: number, h: number) => void {
  const a: number[] = [];
  const b: number[] = [];
  return (g, t, w, h) => {
    header(g, w, 'TRAFIC // eth0', 'live');
    a.push(0.55 + Math.sin(t * 1.3) * 0.18 + Math.random() * 0.2);
    b.push(0.3 + Math.sin(t * 0.7 + 1) * 0.12 + Math.random() * 0.12);
    if (a.length > 60) a.shift();
    if (b.length > 60) b.shift();
    const top = 60;
    const bot = h - 60;
    g.strokeStyle = '#0f2a33';
    g.lineWidth = 1;
    for (let y = top; y <= bot; y += (bot - top) / 4) {
      g.beginPath();
      g.moveTo(16, y);
      g.lineTo(w - 16, y);
      g.stroke();
    }
    const line = (arr: number[], color: string, fill: string) => {
      g.beginPath();
      arr.forEach((v, i) => {
        const x = 16 + (i / 59) * (w - 32);
        const y = bot - v * (bot - top);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.stroke();
      g.lineTo(16 + ((arr.length - 1) / 59) * (w - 32), bot);
      g.lineTo(16, bot);
      g.fillStyle = fill;
      g.fill();
    };
    line(a, CYAN, 'rgba(92,225,255,0.12)');
    line(b, GREEN, 'rgba(57,229,140,0.10)');
    g.font = `500 16px ${FONT_MONO}`;
    g.fillStyle = CYAN;
    g.fillText(`↓ ${(a[a.length - 1] * 940).toFixed(0)} Mb/s`, 16, h - 30);
    g.fillStyle = GREEN;
    g.fillText(`↑ ${(b[b.length - 1] * 940).toFixed(0)} Mb/s`, w / 2, h - 30);
    scanlines(g, w, h);
  };
}

/** Écran central : terminal « whoami » qui tape en boucle. */
function drawTerminal(): (g: CanvasRenderingContext2D, t: number, w: number, h: number) => void {
  const script = [
    { p: true, s: 'whoami' },
    { p: false, s: profile.name },
    { p: true, s: 'cat role.txt' },
    { p: false, s: 'BUT R&T · parcours DevCloud' },
    { p: false, s: 'Alternance · service SI' },
    { p: true, s: 'uptime' },
    { p: false, s: 'motivé depuis toujours, load: 0.42' },
  ];
  const total = script.reduce((n, l) => n + l.s.length + 8, 0);
  return (g, t, w, h) => {
    header(g, w, 'noah@dc-01: ~', 'tty1');
    g.font = `500 19px ${FONT_MONO}`;
    let budget = Math.floor((t * 16) % (total + 60));
    let y = 64;
    for (const l of script) {
      if (budget <= 0) break;
      const shown = l.s.slice(0, l.p ? Math.max(0, budget) : l.s.length);
      if (l.p) {
        g.fillStyle = GREEN;
        g.fillText('$', 16, y);
        g.fillStyle = '#e8edf1';
        g.fillText(shown, 38, y);
      } else {
        g.fillStyle = CYAN;
        g.fillText(shown, 16, y);
      }
      budget -= l.s.length + 8;
      y += 30;
    }
    if (Math.floor(t * 2) % 2 === 0) {
      g.fillStyle = '#e8edf1';
      g.fillRect(16, y - 12, 11, 22);
    }
    scanlines(g, w, h);
  };
}

/** Écran droit : topologie, des paquets circulent entre les baies. */
function drawTopology(): (g: CanvasRenderingContext2D, t: number, w: number, h: number) => void {
  const nodes = [
    { x: 0.5, y: 0.2, c: CYAN, l: 'core' },
    ...projects.map((p, i, a) => ({
      x: 0.12 + (i / Math.max(1, a.length - 1)) * 0.76,
      y: 0.52,
      c: p.status === 'online' ? GREEN : AMBER,
      l: p.hostname.split('-')[0],
    })),
    { x: 0.3, y: 0.82, c: GREEN, l: 'net' },
    { x: 0.5, y: 0.82, c: CYAN, l: 'cloud' },
    { x: 0.7, y: 0.82, c: AMBER, l: 'dev' },
  ];
  const links = nodes.slice(1).map((_, i) => [0, i + 1]);
  return (g, t, w, h) => {
    header(g, w, 'TOPOLOGIE', `${nodes.length} nœuds`);
    const top = 44;
    const P = (n: { x: number; y: number }) => [16 + n.x * (w - 32), top + n.y * (h - top - 20)];
    g.lineWidth = 2;
    links.forEach(([a, b], i) => {
      const [x1, y1] = P(nodes[a]);
      const [x2, y2] = P(nodes[b]);
      g.strokeStyle = '#123540';
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      const k = (t * 0.6 + i * 0.27) % 1;
      g.fillStyle = CYAN;
      g.fillRect(x1 + (x2 - x1) * k - 3, y1 + (y2 - y1) * k - 3, 6, 6);
    });
    g.font = `500 13px ${FONT_MONO}`;
    g.textAlign = 'center';
    nodes.forEach((n, i) => {
      const [x, y] = P(n);
      const pulse = 0.6 + 0.4 * Math.sin(t * 3 + i);
      g.fillStyle = n.c;
      g.globalAlpha = pulse;
      g.beginPath();
      g.arc(x, y, i === 0 ? 11 : 7, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#8fa6b2';
      g.fillText(n.l, x, y + 22);
    });
    g.textAlign = 'left';
    scanlines(g, w, h);
  };
}

/** Grand panneau au-dessus du poste : horloge réelle + bandeau défilant. */
function drawBoard(): (g: CanvasRenderingContext2D, t: number, w: number, h: number) => void {
  const ticker =
    projects
      .map((p, i) => `A-${String(i + 1).padStart(2, '0')} ${p.hostname} ${p.status === 'online' ? '▲ EN LIGNE' : p.status === 'building' ? '◆ EN COURS' : '○ SLOT LIBRE'}`)
      .join('   ·   ') + '   ·   ';
  return (g, t, w, h) => {
    g.fillStyle = BG;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#071116';
    g.fillRect(0, h - 56, w, 56);
    g.font = `800 52px ${FONT_DISPLAY}`;
    g.fillStyle = '#e8edf1';
    g.textBaseline = 'middle';
    g.fillText('DC-01', 28, 62);
    g.font = `600 20px ${FONT_MONO}`;
    g.fillStyle = DIM;
    g.fillText('NOC · SUPERVISION', 30, 112);
    // état
    g.fillStyle = GREEN;
    g.beginPath();
    g.arc(w * 0.42, 74, 10, 0, Math.PI * 2);
    g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3);
    g.fill();
    g.globalAlpha = 1;
    g.font = `600 26px ${FONT_MONO}`;
    g.fillText('TOUS SYSTÈMES OK', w * 0.42 + 26, 76);
    // horloge
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    g.textAlign = 'right';
    g.font = `500 44px ${FONT_MONO}`;
    g.fillStyle = CYAN;
    g.fillText(`${hh}:${mm}:${ss}`, w - 28, 76);
    g.textAlign = 'left';
    // bandeau
    g.font = `500 22px ${FONT_MONO}`;
    g.fillStyle = '#a9b5c0';
    const tw = g.measureText(ticker).width;
    const off = (t * 70) % tw;
    g.fillText(ticker + ticker, 20 - off, h - 28);
    scanlines(g, w, h);
  };
}

export class Noc {
  readonly group = new THREE.Group();
  private readonly screens: ScreenTexture[] = [];
  private readonly underglow: THREE.MeshBasicMaterial;
  /** Meshes pour le raycast (clic → aller au poste). */
  readonly pickables: THREE.Object3D[] = [];

  constructor() {
    this.group.position.set(NOC.x, 0, NOC.z);
    const metal = new THREE.MeshStandardMaterial({ color: '#20272e', roughness: 0.45, metalness: 0.6 });
    const darker = new THREE.MeshStandardMaterial({ color: '#0f1317', roughness: 0.7, metalness: 0.3 });

    // bureau
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number) => {
      g.translate(x, y, z);
      parts.push(g);
    };
    add(new THREE.BoxGeometry(NOC.w, 0.06, NOC.d), 0, 0.8, 0);
    add(new THREE.BoxGeometry(NOC.w - 0.1, 0.74, 0.05), 0, 0.4, NOC.d / 2 - 0.1);
    add(new THREE.BoxGeometry(0.06, 0.78, NOC.d - 0.1), -NOC.w / 2 + 0.05, 0.39, 0);
    add(new THREE.BoxGeometry(0.06, 0.78, NOC.d - 0.1), NOC.w / 2 - 0.05, 0.39, 0);
    // potences du grand écran
    add(new THREE.BoxGeometry(0.08, 2.0, 0.08), -1.55, 1.85, -0.42);
    add(new THREE.BoxGeometry(0.08, 2.0, 0.08), 1.55, 1.85, -0.42);
    const desk = new THREE.Mesh(mergeGeometries(parts)!, metal);
    this.group.add(desk);
    this.pickables.push(desk);

    // liseré lumineux sous le plateau (côté visiteur)
    this.underglow = new THREE.MeshBasicMaterial({ color: new THREE.Color(CYAN).multiplyScalar(2.2), toneMapped: false });
    const glow = new THREE.Mesh(new THREE.BoxGeometry(NOC.w - 0.2, 0.025, 0.02), this.underglow);
    glow.position.set(0, 0.74, NOC.d / 2 - 0.07);
    this.group.add(glow);

    // trois moniteurs
    const monGeo = new THREE.BoxGeometry(0.98, 0.58, 0.05);
    const draws = [drawTraffic(), drawTerminal(), drawTopology()];
    [-1, 0, 1].forEach((s, i) => {
      const mon = new THREE.Group();
      mon.position.set(s * 1.05, 1.18, -0.18 + Math.abs(s) * 0.08);
      mon.rotation.y = -s * 0.32;
      mon.rotation.x = -0.08;
      const shell = new THREE.Mesh(monGeo, darker);
      mon.add(shell);
      const screen = new ScreenTexture(512, 300, draws[i], i === 1 ? 10 : 6);
      this.screens.push(screen);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.53), screen.material(1.5));
      face.position.z = 0.027;
      mon.add(face);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.06), darker);
      stand.position.set(0, -0.42, -0.02);
      mon.add(stand);
      this.group.add(mon);
      this.pickables.push(shell);
    });

    // grand panneau de supervision
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.86, 0.08), darker);
    board.position.set(0, 2.62, -0.42);
    this.group.add(board);
    const boardScreen = new ScreenTexture(1024, 256, drawBoard(), 4);
    this.screens.push(boardScreen);
    const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.8), boardScreen.material(1.35));
    boardFace.position.set(0, 2.62, -0.375);
    this.group.add(boardFace);

    // clavier + tasse de café (indispensable en salle serveur)
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.2), darker);
    kb.position.set(0, 0.845, 0.22);
    this.group.add(kb);
    const mug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.05, 0.12, 10),
      new THREE.MeshStandardMaterial({ color: '#ffb020', roughness: 0.5 }),
    );
    mug.position.set(1.35, 0.89, 0.25);
    this.group.add(mug);
  }

  update(dt: number, t: number, active: boolean) {
    for (const s of this.screens) s.update(dt);
    this.underglow.color.set(CYAN).multiplyScalar(active ? 3.2 + Math.sin(t * 6) * 0.6 : 2.0);
  }
}
