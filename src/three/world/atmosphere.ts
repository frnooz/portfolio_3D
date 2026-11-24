import * as THREE from 'three';
import type { Layout } from './layout';
import { PROJECT_ROW_Z, RACK, SKILL_ROW_Z } from './layout';
import type { SharedUniforms } from './racks';

/** Rangées de néons : z de l'allée, couleur, et si c'est l'allée chaude. */
export function lightRows(layout: Layout) {
  const aisleA = (PROJECT_ROW_Z + RACK.d / 2 + (SKILL_ROW_Z - RACK.d / 2)) / 2;
  const aisleB = SKILL_ROW_Z + RACK.d / 2 + 2.1;
  const hot = (PROJECT_ROW_Z - RACK.d / 2 + layout.room.minZ + 1.6) / 2;
  return [
    { z: aisleA, color: new THREE.Color('#cfe9ff'), hot: false },
    { z: aisleB, color: new THREE.Color('#cfe9ff'), hot: false },
    { z: hot, color: new THREE.Color('#ffb36b'), hot: true },
  ];
}
export const LIGHT_SPACING = 2.6;

/**
 * Tout ce qui flotte dans l'air :
 *  - néons suspendus + cônes de lumière volumétriques (faux, additifs, 1 draw call)
 *  - poussière qui dérive dans les faisceaux (Points, animés 100 % GPU)
 *  - brume froide qui s'échappe des dalles perforées
 */
export class Atmosphere {
  readonly group = new THREE.Group();
  private readonly cones: THREE.InstancedMesh;
  private readonly dust: THREE.Points;
  private readonly mist: THREE.InstancedMesh;
  private readonly tubes: THREE.InstancedMesh;
  private readonly tubeMat: THREE.ShaderMaterial;

  constructor(layout: Layout, private readonly u: SharedUniforms) {
    const rows = lightRows(layout);
    const xs: number[] = [];
    for (let x = -layout.rowHalf + 1.1; x <= layout.rowHalf - 1.1 + 1e-3; x += LIGHT_SPACING) xs.push(x);
    const n = rows.length * xs.length;
    const Y = 3.55;

    // ── tubes néon ──
    this.tubeMat = new THREE.ShaderMaterial({
      uniforms: { ...u },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        varying vec3 vColor;
        varying vec3 vW;
        void main(){
          vColor = aColor;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uPowerRadius; uniform vec2 uPowerOrigin; uniform float uTime;
        varying vec3 vColor; varying vec3 vW;
        void main(){
          // salle allumée (999) : on = flick = 1 exactement, rien d'autre à calculer
          if (uPowerRadius > 500.0) { gl_FragColor = vec4(vColor * 1.05, 1.0); return; }
          float d = distance(vW.xz, uPowerOrigin);
          float on = smoothstep(uPowerRadius, uPowerRadius - 1.5, d);
          // scintillement de néon à l'allumage
          float flick = mix(step(0.5, fract(sin(floor(uTime * 24.0) + vW.x * 7.0) * 437.0)), 1.0, smoothstep(uPowerRadius - 1.5, uPowerRadius - 4.0, d));
          gl_FragColor = vec4(vColor * 1.05 * on * flick, 1.0);
        }`,
    });
    const tubeGeo = new THREE.BoxGeometry(1.0, 0.03, 0.06);
    const tubeCol = new Float32Array(n * 3);
    this.tubes = new THREE.InstancedMesh(tubeGeo, this.tubeMat, n);

    // ── cônes volumétriques ──
    const coneGeo = new THREE.CylinderGeometry(0.35, 1.5, Y, 20, 1, true);
    coneGeo.translate(0, -Y / 2, 0);
    const coneCol = new Float32Array(n * 3);
    const coneMat = new THREE.ShaderMaterial({
      uniforms: { ...u },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        varying vec3 vColor;
        varying float vH;
        varying float vFres;
        varying vec3 vW;
        void main(){
          vColor = aColor;
          vH = -position.y / ${Y.toFixed(2)};
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vec3 v = normalize(cameraPosition - w.xyz);
          vFres = pow(abs(dot(n, v)), 1.6);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uPowerRadius; uniform vec2 uPowerOrigin; uniform float uTime;
        varying vec3 vColor; varying float vH; varying float vFres; varying vec3 vW;
        void main(){
          float on = 1.0; // salle allumée (999) : exactement 1
          if (uPowerRadius < 500.0) on = smoothstep(uPowerRadius - 1.0, uPowerRadius - 4.0, distance(vW.xz, uPowerOrigin));
          float a = (1.0 - vH) * (1.0 - vH) * vFres * 0.045;
          a *= 0.9 + 0.1 * sin(uTime * 0.8 + vW.x);
          gl_FragColor = vec4(vColor * a * on, 1.0);
        }`,
    });
    this.cones = new THREE.InstancedMesh(coneGeo, coneMat, n);

    const m = new THREE.Matrix4();
    let i = 0;
    for (const r of rows) {
      for (const x of xs) {
        m.makeTranslation(x, Y, r.z);
        this.tubes.setMatrixAt(i, m);
        this.cones.setMatrixAt(i, m);
        tubeCol.set([r.color.r, r.color.g, r.color.b], i * 3);
        coneCol.set([r.color.r * (r.hot ? 1.1 : 0.85), r.color.g * (r.hot ? 0.7 : 0.95), r.color.b * (r.hot ? 0.5 : 1.0)], i * 3);
        i++;
      }
    }
    tubeGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(tubeCol, 3));
    coneGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(coneCol, 3));
    this.cones.renderOrder = 5;
    this.cones.frustumCulled = false;
    this.tubes.frustumCulled = false;

