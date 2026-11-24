import * as THREE from 'three';
import { profile } from '../../data/profile';
import { damp } from '../core/math';
import { FONT_MONO, ScreenTexture, textTexture } from '../core/screen';
import { LEGACY } from './layout';
import { bakeMerge } from '../core/geometry';

const BEIGE = '#cbbf9f';
const PHOSPHOR = '#ffb43a';
/** Converti une fois (Color.set(chaîne) à chaque image = regex + allocations). */
const BEACON_RGB = new THREE.Color('#ff7a1a');

/** Le vieux serveur du fond : bandes magnétiques, CRT ambre, imprimante matricielle. */
export class Legacy {
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  private readonly reels: THREE.Mesh[] = [];
  private readonly beacon: THREE.Group;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private readonly paper: THREE.Mesh;
  private readonly crt: ScreenTexture;
  private readonly panel: ScreenTexture;
  private printed = 0;
  private printing = 0;

  constructor() {
    this.group.position.set(LEGACY.x, 0, LEGACY.z);
    const beige = new THREE.MeshStandardMaterial({ color: BEIGE, roughness: 0.75, metalness: 0.05, flatShading: true });
    const beigeDark = new THREE.MeshStandardMaterial({ color: '#8f866f', roughness: 0.8, flatShading: true });
    const black = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6 });

    // armoire principale
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.0, 0.9), beige);
    cab.position.set(-0.6, 1.0, 0);
    this.group.add(cab);
    this.pickables.push(cab);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.95), beigeDark);
    plinth.position.set(-0.6, 0.05, 0);
    this.group.add(plinth);

    // fenêtre des bandes
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.62, 0.02), black);
    win.position.set(-0.6, 1.45, 0.455);
    this.group.add(win);
    const reelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16);
    const reelMat = new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.4, metalness: 0.3 });
    const hubGeo = new THREE.BoxGeometry(0.34, 0.035, 0.05);
    const hubMat = new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.3, metalness: 0.6 });
    [-0.85, -0.35].forEach((x) => {
      const reel = new THREE.Mesh(reelGeo, reelMat);
      reel.rotation.x = Math.PI / 2;
      reel.position.set(x, 1.45, 0.47);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.position.y = 0.02;
      reel.add(hub);
      this.group.add(reel);
      this.reels.push(reel);
    });

    // panneau de voyants vintage
    this.panel = new ScreenTexture(256, 96, (g, t, w, h) => {
      g.fillStyle = '#1b1915';
      g.fillRect(0, 0, w, h);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 12; c++) {
          const on = Math.sin(t * (1.3 + ((c * 7 + r * 3) % 5)) + c * 1.7 + r) > 0.2;
          g.fillStyle = on ? (r === 0 ? '#ff5a4e' : '#ffb43a') : '#3a2f22';
          g.beginPath();
          g.arc(16 + c * 20, 20 + r * 28, 6, 0, Math.PI * 2);
          g.fill();
        }
      }
    }, 5);
    const lamps = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), this.panel.material(1.3));
    lamps.position.set(-0.6, 0.85, 0.452);
    lamps.renderOrder = -1; // dessiné avant l'armoire : la face cachée derrière n'est plus ombrée
    this.group.add(lamps);

    // plaque « ne pas éteindre »
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.22),
      new THREE.MeshBasicMaterial({
        map: textTexture(
          [
            { text: 'LEGACY-SRV · 1998', font: `600 34px ${FONT_MONO}`, color: '#1b1915', y: 30, x: 256, align: 'center' },
            { text: 'NE PAS ÉTEINDRE', font: `600 28px ${FONT_MONO}`, color: '#a0301f', y: 76, x: 256, align: 'center' },
          ],
          512,
          102,
        ),
      }),
    );
    plate.position.set(-0.6, 1.88, 0.452);
    plate.renderOrder = -1;
    this.group.add(plate);

    // gyrophare
    this.beacon = new THREE.Group();
    this.beacon.position.set(-0.6, 2.06, 0);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a1a').multiplyScalar(3), toneMapped: false });
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.14, 10), this.beaconMat);
    dome.position.y = 0.07;
    this.beacon.add(dome);
    const flap = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.5),
      new THREE.MeshBasicMaterial({
        color: '#ff7a1a',
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    flap.position.set(0.8, 0.07, 0);
    flap.rotation.x = Math.PI / 2;
    this.beacon.add(flap);
    this.group.add(this.beacon);

    // lumière chaude de l'allée chaude
    const warm = new THREE.PointLight('#ff9a3c', 6, 7, 1.6);
    warm.position.set(0.2, 2.6, 1.6);
    this.group.add(warm);

    // table + terminal CRT
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.7), beigeDark);
    table.position.set(0.75, 0.74, 0.05);
    this.group.add(table);
    [-0.45, 0.45].forEach((dx) =>
      [-0.3, 0.3].forEach((dz) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), black);
        leg.position.set(0.75 + dx, 0.36, 0.05 + dz);
        this.group.add(leg);
      }),
    );
    const crtBody = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.5), beige);
    crtBody.position.set(0.7, 1.0, -0.02);
    this.group.add(crtBody);
    this.pickables.push(crtBody);
    const crtBack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.25), beige);
    crtBack.position.set(0.7, 0.98, -0.3);
    this.group.add(crtBack);
    let vignette: CanvasGradient | null = null;
    this.crt = new ScreenTexture(256, 200, (g, t, w, h) => {
      g.fillStyle = '#120a02';
      g.fillRect(0, 0, w, h);
      g.font = `500 17px ${FONT_MONO}`;
      g.fillStyle = PHOSPHOR;
      g.textBaseline = 'top';
      const lines = [
        'LEGACY-SRV v1.0',
        '(c) 1998',
        '',
        `${profile.cv.fileName.slice(0, 18).toUpperCase()}`,
        `MAJ ${profile.cv.updated} ... OK`,
        '',
        this.printing > 0.5 ? 'IMPRESSION...' : '> PRINT CV',
      ];
      lines.forEach((l, i) => g.fillText(l, 14, 12 + i * 24));
      if (Math.floor(t * 2) % 2) g.fillRect(14 + g.measureText(lines[6]).width + 4, 12 + 6 * 24, 10, 18);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
      // vignette : taille fixe, dégradé créé une seule fois
      if (!vignette) {
        vignette = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
      }
      g.fillStyle = vignette;
      g.fillRect(0, 0, w, h);
    }, 6);
    const crtFace = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.34), this.crt.material(1.4));
    crtFace.position.set(0.7, 1.01, 0.232);
    crtFace.renderOrder = -1;
    this.group.add(crtFace);

    // imprimante matricielle + listing qui sort
    const printer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.36), beige);
    printer.position.set(1.32, 0.85, 0.12);
    printer.rotation.y = -0.2;
    this.group.add(printer);
    const paperMat = new THREE.MeshStandardMaterial({
      map: this.paperTexture(),
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const paperGeo = new THREE.PlaneGeometry(0.36, 1);
    paperGeo.translate(0, 0.5, 0); // le listing sort vers le haut et retombe vers l'arrière
    this.paper = new THREE.Mesh(paperGeo, paperMat);
    this.paper.position.set(1.34, 0.9, 0.08);
    this.paper.rotation.set(-0.35, -0.2, 0);
    this.paper.scale.y = 0.05;
    this.group.add(this.paper);

    // pièces statiques fusionnées par matériau
    this.pickables.length = 0;
    for (const mat of [beige, beigeDark, black]) {
      const parts = this.group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material === mat);
      const merged = bakeMerge(parts, this.group, mat);
      if (mat === beige) this.pickables.push(merged);
    }
  }

  private paperTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#efeadf';
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#c9d8c4';
    for (let y = 0; y < 256; y += 16) g.fillRect(10, y, 108, 8); // papier listing zébré
    g.fillStyle = '#bdb6a5';
    for (let y = 4; y < 256; y += 10) {
      g.beginPath();
      g.arc(4, y, 2, 0, Math.PI * 2);
      g.arc(124, y, 2, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#2b2b2b';
    g.font = `600 10px ${FONT_MONO}`;
    g.fillText(profile.name.toUpperCase(), 14, 14);
    for (let y = 30; y < 250; y += 9) g.fillRect(14, y, 30 + ((y * 37) % 70), 3);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  update(dt: number, t: number, active: boolean, visible = true) {
    // au plus un écran redessiné par image, tous écrans confondus (budget de ScreenTexture)
    this.crt.update(dt, visible);
    this.panel.update(dt, visible);
    const spin = active ? 5 : 0.6;
    this.reels[0].rotation.y += dt * spin;
    this.reels[1].rotation.y -= dt * spin * 1.3;
    this.beacon.rotation.y = t * 3.2;
    this.beaconMat.color.copy(BEACON_RGB).multiplyScalar(2.2 + Math.max(0, Math.sin(t * 3.2 * 2)) * 2);
    // le listing sort quand le robot est là, se rétracte lentement sinon
    this.printing = damp(this.printing, active ? 1 : 0, 3, dt);
    this.printed = active ? Math.min(0.75, this.printed + dt * 0.22) : Math.max(0.05, this.printed - dt * 0.12);
    this.paper.scale.y = this.printed;
  }
}
