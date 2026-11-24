import './core/lights'; // patch des shaders three : avant toute compilation
import * as THREE from 'three';
import { clamp, damp, easeInOutCubic, smoothstep } from './core/math';
import { buildLayout, LEGACY, NOC, RACK, SPAWN, type Item, type Layout } from './world/layout';
import { Racks, createSharedUniforms, type SharedUniforms } from './world/racks';
import { Robot } from './world/robot';
import { Room } from './world/room';
import { Decor } from './world/decor';
import { Noc } from './world/noc';
import { Legacy } from './world/legacy';
import { Atmosphere, lightRows } from './world/atmosphere';
import { Cables } from './world/cables';
import { ScreenTexture } from './core/screen';
import { Post, type QualityLevel } from './systems/post';
import { Sound } from './systems/audio';
import { store } from '../shared/env';
import { CameraRig } from './systems/cameraRig';
import { Input } from './systems/input';
import { NavGrid } from './systems/nav';
import { Physics, boxFromCenter } from './systems/physics';
import { Panel } from './ui/panel';
import { Labels } from './ui/labels';
import { RoomMap } from './ui/map';
import { TouchControls } from './ui/touch';
import { Toast } from './ui/toast';

const MAX_DOTS = 160;
/** Plongée de départ de l'intro (la salle vue de haut). */
const INTRO_POS = new THREE.Vector3(4, 27, 21);
const INTRO_LOOK = new THREE.Vector3(0, 0, -3.2);

export class Experience {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly layout: Layout;
  readonly uniforms: SharedUniforms = createSharedUniforms();
  readonly room: Room;
  readonly racks: Racks;
  readonly noc = new Noc();
  readonly legacy = new Legacy();
  readonly robot = new Robot();
  readonly rig: CameraRig;
  readonly physics: Physics;
  readonly nav: NavGrid;
  readonly input = new Input();
  readonly panel = new Panel();
  readonly labels: Labels;
  readonly map: RoomMap;
  readonly toast = new Toast();
  readonly sound = new Sound();
  readonly post: Post;
  readonly atmosphere: Atmosphere;
  readonly cables: Cables;
  private pingT = -10;
  private readonly keyLight: THREE.DirectionalLight;
  private introOn = false;
  private introT = 0;
  private woke = false;
  private readonly initialHash = window.location.hash;
  private readonly pingOrigin = new THREE.Vector2();
  private readonly canvas: HTMLCanvasElement;
  private readonly items: Item[];
  private active: Item | null = null;
  private activeAmt = 0;
  private readonly timer = new THREE.Timer();
  private time = 0;
  private readonly move = { x: 0, z: 0 };
  private readonly focus = new THREE.Vector3();
  private compact = false;
  private w = 1;
  private h = 1;

  // pilote automatique
  private path: { x: number; z: number }[] | null = null;
  private readonly dots: THREE.InstancedMesh;
  private dotIndex = 0;
  private dotCount = 0;

  // inventaire
  private readonly visited = new Set<string>();

  // picking
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hoverAcc = 0;

  // écrans animés : on ne les redessine que s'ils sont dans le champ
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();
  private readonly nocSphere = new THREE.Sphere();
  private readonly legacySphere = new THREE.Sphere();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpM = new THREE.Matrix4();

  // cadence
  /** Plafond de cadence sur écrans > 100 Hz quand le GPU est juste ; `?fps-max` (ou `false`) le lève, pour mesurer le débit brut. */
  frameCap = !new URLSearchParams(window.location.search).has('fps-max');
  private lastFrame = -1e9;
  /** Dernière image rendue pendant que le plan est ouvert. */
  private mapFrame = 0;
  private resizePending = false;