    // ── poussière ──
    const COUNT = 700;
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    const { minX, maxX, minZ, maxZ } = layout.room;
    for (let k = 0; k < COUNT; k++) {
      pos[k * 3] = minX + Math.random() * (maxX - minX);
      pos[k * 3 + 1] = Math.random() * 3.4;
      pos[k * 3 + 2] = minZ + Math.random() * (maxZ - minZ);
      seed[k] = Math.random();
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const lightZ = rows.map((r) => r.z);
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.ShaderMaterial({
        uniforms: { ...u, uPixel: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uPixel;
          attribute float aSeed;
          varying float vA;
          void main(){
            vec3 p = position;
            float t = uTime * (0.05 + aSeed * 0.08);
            p.x += sin(t * 3.0 + aSeed * 40.0) * 0.6;
            p.y = mod(p.y + t * 0.6, 3.4);
            p.z += cos(t * 2.0 + aSeed * 23.0) * 0.6;
            // plus lumineuse dans les faisceaux des néons
            float beam = 0.0;
            float dz;
            // dz * dz plutôt que pow(dz, 2.0) : pow d'un nombre négatif est indéfini en GLSL ES
            ${lightZ.map((z) => `dz = p.z - (${z.toFixed(2)}); beam = max(beam, exp(-dz * dz * 0.6));`).join('\n')}
            float sx = fract(p.x / ${LIGHT_SPACING.toFixed(2)} + 0.5) - 0.5;
            beam *= exp(-sx * sx * 9.0);
            vA = (0.12 + beam * 0.9) * smoothstep(0.0, 0.4, p.y) * smoothstep(3.4, 2.6, p.y);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = uPixel * (1.4 + aSeed * 2.2) * (14.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(vec3(0.8, 0.9, 1.0) * vA * smoothstep(0.5, 0.0, d), 1.0);
          }`,
      }),
    );
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 6;

    // ── brume froide au ras du sol, devant les baies ──
    const mistGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mistMat = new THREE.ShaderMaterial({
      uniforms: { ...u },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vW;
        void main(){
          vUv = uv;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uPowerRadius; uniform vec2 uPowerOrigin;
        varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          vec2 p = vW.xz * 0.9 + vec2(uTime * 0.07, -uTime * 0.11);
          float f = n(p) * 0.6 + n(p * 2.3 - uTime * 0.05) * 0.4;
          float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          float on = 1.0; // salle allumée (999) : exactement 1
          if (uPowerRadius < 500.0) on = smoothstep(uPowerRadius, uPowerRadius - 3.0, distance(vW.xz, uPowerOrigin));
          float a = smoothstep(0.35, 0.9, f) * edge * 0.09 * on;
          gl_FragColor = vec4(vec3(0.45, 0.8, 1.0) * a, 1.0);
        }`,
    });
    const mistZs = [PROJECT_ROW_Z + RACK.d / 2 + 0.8, SKILL_ROW_Z + RACK.d / 2 + 0.8];
    const layers = [0.08, 0.32];
    this.mist = new THREE.InstancedMesh(mistGeo, mistMat, mistZs.length * layers.length);
    let k = 0;
    const s = new THREE.Vector3(layout.rowHalf * 2 + 1, 1, 2.2);
    for (const z of mistZs) {
      for (const y of layers) {
        m.compose(new THREE.Vector3(0, y, z), new THREE.Quaternion(), s);
        this.mist.setMatrixAt(k++, m);
      }
    }
    this.mist.renderOrder = 4;
    this.mist.frustumCulled = false;

    this.group.add(this.tubes, this.cones, this.dust, this.mist);
  }

  /** Les effets les plus coûteux (overdraw) se coupent en qualité basse. */
  setQuality(level: 0 | 1 | 2, pixelRatio: number) {
    this.cones.visible = level >= 1;
    this.mist.visible = level >= 1;
    this.dust.visible = level >= 1;
    (this.dust.material as THREE.ShaderMaterial).uniforms.uPixel.value = pixelRatio;
  }

  get uniforms() {
    return this.u;
  }
}
