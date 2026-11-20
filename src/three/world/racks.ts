import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, easeOutBack, smoothstep } from '../core/math';
import { RACK, type RackSpec } from './layout';

/**
 * Toutes les baies en 5 draw calls, quel que soit leur nombre :
 *   coques · cadres de porte · portes vitrées · serveurs · ombres au sol.
 * Les façades de serveurs (grilles, baies de disques, ports, LEDs) sont dessinées
 * procéduralement dans le shader : zéro texture, clignotement 100 % GPU.
 */

export interface SharedUniforms {
  uTime: { value: number };
  /** Index de la baie active (-1 = aucune). */
  uActive: { value: number };
  uActiveAmt: { value: number };
  /** Allumage progressif de la salle (rayon de l'onde, en mètres). */
  uPowerRadius: { value: number };
  uPowerOrigin: { value: THREE.Vector2 };
}

export function createSharedUniforms(): SharedUniforms {
  return {
    uTime: { value: 0 },
    uActive: { value: -1 },
    uActiveAmt: { value: 0 },
    uPowerRadius: { value: 999 },
    uPowerOrigin: { value: new THREE.Vector2(0, 8) },
  };
}

const GLSL_COMMON = /* glsl */ `
  uniform float uTime;
  uniform float uActive;
  uniform float uActiveAmt;
  uniform float uPowerRadius;
  uniform vec2 uPowerOrigin;
  float h11(float n){ return fract(sin(n) * 43758.5453123); }
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float dotLed(vec2 p, vec2 c, float r){ return 1.0 - smoothstep(r * 0.45, r, length(p - c)); }
  float powerAt(vec3 wp){
    float d = distance(wp.xz, uPowerOrigin);
    return smoothstep(uPowerRadius, uPowerRadius - 2.5, d);
  }
`;