  constructor() {
    this.canvas = document.getElementById('scene') as HTMLCanvasElement;
    // le canvas ne reçoit que la passe finale plein écran : ni MSAA ni profondeur à payer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, depth: false, powerPreference: 'high-performance' });
    // appliqués par la passe finale (la scène est rendue en HDR linéaire)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene.background = new THREE.Color('#030405');
    this.scene.fog = new THREE.FogExp2('#030405', 0.028);

    this.layout = buildLayout();
    this.items = this.layout.items;

    this.physics = new Physics(this.layout.room);
    for (const r of this.layout.racks) this.physics.add(boxFromCenter(r.x, r.z, RACK.w + 0.04, RACK.d + 0.1));
    for (const m of this.layout.managers) this.physics.add(boxFromCenter(m.x, m.z, 0.4, RACK.d - 0.15));
    this.physics.add(boxFromCenter(NOC.x, NOC.z, NOC.w + 0.1, NOC.d + 0.1));
    this.physics.add(boxFromCenter(LEGACY.x, LEGACY.z, LEGACY.w + 0.4, LEGACY.d));

    this.room = new Room(this.layout, this.uniforms);
    this.racks = new Racks(this.layout.racks, this.uniforms);
    const decor = new Decor(this.layout, this.uniforms, this.physics);
    this.atmosphere = new Atmosphere(this.layout, this.uniforms);
    this.cables = new Cables(this.layout, this.uniforms, this.room.floorUniforms);
    this.scene.add(
      this.room.group, this.cables.mesh, this.racks.group, decor.group, this.noc.group,
      this.legacy.group, this.robot.group, this.atmosphere.group,
    );
    this.nav = new NavGrid(this.physics, this.robot.radius);

    // éclairage : une clé froide venant de l'entrée, un contre-jour chaud depuis l'allée chaude.
    // Le reste vient des LEDs, des néons et du bloom.
    this.scene.add(new THREE.HemisphereLight('#8ea6bd', '#07090b', 0.55));
    const key = new THREE.DirectionalLight('#e3edff', 1.25);
    key.position.set(-4, 14, 10);
    this.scene.add(key);
    this.keyLight = key;
    const rim = new THREE.DirectionalLight('#ff9d55', 0.5);
    rim.position.set(8, 6, -14);
    this.scene.add(rim);

    // pastilles du trajet en pilote automatique
    this.dots = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.07, 10).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ce1ff').multiplyScalar(2), toneMapped: false, transparent: true }),
      MAX_DOTS,
    );
    this.dots.count = 0;
    this.dots.visible = false; // 0 pastille : pas de draw call vide (programme quand même précompilé)
    this.dots.frustumCulled = false;
    this.scene.add(this.dots);

    this.robot.position.set(SPAWN.x, 0, SPAWN.z);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);

    this.post = new Post(this.renderer, this.scene, this.rig.camera, 2);
    this.post.onChange = (level: QualityLevel, pixelRatio: number) => this.atmosphere.setQuality(level, pixelRatio);
    this.post.onStruggle = () =>
      this.toast.show('Ton appareil a du mal avec la 3D — la version classique est dispo en haut à droite.', 'warn', 7000);
    this.atmosphere.setQuality(this.post.level, this.post.pixelRatio);

    // poste de supervision et vieux serveur ne bougent pas : sphères englobantes calculées une fois
    for (const [g, sphere] of [[this.noc.group, this.nocSphere], [this.legacy.group, this.legacySphere]] as const) {
      g.updateMatrixWorld(true);
      new THREE.Box3().setFromObject(g).getBoundingSphere(sphere);
    }

    // son : coupé par défaut, choix mémorisé (mais jamais relancé sans geste de l'utilisateur)
    const soundBtn = document.getElementById('btn-sound')!;
    soundBtn.addEventListener('click', () => this.toggleSound());
    if (store.get('dc01-sound') === 'on') soundBtn.dataset.wanted = 'on';

    this.labels = new Labels(this.items, document.getElementById('labels')!);
    this.map = new RoomMap(this.layout, this.items);
    this.map.onGo = (id) => this.goToId(id);
    this.map.onToggle = (open) => {
      this.input.enabled = !open;
      document.getElementById('btn-map')?.setAttribute('aria-expanded', String(open));
    };
    document.getElementById('btn-map')?.addEventListener('click', () => this.map.open());

    const touch = new TouchControls(this.canvas, this.input);
    touch.onTap = (x, y) => this.onTap(x, y);
    touch.onHover = (x, y) => this.onHover(x, y);

    document.getElementById('inv-total')!.textContent = String(this.items.length);

    this.input.onAction((a) => {
      if (a === 'interact' && this.panel.isOpen) this.panel.focus();
      else if (a === 'escape') {
        if (this.panel.isOpen) this.panel.close(true);
        else if (this.path) this.stopAutopilot();
      } else if (a === 'map') this.map.toggle();
      else if (a === 'ping') this.ping();
      else if (a === 'sound') this.toggleSound();
    });
    this.panel.onClose = () => this.sound.close();

    // easter egg : taper « sudo » dans la salle
    let typed = '';
    window.addEventListener('keydown', (e) => {
      if (e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-4);
      if (typed === 'sudo') this.sudo();
    });

    this.resize();
    this.rig.snap(this.robot.position);
    window.addEventListener('resize', () => (this.resizePending = true));
    this.watchPixelRatio();
    window.addEventListener('hashchange', () => this.followHash());
  }

  /** Compile tous les shaders pendant l'écran de boot (pas de saccade au premier rendu). */
  async compile() {
    this.uniforms.uPowerRadius.value = 999;
    await this.post.compile();
  }

  /**
   * Calibrage GPU sous l'écran de boot : vue de départ, allée entre deux rangées,
   * plongée de l'intro. Fixe la résolution de départ avant la première image visible.
   */
  async calibrate() {
    const cam = this.rig.camera;
    const at = new THREE.Vector3(2, 0, lightRows(this.layout)[0].z);
    const res = await this.post.calibrate([
      () => this.rig.snap(this.robot.position),
      () => this.rig.snap(at),
      () => {
        cam.position.copy(INTRO_POS);
        cam.lookAt(INTRO_LOOK);
      },
    ]);
    this.rig.snap(this.robot.position);
    return res;
  }

  /** Lance la boucle. Avec `intro` : la salle s'allume en vague et la caméra plonge sur le robot. */
  start({ intro }: { intro: boolean }) {
    this.introOn = intro;
    this.introT = 0;
    if (intro) {
      this.uniforms.uPowerRadius.value = 0;
      this.uniforms.uPowerOrigin.value.set(0, NOC.z + 1.5);
      this.rig.cinematic = 1;
      this.rig.cinePos.copy(INTRO_POS);
      this.rig.cineLook.copy(INTRO_LOOK);
      this.robot.setMood('sleep', 99);
      this.keyLight.intensity = 0.1;
      this.input.enabled = false;
      // l'interface reste atteignable au clavier pendant l'intro (fondu seulement)
      document.body.classList.replace('is-booting', 'is-intro');
      const skip = () => {
        if (this.introOn && this.introT > 0.8) this.introT = 99;
      };
      window.addEventListener('keydown', skip);
      window.addEventListener('pointerdown', skip);
    } else {
      this.finishIntro();
    }
    this.timer.connect(document);
    this.timer.reset();
    this.post.begin(intro ? 3.9 : 0);
    this.renderer.setAnimationLoop(this.tick);
  }

  private updateIntro(dt: number) {
    this.introT += dt;
    const t = this.introT;
    // n'importe quelle touche de déplacement après 1 s = on saute l'intro
    if (t > 1 && this.input.manualActive) this.introT = 99;
    this.uniforms.uPowerRadius.value = Math.max(0, (t - 0.5) * 13);
    this.rig.cinematic = 1 - easeInOutCubic(clamp((t - 1.1) / 2.7, 0, 1));
    this.keyLight.intensity = 0.1 + 1.15 * smoothstep(0.6, 3.0, t);
    this.post.bloomBoost = Math.sin(clamp((t - 0.5) / 2.4, 0, 1) * Math.PI) * 0.5;
    if (!this.woke && t > 1.3) {
      this.woke = true;
      this.robot.setMood('happy', 1.8);
      this.sound.boot();
    }
    if (t > 1.2) this.input.enabled = !this.map.isOpen;
    if (t >= 3.9) this.finishIntro();
  }

  private finishIntro() {
    this.introOn = false;
    this.uniforms.uPowerRadius.value = 999;
    this.rig.cinematic = 0;
    this.keyLight.intensity = 1.25;
    this.post.bloomBoost = 0;
    this.input.enabled = !this.map.isOpen;
    if (!this.woke) {
      this.woke = true;
      this.robot.setMood('happy', 1.2);
    }
    document.body.classList.remove('is-booting', 'is-intro');
    if (this.initialHash) window.setTimeout(() => this.followHash(this.initialHash), 300);
    else
      window.setTimeout(
        () =>
          this.toast.show(
            matchMedia('(pointer: coarse)').matches
              ? 'Glisse pour piloter le robot, touche une baie pour y aller.'
              : 'Pilote le robot avec ZQSD, WASD ou les flèches — ou clique sur une baie.',
            'info',
            5200,
          ),
        400,
      );
    if (document.getElementById('btn-sound')?.dataset.wanted === 'on') {
      // le navigateur exige un geste : on rappelle juste que le son était activé
      window.setTimeout(() => this.toast.show('Son coupé — le bouton « Son » le réactive.', 'info', 3000), 6200);
    }
  }

  // ── son & ping ─────────────────────────────────────────

  toggleSound() {
    const on = !this.sound.enabled;
    this.sound.setEnabled(on);
    store.set('dc01-sound', on ? 'on' : 'off');
    const btn = document.getElementById('btn-sound')!;
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('.lbl')!.textContent = on ? 'Son activé' : 'Son coupé';
  }

  ping() {
    const p = this.robot.position;
    this.pingT = this.time;
    this.pingOrigin.set(p.x, p.z);
    this.sound.ping();
    this.robot.setMood('scan', 1.2);
    // l'hôte le plus proche répond
    let best: Item | null = null;
    let bd = Infinity;
    for (const it of this.items) {
      const d = Math.hypot(it.fx - p.x, it.fz - p.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    if (best) {
      const host = best.project?.hostname ?? best.domain?.hostname ?? (best.kind === 'cv' ? 'legacy-srv-1998' : 'supervision-01');
      const ms = (bd * 0.11 + 0.08).toFixed(2).replace('.', ',');
      window.setTimeout(() => this.toast.show(`64 octets de ${host} : icmp_seq=1 ttl=64 temps=${ms} ms`, 'ok'), 450);
    }
  }

  private sudoT = -10;

  private sudo() {
    this.sudoT = this.time;
    this.robot.setMood('bump', 1.6);
    this.rig.shake(0.25);
    this.sound.bump(4);
    this.toast.show("visiteur n'est pas dans le fichier sudoers. Cet incident sera signalé.", 'warn', 4200);
  }

  // ── navigation ─────────────────────────────────────────

  private followHash(hash = window.location.hash) {
    const raw = decodeURIComponent(hash.slice(1));
    if (!raw) return;
    const alias: Record<string, string | undefined> = {
      projets: this.items.find((i) => i.kind === 'project')?.id,
      competences: this.items.find((i) => i.kind === 'skill')?.id,
    };
    this.goToId(alias[raw] ?? raw);
  }

  goToId(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (item) this.goTo(item.x, item.z, item);
  }

  goTo(x: number, z: number, item: Item | null = null) {
    const p = this.robot.position;
    const path = this.nav.find(p.x, p.z, x, z);
    if (!path || !path.length) {
      this.toast.show('Route introuvable — essaie un autre point.', 'warn');
      return;
    }
    if (item && this.panel.dismissed === item.id) this.panel.dismissed = null;
    this.path = path;
    this.layDots(p.x, p.z, path);
    if (item) this.toast.show(`Pilote auto → ${item.code} · ${item.label}`);
  }

  private stopAutopilot() {
    this.path = null;
    this.dots.count = 0;
    this.dots.visible = false;
  }

  private layDots(x0: number, z0: number, path: { x: number; z: number }[]) {
    const m = new THREE.Matrix4();
    let n = 0;
    let px = x0;
    let pz = z0;
    let carry = 0.5;
    for (const pt of path) {
      const dx = pt.x - px;
      const dz = pt.z - pz;
      const len = Math.hypot(dx, dz);
      let d = carry;
      while (d < len && n < MAX_DOTS) {
        m.makeTranslation(px + (dx / len) * d, 0.02, pz + (dz / len) * d);
        this.dots.setMatrixAt(n++, m);
        d += 0.38;
      }
      carry = d - len;
      px = pt.x;
      pz = pt.z;
    }
    this.dots.count = n;
    this.dots.visible = n > 0;
    this.dotCount = n;
    this.dotIndex = 0;
    this.dots.instanceMatrix.needsUpdate = true;
  }

  private autopilot(out: { x: number; z: number }): void {
    if (!this.path) return;
    if (this.input.manualActive) {
      this.stopAutopilot();
      return;
    }
    const p = this.robot.position;
    const target = this.path[0];
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    const last = this.path.length === 1;
    if (d < (last ? 0.12 : 0.45)) {
      this.path.shift();
      if (!this.path.length) {
        this.stopAutopilot();
        return;
      }
      this.autopilot(out);
      return;
    }
    const speed = last ? Math.min(1, 0.25 + d / 1.4) : 1;
    out.x = (dx / d) * speed;
    out.z = (dz / d) * speed;

    // efface les pastilles déjà parcourues
    const tmp = this.tmpV;
    const m = this.tmpM;
    while (this.dotIndex < this.dotCount) {
      this.dots.getMatrixAt(this.dotIndex, m);
      tmp.setFromMatrixPosition(m);
      if (Math.hypot(tmp.x - p.x, tmp.z - p.z) > 0.55) break;
      this.dotIndex++;
    }
    if (this.dotIndex > 0) {
      // décale l'affichage : on ne montre que les pastilles restantes
      for (let i = this.dotIndex; i < this.dotCount; i++) {
        this.dots.getMatrixAt(i, m);
        this.dots.setMatrixAt(i - this.dotIndex, m);
      }
      this.dotCount -= this.dotIndex;
      this.dotIndex = 0;
      this.dots.count = this.dotCount;
      this.dots.visible = this.dotCount > 0;
      this.dots.instanceMatrix.needsUpdate = true;
    }
  }

  // ── picking (clic / tap) ───────────────────────────────

  private pick(x: number, y: number): { item: Item | null; point: THREE.Vector3 | null } {
    this.ndc.set((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    const hits = this.raycaster.intersectObjects([this.racks.group, this.noc.group, this.legacy.group], true);
    for (const hit of hits) {
      if (hit.instanceId !== undefined && hit.object.parent === this.racks.group) {
        const item = this.racks.itemAt(hit.object, hit.instanceId);
        if (item !== undefined) return { item: item ? this.items.find((i) => i.id === item) ?? null : null, point: null };
      }
      if (this.noc.pickables.includes(hit.object)) return { item: this.items.find((i) => i.kind === 'about')!, point: null };
      if (this.legacy.pickables.includes(hit.object)) return { item: this.items.find((i) => i.kind === 'cv')!, point: null };
    }
    const point = new THREE.Vector3();
    return { item: null, point: this.raycaster.ray.intersectPlane(this.floorPlane, point) };
  }

  private onTap(x: number, y: number) {
    if (this.map.isOpen) return;
    const { item, point } = this.pick(x, y);
    if (item) this.goTo(item.x, item.z, item);
    else if (point && this.nav.isFree(point.x, point.z)) this.goTo(point.x, point.z);
  }

  private onHover(x: number, y: number) {
    const now = performance.now();
    if (now - this.hoverAcc < 90) return;
    this.hoverAcc = now;
    const { item } = this.pick(x, y);
    this.canvas.style.cursor = item ? 'pointer' : 'crosshair';
  }

  // ── interaction de proximité ───────────────────────────

  private updateInteraction(dt: number) {
    const p = this.robot.position;
    let best: Item | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      const d = Math.hypot(p.x - it.x, p.z - it.z);
      const r = it === this.active ? 1.8 : 1.3; // hystérésis : pas de clignotement en bord de zone
      if (d < r && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    if (this.panel.dismissed && best?.id !== this.panel.dismissed) this.panel.dismissed = null;
    if (best && best.id === this.panel.dismissed) best = null;

    if (best !== this.active) {
      if (this.active?.rackIndex !== undefined) this.racks.setOpen(this.active.rackIndex, false);
      this.active = best;
      if (best) this.activate(best);
      else {
        this.panel.hide();
        this.robot.setProbe(false);
        this.robot.setMood('idle');
      }
    }
    this.activeAmt = damp(this.activeAmt, this.active?.rackIndex !== undefined ? 1 : 0, 4, dt);
    this.uniforms.uActiveAmt.value = this.activeAmt;
    if (!this.active && this.activeAmt < 0.01) this.uniforms.uActive.value = -1;

    if (this.active) {
      this.focus.set(this.active.fx, 1.1, this.active.fz);
      if (this.robot.speed < 0.4) this.robot.faceTowards(this.active.fx, this.active.fz, dt);
      this.robot.lookX = damp(this.robot.lookX, 0, 4, dt);
    } else {
      const v = this.robot.velocity;
      const side = (v.x * Math.cos(this.robot.heading) - v.z * Math.sin(this.robot.heading)) / 4;
      this.robot.lookX = damp(this.robot.lookX, Math.max(-1, Math.min(1, side)), 5, dt);
    }
  }

  private activate(item: Item) {
    this.panel.show(item);
    this.sound.open();
    if (item.rackIndex !== undefined) {
      this.racks.setOpen(item.rackIndex, true);
      this.uniforms.uActive.value = item.rackIndex;
      this.activeAmt = 0;
    }
    this.robot.setMood(item.kind === 'project' && item.project?.status === 'slot' ? 'scan' : 'happy', 1.6);
    this.robot.setProbe(true);
    if (window.location.hash !== `#${item.id}`) history.replaceState(null, '', `#${item.id}`);

    if (!this.visited.has(item.id)) {
      this.visited.add(item.id);
      this.labels.markVisited(item.id);
      this.map.markVisited(item.id);
      const done = this.visited.size;
      const total = this.items.length;
      document.getElementById('inv-done')!.textContent = String(done);
      (document.getElementById('inv-fill') as HTMLElement).style.width = `${(done / total) * 100}%`;
      if (done === total) {
        document.getElementById('inventory')!.classList.add('is-complete');
        window.setTimeout(() => {
          this.robot.celebrate();
          this.toast.show('Inventaire complet ✓ Tu as tout inspecté — merci de la visite !', 'ok', 5200);
        }, 900);
      }
    }
  }

  // ── boucle ─────────────────────────────────────────────

  private resize = () => {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.compact = this.w <= 760;
    this.post.setSize(this.w, this.h);
    this.rig.resize(this.w, this.h);
  };

  /** Fenêtre déplacée vers un écran d'une autre densité : on suit le nouveau pixel ratio. */
  private watchPixelRatio() {
    const mq = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq?.addEventListener(
      'change',
      () => {
        this.resize();
        this.watchPixelRatio();
      },
      { once: true },
    );
  }

  /** Vrai si la sphère est dans le champ de la caméra (frustum calculé dans `tick`). */
  private inView(sphere: THREE.Sphere) {
    return this.frustum.intersectsSphere(sphere);
  }

  private tick = (now: number) => {
    // écran 120/144 Hz et GPU juste : une image sur deux → 60/72 i/s réguliers (au lieu d'une
    // alternance 7/14 ms), le GPU garde de la marge et chauffe moins. Sans effet à 60–100 Hz
    // (seuil à mi-chemin entre 100 et 120 Hz), ni quand le GPU mesuré a de la marge (cadence native).
    if (this.frameCap && !this.post.roomy && now - this.lastFrame < 9.2) return;
    this.lastFrame = now;
    // redimensionnement : au plus une réallocation par image, même pendant un glisser de fenêtre
    if (this.resizePending) {
      this.resizePending = false;
      this.resize();
    }
    this.timer.update(now);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.time += dt;
    const t = this.time;
    this.uniforms.uTime.value = t;

    this.input.vector(this.move);
    this.autopilot(this.move);
    const impact = this.robot.step(dt, this.move, this.input.boost, this.physics);
    if (impact > 2.5) {
      this.rig.shake(impact * 0.025);
      this.sound.bump(impact);
    }
    const rp = this.robot.position;
    this.room.setRobot(rp.x, rp.z);
    this.cables.update(dt, t, rp.x, rp.z, this.robot.speed);
    this.sound.update(this.robot.speed, this.input.boost);

    // onde de ping : 1,6 s pour traverser la salle
    const pa = t - this.pingT;
    const fu = this.room.floorUniforms;
    fu.uPing.value.set(this.pingOrigin.x, this.pingOrigin.y, pa * 16);
    fu.uPingAmt.value = pa < 1.8 ? Math.max(0, 1 - pa / 1.8) : 0;
    // sudo : coupure de courant d'une demi-seconde, puis tout se rallume en vague
    const sa = t - this.sudoT;
    if (!this.introOn && sa < 2.2) {
      this.uniforms.uPowerOrigin.value.set(rp.x, rp.z);
      this.uniforms.uPowerRadius.value = sa < 0.45 ? 0 : (sa - 0.45) * 22;
    } else if (!this.introOn && sa < 2.4) this.uniforms.uPowerRadius.value = 999;

    if (this.introOn) this.updateIntro(dt);
    else this.post.bloomBoost = fu.uPingAmt.value * 0.6;

    const pool = fu.uActivePool.value;
    if (this.active) pool.set(this.active.fx, this.active.fz + RACK.d / 2 + 0.6, this.activeAmt);
    else pool.z = this.activeAmt;
    this.map.setRobot(this.robot.position.x, this.robot.position.z);

    this.updateInteraction(dt);
    this.racks.update(dt);
    (this.dots.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 6) * 0.3;

    this.rig.update(dt, this.robot.position, this.robot.velocity, this.active ? this.focus : null, this.panel.isOpen, this.compact);

    // plan ouvert : la salle n'est plus qu'un fond assombri (voile à 72 %) → 15 i/s suffisent
    const skip = this.map.isOpen && now - this.mapFrame < 66;
    // écrans animés : redessinés seulement s'ils sont dans le champ de la caméra de cette image
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    ScreenTexture.beginFrame();
    this.noc.update(dt, t, this.active?.kind === 'about', !skip && this.inView(this.nocSphere));
    this.legacy.update(dt, t, this.active?.kind === 'cv', !skip && this.inView(this.legacySphere));
    if (skip) {
      this.post.hold(); // image volontairement sautée : la qualité adaptative ne doit pas la compter
      return;
    }
    this.mapFrame = now;
    // pendant l'intro les étiquettes sont masquées (fondu CSS) : rien à écrire
    if (!this.introOn) this.labels.update(cam, this.robot.position, this.active?.id ?? null, this.w, this.h, 1);
    this.post.render(dt, t);
  };
}
