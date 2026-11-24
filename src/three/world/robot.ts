import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import type { Physics } from '../systems/physics';
import { bakeMerge } from '../core/geometry';

export type Mood = 'idle' | 'happy' | 'scan' | 'bump' | 'love' | 'sleep';

const SHELL = '#d6d3cb';
const DARK = '#171c21';
const AMBER = '#ffb020';
const EYE = '#5ce1ff';
/** Convertis une fois (Color.set(chaîne) à chaque image = regex + allocations). */
const EYE_RGB = new THREE.Color(EYE);
const ANTENNA_RGB = new THREE.Color('#ff5a4e');

/** Texture « ruban de chantier » jaune/noir, générée en canvas. */
function hazardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#121416';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = AMBER;
  for (let x = -16; x < 80; x += 16) {
    g.beginPath();
    g.moveTo(x, 16);
    g.lineTo(x + 8, 16);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 8, 0);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(5, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function radialTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Robot {
  readonly group = new THREE.Group();
  /** Ce qui bouge (bob, inclinaison) — séparé du groupe racine qui porte la position. */
  private readonly rig = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly antennaTip: THREE.Mesh;
  private readonly hoverRing: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly arm = new THREE.Group();
  readonly light: THREE.PointLight;

  private readonly face: CanvasRenderingContext2D;
  private readonly faceTex: THREE.CanvasTexture;
  private faceKey = '';

  readonly velocity = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();
  private readonly accel = new THREE.Vector3();
  heading = 0; // face à la caméra au démarrage : « salut »
  readonly radius = 0.42;
  maxSpeed = 3.9;
  boostSpeed = 6.4;

  mood: Mood = 'idle';
  private moodTimer = 0;
  private blinkIn = 2.5;
  private blinking = 0;
  private t = 0;
  private spin = 0;
  /** Où regardent les yeux (-1..1). */
  lookX = 0;
  /** 0..1 : bras-sonde déployé vers une baie. */
  probe = 0;
  private probeTarget = 0;

  constructor() {
    const shell = new THREE.MeshStandardMaterial({ color: SHELL, roughness: 0.5, metalness: 0.15, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.6, metalness: 0.4, flatShading: true });
    const amber = new THREE.MeshStandardMaterial({ color: AMBER, roughness: 0.45, metalness: 0.2, flatShading: true });
    const hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 });

    // jupe de lévitation
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.16, 10), dark);
    skirt.position.y = 0.24;
    this.rig.add(skirt);

    this.hoverRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.035, 6, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(EYE).multiplyScalar(3), toneMapped: false }),
    );
    this.hoverRing.rotation.x = Math.PI / 2;
    this.hoverRing.position.y = 0.155;
    this.rig.add(this.hoverRing);

    // corps
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.42, 10), shell);
    body.position.y = 0.52;
    this.rig.add(body);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.346, 0.342, 0.075, 10, 1, true), hazard);
    band.position.y = 0.63;
    this.rig.add(band);

    // plastron avec LEDs d'état
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.05), dark);
    chest.position.set(0, 0.47, 0.3);
    chest.rotation.x = -0.09;
    this.rig.add(chest);
    const ledGeo = new THREE.BoxGeometry(0.03, 0.03, 0.02);
    ['#39e58c', '#5ce1ff', '#ffb020'].forEach((c, i) => {
      const led = new THREE.Mesh(
        ledGeo,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.5), toneMapped: false }),
      );
      led.position.set(-0.06 + i * 0.06, 0.475, 0.33);
      this.rig.add(led);
    });

    // cou
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.1, 8), dark);
    neck.position.y = 0.78;
    this.rig.add(neck);

    // tête
    this.head.position.y = 0.98;
    this.rig.add(this.head);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.46), shell);
    this.head.add(skull);
    const visorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.28, 0.02), dark);
    visorFrame.position.z = 0.232;
    this.head.add(visorFrame);

    const fc = document.createElement('canvas');
    fc.width = 128;
    fc.height = 64;
    this.face = fc.getContext('2d')!;
    this.faceTex = new THREE.CanvasTexture(fc);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    const visor = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.24),
      new THREE.MeshBasicMaterial({ map: this.faceTex, toneMapped: false }),
    );
    visor.position.z = 0.244;
    this.head.add(visor);

    // oreilles-capteurs
    const ear = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8);
    [-1, 1].forEach((s) => {
      const m = new THREE.Mesh(ear, amber);
      m.rotation.z = Math.PI / 2;
      m.position.x = s * 0.32;
      this.head.add(m);
    });

    // antenne
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.24, 5), dark);
    ant.position.set(0.17, 0.3, -0.08);
    this.head.add(ant);
    this.antennaTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a4e').multiplyScalar(3), toneMapped: false }),
    );
    this.antennaTip.position.set(0.17, 0.43, -0.08);
    this.head.add(this.antennaTip);

    // sac à dos : batterie + aérations (on voit souvent le robot de dos)
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.14), amber);
    pack.position.set(0, 0.56, -0.33);
    this.rig.add(pack);
    const ventGeo = new THREE.BoxGeometry(0.24, 0.022, 0.02);
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Mesh(ventGeo, dark);
      v.position.set(0, 0.49 + i * 0.045, -0.405);
      this.rig.add(v);
    }
    const backLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.025, 0.02),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#39e58c').multiplyScalar(2.5), toneMapped: false }),
    );
    backLed.position.set(0, 0.665, -0.405);
    this.rig.add(backLed);

    // bras-sonde (se déploie vers les baies)
    this.arm.position.set(0.33, 0.55, 0.05);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), dark);
    upper.position.z = 0.15;
    this.arm.add(upper);
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.06),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(EYE).multiplyScalar(3), toneMapped: false }),
    );
    tip.position.z = 0.32;
    this.arm.add(tip);
    this.arm.scale.z = 0.01;
    this.rig.add(this.arm);

    this.group.add(this.rig);

    // silhouette « rayons X » : visible seulement quand le décor cache le robot.
    // Dessinée AVANT le robot (renderOrder) en additif : elle ne compare sa profondeur
    // qu'au décor, donc le robot ne se « cache » jamais lui-même.
    this.rig.traverse((o) => (o.renderOrder = 20));
    const xray = new THREE.MeshBasicMaterial({
      color: new THREE.Color(EYE).multiplyScalar(0.28),
      blending: THREE.AdditiveBlending,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
    });
    for (const src of [body, skirt, neck]) {
      const ghost = new THREE.Mesh(src.geometry, xray);
      ghost.position.copy(src.position);
      ghost.renderOrder = 10;
      this.rig.add(ghost);
    }
    const ghostHead = new THREE.Mesh(skull.geometry, xray);
    ghostHead.renderOrder = 10;
    this.head.add(ghostHead);

    // fusion des pièces statiques par matériau : ~10 draw calls de moins
    const byMat = (parent: THREE.Object3D, mat: THREE.Material) =>
      parent.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material === mat);
    for (const [parent, mat] of [[this.rig, dark], [this.head, dark], [this.head, amber]] as const) {
      const parts = byMat(parent, mat);
      if (parts.length > 1) bakeMerge(parts, parent, mat).renderOrder = 20;
    }

    // ombre portée douce (pas de shadow map : gratuit)
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({
        map: radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)'),
        transparent: true,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);

    // lampe frontale : éclaire les baies au passage
    this.light = new THREE.PointLight(EYE, 1.4, 4, 1.6);
    this.light.position.set(0, 1.1, 0.6);
    this.group.add(this.light);

    this.group.rotation.y = this.heading;
    this.rig.scale.setScalar(1.15);
    this.drawFace();
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  setMood(m: Mood, duration = 0) {
    this.mood = m;
    this.moodTimer = duration;
  }

  /** Petite pirouette de joie. */
  celebrate() {
    this.spin = Math.PI * 2;
    this.setMood('love', 2.5);
  }

  setProbe(on: boolean) {
    this.probeTarget = on ? 1 : 0;
  }

  /** Avance d'un pas : intègre la vitesse, résout les collisions, anime. Retourne l'impact. */
  step(dt: number, input: { x: number; z: number }, boost: boolean, physics: Physics): number {
    const max = boost ? this.boostSpeed : this.maxSpeed;
    const has = Math.hypot(input.x, input.z) > 0.01;
    const k = has ? 7.5 : 6;
    this.prevVel.copy(this.velocity);
    this.velocity.x = damp(this.velocity.x, input.x * max, k, dt);
    this.velocity.z = damp(this.velocity.z, input.z * max, k, dt);

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    const impact = physics.resolve(this.position, this.velocity, this.radius);

    if (dt > 0) {
      this.accel.set(
        (this.velocity.x - this.prevVel.x) / dt,
        0,
        (this.velocity.z - this.prevVel.z) / dt,
      );
    }
    const sp = this.speed;
    if (sp > 0.25) this.heading = dampAngle(this.heading, Math.atan2(this.velocity.x, this.velocity.z), 11, dt);
    this.animate(dt, sp, boost);

    if (impact > 2.2 && this.mood !== 'bump') this.setMood('bump', 0.6);
    return impact;
  }

  /** Oriente le robot vers un point (quand il est à l'arrêt devant une baie). */
  faceTowards(x: number, z: number, dt: number) {
    const a = Math.atan2(x - this.position.x, z - this.position.z);
    this.heading = dampAngle(this.heading, a, 6, dt);
  }

  private animate(dt: number, speed: number, boost: boolean) {
    this.t += dt;
    const h = this.heading;
    // accélération dans le repère local du robot
    const sinH = Math.sin(h);
    const cosH = Math.cos(h);
    const aF = this.accel.x * sinH + this.accel.z * cosH;
    const aR = this.accel.x * cosH - this.accel.z * sinH;

    this.rig.rotation.x = damp(this.rig.rotation.x, clamp(aF * 0.03 + speed * 0.025, -0.3, 0.3), 10, dt);
    this.rig.rotation.z = damp(this.rig.rotation.z, clamp(-aR * 0.03, -0.25, 0.25), 10, dt);

    const bob = Math.sin(this.t * 3.1) * 0.03 + Math.sin(this.t * 7.3) * 0.006 * (speed / 4);
    this.rig.position.y = 0.05 + bob;
    this.shadow.scale.setScalar(1 - bob * 2.5);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.75 - bob * 4;

    // anneau de lévitation : plus lumineux en turbo
    const ringMat = this.hoverRing.material as THREE.MeshBasicMaterial;
    const glow = 1.6 + speed * 0.5 + (boost && speed > 1 ? 2.5 : 0) + Math.sin(this.t * 20) * 0.15;
    ringMat.color.copy(EYE_RGB).multiplyScalar(glow);
    this.hoverRing.scale.setScalar(1 + Math.sin(this.t * 6) * 0.04);

    // antenne : flash bref toutes les 1,4 s
    const phase = this.t % 1.4;
    (this.antennaTip.material as THREE.MeshBasicMaterial).color.copy(ANTENNA_RGB).multiplyScalar(phase < 0.12 ? 4 : 0.35);

    // pirouette
    if (this.spin > 0) {
      const d = Math.min(this.spin, dt * 9);
      this.spin -= d;
      this.heading += d;
    }
    this.group.rotation.y = this.heading;

    // la tête suit le regard, petit délai organique
    this.head.rotation.y = damp(this.head.rotation.y, -this.lookX * 0.35, 6, dt);
    this.head.rotation.z = damp(this.head.rotation.z, this.mood === 'scan' ? Math.sin(this.t * 2) * 0.06 : 0, 4, dt);

    // bras-sonde
    this.probe = damp(this.probe, this.probeTarget, 7, dt);
    this.arm.scale.z = Math.max(0.01, this.probe);
    this.arm.rotation.y = -0.45 * this.probe;
    this.arm.visible = this.probe > 0.02;

    // humeur & clignement
    if (this.moodTimer > 0) {
      this.moodTimer -= dt;
      if (this.moodTimer <= 0) this.mood = 'idle';
    }
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinking = 0.13;
      this.blinkIn = 2 + Math.random() * 3.5;
    }
    if (this.blinking > 0) this.blinking -= dt;
    this.drawFace();
  }

  private drawFace() {
    const blink = this.blinking > 0 && (this.mood === 'idle' || this.mood === 'scan');
    const lx = Math.round(this.lookX * 8);
    const scanY = this.mood === 'scan' ? Math.floor((this.t * 40) % 48) : -1;
    const key = `${this.mood}|${blink}|${lx}|${scanY}`;
    if (key === this.faceKey) return;
    this.faceKey = key;

    const g = this.face;
    g.fillStyle = '#02090c';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = 'rgba(92,225,255,0.06)';
    for (let y = 0; y < 64; y += 3) g.fillRect(0, y, 128, 1);

    g.fillStyle = EYE;
    g.strokeStyle = EYE;
    g.lineCap = 'round';
    g.lineWidth = 7;
    const L = 40 + lx;
    const R = 88 + lx;

    const eye = (cx: number, w: number, hgt: number) => {
      g.beginPath();
      g.roundRect(cx - w / 2, 32 - hgt / 2, w, hgt, Math.min(6, hgt / 2));
      g.fill();
    };

    switch (this.mood) {
      case 'happy':
        for (const cx of [L, R]) {
          g.beginPath();
          g.arc(cx, 38, 11, Math.PI * 1.15, Math.PI * 1.85);
          g.stroke();
        }
        break;
      case 'love':
        g.fillStyle = '#ff5a8a';
        for (const cx of [L, R]) {
          g.beginPath();
          g.moveTo(cx, 44);
          g.bezierCurveTo(cx - 16, 32, cx - 9, 18, cx, 27);
          g.bezierCurveTo(cx + 9, 18, cx + 16, 32, cx, 44);
          g.fill();
        }
        break;
      case 'bump':
        for (const [cx, s] of [[L, 1], [R, -1]] as const) {
          g.beginPath();
          g.moveTo(cx - 9 * s, 22);
          g.lineTo(cx + 7 * s, 32);
          g.lineTo(cx - 9 * s, 42);
          g.stroke();
        }
        break;
      case 'sleep':
        for (const cx of [L, R]) {
          g.beginPath();
          g.moveTo(cx - 10, 34);
          g.lineTo(cx + 10, 34);
          g.stroke();
        }
        break;
      default:
        if (blink) {
          eye(L, 22, 4);
          eye(R, 22, 4);
        } else {
          eye(L, 20, 26);
          eye(R, 20, 26);
        }
    }
    if (scanY >= 0) {
      g.fillStyle = 'rgba(92,225,255,0.55)';
      g.fillRect(0, 8 + scanY, 128, 2);
    }
    this.faceTex.needsUpdate = true;
  }
}