function sledMaterial(u: SharedUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: '#1b2025', roughness: 0.55, metalness: 0.35 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aDims;
        attribute float aStyle;
        attribute vec3 aLed;
        attribute float aSeed;
        attribute float aRack;
        varying vec2 vFace;
        varying float vFront;
        varying vec2 vDims;
        varying float vStyle;
        varying vec3 vLed;
        varying float vSeed;
        varying float vRack;
        varying vec3 vWPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFace = uv;
        vFront = step(0.5, normal.z);
        vDims = aDims; vStyle = aStyle; vLed = aLed; vSeed = aSeed; vRack = aRack;
        vWPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${GLSL_COMMON}
        varying vec2 vFace;
        varying float vFront;
        varying vec2 vDims;
        varying float vStyle;
        varying vec3 vLed;
        varying float vSeed;
        varying float vRack;
        varying vec3 vWPos;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float power = powerAt(vWPos);
          float act = (abs(vRack - uActive) < 0.5) ? uActiveAmt : 0.0;
          vec2 p = vFace * vDims;           // mètres sur la façade
          float W = vDims.x, H = vDims.y;
          vec3 leds = vec3(0.0);
          if (vFront > 0.5) {
            // liseré de façade
            float rim = step(p.x, 0.014) + step(W - 0.014, p.x) + step(p.y, 0.006) + step(H - 0.006, p.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.18, 0.2), clamp(rim, 0.0, 1.0) * 0.8);
            int st = int(vStyle + 0.5);
            float rate = mix(1.0, 3.0, act);
            if (st == 0) {
              // serveur : grille d'aération + LEDs power / activité / ID
              float vent = step(0.5, fract(p.x / 0.016)) * step(0.06, p.x) * step(p.x, W * 0.55) * step(0.02, p.y) * step(p.y, H - 0.02);
              diffuseColor.rgb *= 1.0 - vent * 0.55;
              float cy = H - 0.03;
              leds += vec3(0.22, 0.9, 0.55) * dotLed(p, vec2(W - 0.05, cy), 0.012);
              float blink = step(0.4, h11(floor(uTime * (4.0 + vSeed * 6.0) * rate) + vSeed * 91.0));
              leds += vLed * dotLed(p, vec2(W - 0.085, cy), 0.012) * blink;
              leds += vec3(0.36, 0.88, 1.0) * dotLed(p, vec2(W - 0.12, cy), 0.01) * step(0.92, h11(floor(uTime * 0.5) + vSeed * 13.0));
              // étiquette
              float lab = step(W * 0.62, p.x) * step(p.x, W * 0.78) * step(H - 0.045, p.y) * step(p.y, H - 0.02);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.6, 0.62), lab * 0.6);
            } else if (st == 1) {
              // stockage : rangées de disques, chaque disque a sa LED d'activité
              float bw = 0.085;
              vec2 cell = vec2(floor((p.x - 0.03) / bw), floor((p.y - 0.008) / 0.084));
              vec2 q = vec2(mod(p.x - 0.03, bw), mod(p.y - 0.008, 0.084));
              float inside = step(0.03, p.x) * step(p.x, W - 0.03) * step(0.008, p.y) * step(p.y, H - 0.008);
              float frame = (step(q.x, 0.004) + step(bw - 0.004, q.x) + step(q.y, 0.004)) * inside;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.09, 0.1), clamp(frame, 0.0, 1.0));
              float seed = h21(cell + vSeed * 17.0);
              float flick = step(0.55 - act * 0.3, h11(floor(uTime * (6.0 + seed * 14.0) * rate) + seed * 50.0));
              leds += vLed * dotLed(q, vec2(bw - 0.014, 0.018), 0.008) * flick * inside;
            } else if (st == 2) {
              // switch : 2 rangées de ports RJ45 + LEDs de lien qui scintillent
              float x0 = W * 0.12, x1 = W * 0.88;
              float pw = (x1 - x0) / 12.0;
              float col = floor((p.x - x0) / pw);
              float row = step(H * 0.5, p.y);
              vec2 q = vec2(mod(p.x - x0, pw), mod(p.y, H * 0.5));
              float inR = step(x0, p.x) * step(p.x, x1);
              float port = inR * step(0.006, q.x) * step(q.x, pw - 0.006) * step(0.008, q.y) * step(q.y, H * 0.5 - 0.016);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03), port * 0.9);
              float s = h21(vec2(col, row) + vSeed * 31.0);
              float up = step(0.18, s);
              float fl = step(0.3 - act * 0.25, h11(floor(uTime * (8.0 + s * 20.0) * rate) + s * 70.0));
              vec3 lc = mix(vec3(0.22, 0.9, 0.55), vec3(1.0, 0.69, 0.13), step(0.85, s));
              leds += lc * dotLed(q, vec2(pw * 0.5, H * 0.5 - 0.009), 0.0065) * inR * up * fl;
              leds += vec3(0.36, 0.88, 1.0) * dotLed(p, vec2(W * 0.06, H * 0.5), 0.01);
            } else if (st == 3) {
              // obturateur : vis de fixation + diodes de slot vide
              float screws = dotLed(p, vec2(0.03, H * 0.5), 0.008) + dotLed(p, vec2(W - 0.03, H * 0.5), 0.008);
              diffuseColor.rgb = mix(diffuseColor.rgb * 0.7, vec3(0.3), screws);
            } else {
              // onduleur : écran LCD + jauge de charge
              float lcd = step(W * 0.08, p.x) * step(p.x, W * 0.36) * step(H * 0.35, p.y) * step(p.y, H * 0.75);
              float bars = step(0.5, fract(p.x / 0.02)) * step(p.x, W * 0.08 + (W * 0.28) * (0.7 + 0.3 * sin(uTime * 0.7 + vSeed * 6.0)));
              leds += vec3(0.25, 0.75, 0.9) * lcd * (0.25 + 0.5 * bars);
              leds += vec3(0.22, 0.9, 0.55) * dotLed(p, vec2(W - 0.06, H * 0.5), 0.014);
            }
            // baie active : liseré lumineux
            leds += vec3(0.36, 0.88, 1.0) * clamp(rim, 0.0, 1.0) * act * 0.12;
          }
          totalEmissiveRadiance += leds * (5.5 + act * 1.5) * power;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'sled-v1';
  return mat;
}

