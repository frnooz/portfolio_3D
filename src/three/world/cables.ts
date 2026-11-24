import * as THREE from 'three';
import type { Layout } from './layout';
import { LEGACY, NOC, RACK } from './layout';
import type { SharedUniforms } from './racks';

const TRAIL = 10;

/**
 * Câbles encastrés dans le sol, façon circuit imprimé géant.
 * Ils s'allument là où le robot passe et laissent une traînée qui s'estompe ;
 * des impulsions partent du robot dans les deux sens. Le ping les fait flasher.
 */
export class Cables {
  readonly mesh: THREE.Mesh;
  /** Points mémorisés : x, z, instant, poids. */
  private readonly trail: THREE.Vector4[] = [];
  /** Envoyé au GPU : xy = point, w = poids déjà amorti par l'âge (z inutilisé). */
  private readonly trailGpu: THREE.Vector4[] = [];
  private acc = 0;
  private head = 0;
  readonly uniforms = {
    uTrail: { value: [] as THREE.Vector4[] },
    uRobot: { value: new THREE.Vector2() },
  };

  constructor(layout: Layout, shared: SharedUniforms, ping: { uPing: { value: THREE.Vector3 }; uPingAmt: { value: number } }) {
    for (let i = 0; i < TRAIL; i++) {
      this.trail.push(new THREE.Vector4(0, 0, -999, 0));
      this.trailGpu.push(new THREE.Vector4());
    }
    this.uniforms.uTrail.value = this.trailGpu;

    const paths: { x: number; z: number }[][] = [];
    const half = layout.rowHalf;
    const frontA = layout.racks.find((r) => r.kind === 'project')!.z + RACK.d / 2;
    const frontB = layout.racks.find((r) => r.kind === 'skill')!.z + RACK.d / 2;
    const runA = frontA + 0.55;
    const runB = frontB + 0.55;
    const trunkX = -half - 0.9;

    // tronc : du poste de supervision jusqu'au legacy, en longeant l'ouest
    paths.push([
      { x: NOC.x - NOC.w / 2 - 0.3, z: NOC.z },
      { x: trunkX, z: NOC.z },
      { x: trunkX, z: LEGACY.z + 0.2 },
      { x: LEGACY.x - LEGACY.w / 2 - 0.2, z: LEGACY.z + 0.2 },
    ]);
    // retour par l'est (boucle)
    paths.push([
      { x: NOC.x + NOC.w / 2 + 0.3, z: NOC.z },
      { x: -trunkX, z: NOC.z },
      { x: -trunkX, z: LEGACY.z + 0.2 },
      { x: LEGACY.x + LEGACY.w / 2 + 0.2, z: LEGACY.z + 0.2 },
    ]);
    // collecteurs d'allée
    paths.push([{ x: trunkX, z: runA }, { x: -trunkX, z: runA }]);
    paths.push([{ x: trunkX, z: runB }, { x: -trunkX, z: runB }]);
    // dérivations vers chaque baie interactive (avec un petit coude, plus organique)
    for (const r of layout.racks) {
      if (r.kind === 'filler') continue;
      const run = r.kind === 'project' ? runA : runB;
      const front = r.z + RACK.d / 2;
      paths.push([
        { x: r.x - 0.25, z: run },
        { x: r.x - 0.25, z: front + 0.18 },
        { x: r.x, z: front - 0.05 },
      ]);
    }
    // jonction NOC → allée B
    paths.push([{ x: NOC.x, z: NOC.z - NOC.d / 2 }, { x: NOC.x, z: runB }]);

    // ruban plat : 2 sommets par point, attribut de distance le long du câble
    const pos: number[] = [];
    const dist: number[] = [];
    const side: number[] = [];
    const idx: number[] = [];
    const W = 0.045;
    let base = 0;
    for (const p of paths) {
      let acc = 0;
      for (let i = 0; i < p.length; i++) {
        const a = p[Math.max(0, i - 1)];
        const b = p[Math.min(p.length - 1, i + 1)];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        if (i > 0) acc += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
        const nx = -dz * W;
        const nz = dx * W;
        pos.push(p[i].x + nx, 0.008, p[i].z + nz, p[i].x - nx, 0.008, p[i].z - nz);
        dist.push(acc, acc);
        side.push(1, -1);
        if (i > 0) {
          const v = base + (i - 1) * 2;
          idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        }
      }
      base += p.length * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    geo.setIndex(idx);

    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, ...this.uniforms, ...ping },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      vertexShader: /* glsl */ `
        attribute float aDist; attribute float aSide;
        varying float vDist; varying float vSide; varying vec3 vW;
        void main(){
          vDist = aDist; vSide = aSide;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uPowerRadius; uniform vec2 uPowerOrigin;
        uniform vec4 uTrail[${TRAIL}];
        uniform vec2 uRobot;
        uniform vec3 uPing; uniform float uPingAmt;
        varying float vDist; varying float vSide; varying vec3 vW;
        void main(){
          float on = 1.0; // salle allumée (999) : exactement 1
          if (uPowerRadius < 500.0) on = smoothstep(uPowerRadius, uPowerRadius - 2.0, distance(vW.xz, uPowerOrigin));
          float core = 1.0 - smoothstep(0.2, 1.0, abs(vSide));
          // traînée : chaque point mémorisé brille puis s'éteint (amorti calculé côté CPU ;
          // un point éteint, sous 0,1/255, est sauté : robot à l'arrêt = aucune exponentielle)
          float glow = 0.0;
          for (int i = 0; i < ${TRAIL}; i++) {
            vec4 tp = uTrail[i];
            if (tp.w > 2e-5) {
              vec2 dv = vW.xz - tp.xy;
              glow += exp(-dot(dv, dv) * 1.6) * tp.w;
            }
          }
          float dr = distance(vW.xz, uRobot);
          float near = exp(-dr * dr * 0.5);
          // impulsions qui s'éloignent du robot le long des câbles
          float wave = pow(0.5 + 0.5 * sin(dr * 5.0 - uTime * 9.0), 6.0) * exp(-dr * 0.45);
          // trafic de fond : quelques paquets qui circulent en permanence
          float bg = smoothstep(0.96, 1.0, fract(vDist * 0.18 - uTime * 0.25)) * 0.35;
          float ping = 0.0;
          if (uPingAmt > 0.0) {
            float k = (distance(vW.xz, uPing.xy) - uPing.z) * 2.5;
            ping = exp(-k * k) * uPingAmt;
          }
          vec3 base = vec3(0.05, 0.09, 0.11);
          vec3 lit = vec3(0.36, 0.88, 1.0);
          float e = clamp(glow * 0.9 + near * 0.8 + wave * 1.6 + bg + ping * 2.5, 0.0, 4.0);
          vec3 col = base + lit * e * 1.5 * on;
          gl_FragColor = vec4(col, core * (0.55 + min(e, 1.0) * 0.45));
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
  }

  update(dt: number, t: number, x: number, z: number, speed: number) {
    this.uniforms.uRobot.value.set(x, z);
    this.acc += dt;
    if (this.acc > 0.2 && speed > 0.3) {
      this.acc = 0;
      this.trail[this.head].set(x, z, t, Math.min(1, speed / 3));
      this.head = (this.head + 1) % TRAIL;
    }
    // décroissance calculée une fois par image, pas 10 fois par fragment
    for (let i = 0; i < TRAIL; i++) {
      const p = this.trail[i];
      this.trailGpu[i].set(p.x, p.y, 0, p.w * Math.exp(-(t - p.z) * 1.4));
    }
  }
}
