import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Finition « caméra » : vignette, grain, léger décalage chromatique sur les bords. */
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uGrain: { value: 0.016 },
    uVignette: { value: 0.9 },
    uAberration: { value: 0.012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVignette; uniform float uAberration;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uAberration;
      vec4 col = texture2D(tDiffuse, vUv);
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col.rgb *= 1.0 - r2 * uVignette;
      col.rgb += (h(vUv * 800.0 + fract(uTime * 13.0)) - 0.5) * uGrain;
      gl_FragColor = col;
    }`,
};

export type QualityLevel = 0 | 1 | 2;

/**
 * Chaîne de rendu + qualité adaptative.
 *   2 : bloom + finition, DPR jusqu'à 2
 *   1 : bloom demi-résolution, DPR 1.5
 *   0 : rendu direct, DPR 1 (mobiles modestes)
 * On mesure les fps en continu et on descend d'un cran si ça rame.
 */
export class Post {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly finish: ShaderPass;
  level: QualityLevel;
  private frames = 0;
  private acc = 0;
  private settle = 3; // on laisse le temps aux shaders de compiler
  private lowStrikes = 0;
  onChange?: (level: QualityLevel, dpr: number) => void;
  onStruggle?: () => void;
  private w = 1;
  private h = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private camera: THREE.Camera,
    initial: QualityLevel,
  ) {
    this.level = initial;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.42, 0.78);
    this.composer.addPass(this.bloom);
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());
  }

  get dpr() {
    const max = this.level === 2 ? 2 : this.level === 1 ? 1.5 : 1;
    return Math.min(window.devicePixelRatio || 1, max);
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const dpr = this.dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    // le bloom n'a pas besoin de la pleine résolution
    const s = this.level === 2 ? 0.5 : 0.35;
    this.bloom.resolution.set(w * s, h * s);
    this.bloom.setSize(Math.round(w * dpr * s), Math.round(h * dpr * s));
  }

  setLevel(level: QualityLevel) {
    if (level === this.level) return;
    this.level = level;
    this.setSize(this.w, this.h);
    this.onChange?.(level, this.dpr);
  }

  /** Accentue le bloom (allumage de la salle, ping…). */
  set bloomBoost(v: number) {
    this.bloom.strength = 0.6 + v;
  }

  render(dt: number, t: number) {
    this.finish.uniforms.uTime.value = t;
    if (this.level === 0) this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
    this.measure(dt);
  }

  private measure(dt: number) {
    if (document.hidden) return;
    this.acc += dt;
    this.frames++;
    if (this.acc < 2) return;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    if (fps < 42 && this.level > 0) {
      this.setLevel((this.level - 1) as QualityLevel);
      this.settle = 1;
    } else if (fps < 24 && this.level === 0) {
      if (++this.lowStrikes === 2) this.onStruggle?.();
    }
  }
}