function bodyMaterial(u: SharedUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: '#161a1e', roughness: 0.5, metalness: 0.45 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aStatus;
        attribute float aPulse;
        attribute float aRack;
        varying vec3 vStatus;
        varying float vPulse;
        varying float vRack;
        varying vec3 vObj;
        varying vec3 vObjN;
        varying vec3 vWPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vStatus = aStatus; vPulse = aPulse; vRack = aRack;
        vObj = position; vObjN = normal;
        vWPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${GLSL_COMMON}
        varying vec3 vStatus;
        varying float vPulse;
        varying float vRack;
        varying vec3 vObj;
        varying vec3 vObjN;
        varying vec3 vWPos;
        const float RH = ${RACK.h.toFixed(3)};
        const float RW = ${RACK.w.toFixed(3)};
        const float RD = ${RACK.d.toFixed(3)};`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float power = powerAt(vWPos);
          float act = (abs(vRack - uActive) < 0.5) ? uActiveAmt : 0.0;
          float isFront = step(0.5, vObjN.z) * step(RD * 0.5 - 0.001, vObj.z);
          // barre de statut en haut de la façade
          float strip = isFront * step(RH - 0.115, vObj.y) * step(vObj.y, RH - 0.075) * step(abs(vObj.x), RW * 0.5 - 0.1);
          float pulse = mix(1.0, 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.4)), vPulse);
          vec3 sc = mix(vStatus, vec3(0.36, 0.88, 1.0), act);
          totalEmissiveRadiance += sc * strip * pulse * (2.6 + act * 1.6) * power;
          // rails de montage (visibles porte ouverte)
          float rail = isFront * step(RW * 0.5 - 0.13, abs(vObj.x)) * step(abs(vObj.x), RW * 0.5 - 0.07);
          float holes = rail * step(0.5, fract(vObj.y / 0.023)) * step(0.5, fract((abs(vObj.x) - 0.08) / 0.03));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.24, 0.26), rail * 0.7);
          diffuseColor.rgb *= 1.0 - holes * 0.6;
          // fond de baie vide légèrement éclairé à l'ouverture
          totalEmissiveRadiance += vStatus * isFront * (1.0 - strip) * act * 0.05;
          // toit : tôle plus claire, grille d'aération, et barre de statut visible du dessus
          float isTop = step(0.5, vObjN.y) * step(RH + 0.01, vObj.y);
          float vents = isTop * step(abs(vObj.x), RW * 0.32) * step(abs(vObj.z), RD * 0.28) * step(0.55, fract(vObj.z / 0.045));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.18, 0.2), isTop * 0.85);
          diffuseColor.rgb *= 1.0 - vents * 0.55;
          float topStrip = isTop * step(RD * 0.5 - 0.075, vObj.z) * step(abs(vObj.x), RW * 0.5 - 0.06);
          totalEmissiveRadiance += sc * topStrip * pulse * (1.6 + act * 1.6) * power;
          // panneaux latéraux : rainures verticales
          float side = step(0.5, abs(vObjN.x));
          float groove = side * step(0.94, fract(vObj.z / 0.2));
          diffuseColor.rgb *= 1.0 - groove * 0.35;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'rackbody-v1';
  return mat;
}

function meshDoorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#3a3f44';
  for (let y = 0; y < 32; y += 8) {
    for (let x = (y / 8) % 2 ? 4 : 0; x < 36; x += 8) {
      g.beginPath();
      g.arc(x, y + 4, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 18);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function softRectTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const img = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const dx = Math.max(0, Math.abs(x - 31.5) - 14) / 18;
      const dy = Math.max(0, Math.abs(y - 31.5) - 14) / 18;
      const a = clamp(1 - Math.hypot(dx, dy), 0, 1);
      const i = (y * 64 + x) * 4;
      img.data[i + 3] = Math.round(a * a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

function bodyGeometry(): THREE.BufferGeometry {
  const { w, h, d } = RACK;
  const parts: THREE.BufferGeometry[] = [];
  const box = (bw: number, bh: number, bd: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(bw, bh, bd);
    g.translate(x, y, z);
    parts.push(g);
  };
  box(w, h, d, 0, h / 2, 0); // coque
  box(w + 0.02, 0.07, d + 0.02, 0, 0.035, 0); // socle
  box(w + 0.03, 0.04, d + 0.03, 0, h + 0.02, 0); // toit
  box(0.05, h - 0.1, 0.05, -w / 2 + 0.025, h / 2, d / 2 + 0.02); // montants
  box(0.05, h - 0.1, 0.05, w / 2 - 0.025, h / 2, d / 2 + 0.02);
  return mergeGeometries(parts)!;
}

function doorFrameGeometry(dw: number, dh: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (bw: number, bh: number, x: number, y: number) => {
    const g = new THREE.BoxGeometry(bw, bh, 0.03);
    g.translate(x, y, 0);
    parts.push(g);
  };
  const t = 0.05;
  box(t, dh, t / 2, 0);
  box(t, dh, dw - t / 2, 0);
  box(dw, t, dw / 2, dh / 2 - t / 2);
  box(dw, t, dw / 2, -dh / 2 + t / 2);
  // poignée
  box(0.025, 0.22, dw - 0.09, 0.05);
  return mergeGeometries(parts)!;
}

interface SledRef {
  instance: number;
  unitY: number;
  h: number;
  slides: boolean;
  order: number;
}

export class Racks {
  readonly group = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly doorFrames: THREE.InstancedMesh;
  private readonly doorPanels: THREE.InstancedMesh;
  private readonly sleds: THREE.InstancedMesh;
  private readonly decals: THREE.InstancedMesh;
  private readonly open: Float32Array;
  private readonly openTarget: Float32Array;
  private readonly sledRefs: SledRef[][] = [];
  private sledRack: Float32Array = new Float32Array(0);
  private readonly doorW = RACK.w - 0.08;
  private readonly doorH = RACK.h - 0.18;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly p = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);

  constructor(
    readonly specs: RackSpec[],
    uniforms: SharedUniforms,
  ) {
    const n = specs.length;
    this.open = new Float32Array(n);
    this.openTarget = new Float32Array(n);

    // ── coques ──
    const bodyGeo = bodyGeometry();
    const status = new Float32Array(n * 3);
    const pulse = new Float32Array(n);
    const rackIdx = new Float32Array(n);
    const col = new THREE.Color();
    specs.forEach((r, i) => {
      col.set(r.color);
      status.set([col.r, col.g, col.b], i * 3);
      pulse[i] = r.status === 'slot' ? 1 : 0;
      rackIdx[i] = r.index;
    });
    bodyGeo.setAttribute('aStatus', new THREE.InstancedBufferAttribute(status, 3));
    bodyGeo.setAttribute('aPulse', new THREE.InstancedBufferAttribute(pulse, 1));
    bodyGeo.setAttribute('aRack', new THREE.InstancedBufferAttribute(rackIdx, 1));
    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMaterial(uniforms), n);

    // ── portes ──
    const frameGeo = doorFrameGeometry(this.doorW, this.doorH);
    this.doorFrames = new THREE.InstancedMesh(
      frameGeo,
      new THREE.MeshStandardMaterial({ color: '#232a31', roughness: 0.4, metalness: 0.6 }),
      n,
    );
    const panelGeo = new THREE.PlaneGeometry(this.doorW - 0.08, this.doorH - 0.08);
    panelGeo.translate(this.doorW / 2, 0, 0);
    this.doorPanels = new THREE.InstancedMesh(
      panelGeo,
      new THREE.MeshStandardMaterial({
        color: '#2b333b',
        map: meshDoorTexture(),
        roughness: 0.35,
        metalness: 0.7,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      n,
    );
    this.doorPanels.renderOrder = 2;

    // ── serveurs ──
    let sledCount = 0;
    specs.forEach((r) => (sledCount += r.units.length));
    const sledGeo = new THREE.BoxGeometry(1, 1, 1);
    const aDims = new Float32Array(sledCount * 2);
    const aStyle = new Float32Array(sledCount);
    const aLed = new Float32Array(sledCount * 3);
    const aSeed = new Float32Array(sledCount);
    const aRack = new Float32Array(sledCount);
    let k = 0;
    const sledW = RACK.w - 0.16;
    specs.forEach((r) => {
      const refs: SledRef[] = [];
      let order = 0;
      r.units.forEach((u) => {
        aDims.set([sledW, u.h - 0.006], k * 2);
        aStyle[k] = u.style;
        col.set(u.led);
        aLed.set([col.r, col.g, col.b], k * 3);
        aSeed[k] = ((k * 0.6180339) % 1) + r.index * 0.013;
        aRack[k] = r.index;
        refs.push({ instance: k, unitY: u.y, h: u.h, slides: u.slides, order: u.slides ? order++ : -1 });
        k++;
      });
      this.sledRefs.push(refs);
    });
    sledGeo.setAttribute('aDims', new THREE.InstancedBufferAttribute(aDims, 2));
    sledGeo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(aStyle, 1));
    sledGeo.setAttribute('aLed', new THREE.InstancedBufferAttribute(aLed, 3));
    sledGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
    sledGeo.setAttribute('aRack', new THREE.InstancedBufferAttribute(aRack, 1));
    this.sledRack = aRack;
    this.sleds = new THREE.InstancedMesh(sledGeo, sledMaterial(uniforms), Math.max(1, sledCount));
    this.sleds.count = sledCount;

    // ── ombres de contact ──
    this.decals = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(RACK.w + 0.9, RACK.d + 0.9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#000000',
        alphaMap: softRectTexture(),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
      n,
    );
    this.decals.renderOrder = 1;

    specs.forEach((r, i) => {
      this.q.setFromAxisAngle(this.yAxis, r.rot);
      this.m.compose(this.p.set(r.x, 0, r.z), this.q, this.s.set(1, 1, 1));
      this.bodies.setMatrixAt(i, this.m);
      this.m.compose(this.p.set(r.x, 0.012, r.z), this.q, this.s.set(1, 1, 1));
      this.decals.setMatrixAt(i, this.m);
      this.writeDoor(i, 0);
      this.writeSleds(i, 0);
    });

    for (const mesh of [this.bodies, this.doorFrames, this.doorPanels, this.sleds, this.decals]) {
      mesh.frustumCulled = false; // une seule boîte englobante pour tout : on ne culle pas
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    this.bodies.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.decals.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  }

  /** Position locale → monde pour une baie. */
  private local(r: RackSpec, lx: number, ly: number, lz: number, out: THREE.Vector3) {
    const c = Math.cos(r.rot);
    const s = Math.sin(r.rot);
    return out.set(r.x + lx * c + lz * s, ly, r.z - lx * s + lz * c);
  }

  private writeDoor(i: number, t: number) {
    const r = this.specs[i];
    const angle = easeOutBack(clamp(t, 0, 1)) * 1.9;
    this.local(r, -this.doorW / 2, 0.09 + this.doorH / 2, RACK.d / 2 + 0.06, this.p);
    this.q.setFromAxisAngle(this.yAxis, r.rot - angle);
    this.m.compose(this.p, this.q, this.s.set(1, 1, 1));
    this.doorFrames.setMatrixAt(i, this.m);
    this.doorPanels.setMatrixAt(i, this.m);
  }

  private writeSleds(i: number, t: number) {
    const r = this.specs[i];
    const refs = this.sledRefs[i];
    const depth = 0.72;
    const reach = r.kind === 'skill' ? 0.5 : 0.32;
    this.q.setFromAxisAngle(this.yAxis, r.rot);
    for (const ref of refs) {
      let out = 0;
      if (ref.slides && t > 0) {
        const delay = ref.order * 0.045;
        out = smoothstep(0.15 + delay, 0.65 + delay, t) * reach;
        if (r.kind === 'project') out *= 0.35 + 0.65 * ((ref.order * 0.37) % 1);
      }
      this.local(r, 0, ref.unitY + ref.h / 2, RACK.d / 2 - depth / 2 + 0.014 + out, this.p);
      this.m.compose(this.p, this.q, this.s.set(RACK.w - 0.16, ref.h - 0.006, depth));
      this.sleds.setMatrixAt(ref.instance, this.m);
    }
  }

  setOpen(index: number, open: boolean) {
    if (index >= 0 && index < this.openTarget.length) this.openTarget[index] = open ? 1 : 0;
  }

  /** Ouvre/ferme en douceur ; ne réécrit que les baies en mouvement. */
  update(dt: number) {
    let doors = false;
    let sleds = false;
    for (let i = 0; i < this.open.length; i++) {
      const cur = this.open[i];
      const tgt = this.openTarget[i];
      if (Math.abs(cur - tgt) < 1e-4) continue;
      const speed = tgt > cur ? 1.6 : 2.6;
      const next = tgt > cur ? Math.min(tgt, cur + dt * speed) : Math.max(tgt, damp(cur, tgt, 7, dt) - dt * 0.2);
      this.open[i] = Math.abs(next - tgt) < 1e-3 ? tgt : next;
      this.writeDoor(i, this.open[i]);
      this.writeSleds(i, this.open[i]);
      doors = sleds = true;
    }
    if (doors) {
      this.doorFrames.instanceMatrix.needsUpdate = true;
      this.doorPanels.instanceMatrix.needsUpdate = true;
    }
    if (sleds) this.sleds.instanceMatrix.needsUpdate = true;
  }

  /**
   * Identifiant de l'élément visé par un rayon (clic / tap).
   * `undefined` = l'objet n'est pas une baie ; `null` = baie de décor non interactive.
   */
  itemAt(obj: THREE.Object3D, instanceId: number): string | null | undefined {
    if (obj === this.sleds) return this.specs[this.sledRack[instanceId]]?.itemId ?? null;
    if (obj === this.bodies || obj === this.doorFrames || obj === this.doorPanels || obj === this.decals) {
      return this.specs[instanceId]?.itemId ?? null;
    }
    return undefined;
  }
}
