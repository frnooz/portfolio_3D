import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type QualityLevel = 0 | 1 | 2;

/** Échelles de résolution dynamique, appliquées au pixel ratio natif plafonné. */
const SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
const DPR_CAP = 2;
/** Bloom : fraction de la résolution native (comme avant : 0.5 en qualité max, 0.35 sinon). */
const BLOOM_RES: Record<QualityLevel, number> = { 2: 0.5, 1: 0.35, 0: 0.35 };

// Budgets GPU (ms par image) : on vise 60 fps, jamais 120/144.
const BUDGET = 12.5; // cible quand on descend
const DOWN_MS = 14; // au-dessus, le 60 fps n'est plus tenu
const SEVERE_MS = 22; // sous ~45 fps : on réagit sans attendre
const UP_MS = 11.5; // on ne remonte que si le cran supérieur tient sous ce seuil
const TIER_MS = 2; // surcoût prudent d'un palier d'effets
const START_MS = 12; // calibrage : marge pour les vues les plus lourdes
const FIXED_MS = 1.2; // part du coût qui ne dépend pas de l'échelle (bloom calé sur le natif)
const ROOMY_IN = 4; // GPU sous ce temps : cadence native même à 144 Hz (hystérésis jusqu'à ROOMY_OUT)
const ROOMY_OUT = 6;
const PEAK_DECAY = 0.985; // mémoire de la vue la plus lourde (par seconde)
const FLOOR_DECAY = 0.996; // plancher issu du calibrage, oublié en quelques minutes

/**
 * Modèle de coût : part fixe + part variable ∝ pixels rendus (ms par mégapixel).
 * La part fixe est plafonnée à 15 % du coût mesuré (négligeable sur un gros GPU).
 */
const fixedPart = (ms: number) => Math.min(FIXED_MS, ms * 0.15);

const DIR_X = new THREE.Vector2(1, 0);
const DIR_Y = new THREE.Vector2(0, 1);

/**
 * Bloom « Unreal » de three r187 à l'identique (seuil, 5 niveaux de flou séparable,
 * composite pondéré) mais sans le mélange additif plein écran : le composite reste
 * dans sa petite cible et c'est la passe finale qui l'échantillonne.
 * Pas d'effacement des cibles : chaque passe réécrit tous ses pixels (≈ 0,35 ms gagnées sur iGPU).
 */
class Bloom {
  private readonly pass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.42, 0.78);
  private readonly quad = new FullScreenQuad();

  get texture() {
    return this.pass.renderTargetsHorizontal[0].texture;
  }

  set strength(v: number) {
    this.pass.strength = v;
  }

  setSize(w: number, h: number) {
    this.pass.setSize(Math.max(2, w), Math.max(2, h));
  }

  render(renderer: THREE.WebGLRenderer, input: THREE.Texture) {
    const p = this.pass;
    const q = this.quad;
    const oldAuto = renderer.autoClear;
    renderer.autoClear = false;

    // 1. zones lumineuses
    const hp = p.highPassUniforms as Record<string, THREE.IUniform>;
    hp.tDiffuse.value = input;
    hp.luminosityThreshold.value = p.threshold;
    q.material = p.materialHighPassFilter;
    renderer.setRenderTarget(p.renderTargetBright);
    q.render(renderer);

    // 2. flou progressif sur chaque niveau
    let src = p.renderTargetBright;
    for (let i = 0; i < p.nMips; i++) {
      const m = p.separableBlurMaterials[i];
      q.material = m;
      m.uniforms.colorTexture.value = src.texture;
      m.uniforms.direction.value = DIR_X;
      renderer.setRenderTarget(p.renderTargetsHorizontal[i]);
      q.render(renderer);
      m.uniforms.colorTexture.value = p.renderTargetsHorizontal[i].texture;
      m.uniforms.direction.value = DIR_Y;
      renderer.setRenderTarget(p.renderTargetsVertical[i]);
      q.render(renderer);
      src = p.renderTargetsVertical[i];
    }

    // 3. composite (reste en petite résolution)
    const c = p.compositeMaterial;
    c.uniforms.bloomStrength.value = p.strength;
    c.uniforms.bloomRadius.value = p.radius;
    c.uniforms.bloomTintColors.value = p.bloomTintColors;
    q.material = c;
    renderer.setRenderTarget(p.renderTargetsHorizontal[0]);
    q.render(renderer);
    renderer.autoClear = oldAuto;
  }
}

/**
 * Passe finale unique, dessinée directement dans le canvas :
 * aberration chromatique → + bloom → vignette → grain → ACES → sRGB.
 * Mêmes constantes et même ordre que l'ancienne chaîne (Finish + OutputPass).
 */
function finishMaterial(renderer: THREE.WebGLRenderer) {
  const defines: Record<string, string> = {};
  if (THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.SRGBTransfer) defines.SRGB_TRANSFER = '';
  if (renderer.toneMapping === THREE.ACESFilmicToneMapping) defines.ACES_FILMIC_TONE_MAPPING = '';
  return new THREE.RawShaderMaterial({
    name: 'Finish',
    defines,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: null },
      tBloom: { value: null },
      uTime: { value: 0 },
      uGrain: { value: 0.016 },
      uVignette: { value: 0.9 },
      uAberration: { value: 0.012 },
      toneMappingExposure: { value: 1 },
    },
    vertexShader: /* glsl */ `
      precision highp float;
      attribute vec3 position;
      attribute vec2 uv;
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tScene; uniform sampler2D tBloom;
      uniform float uTime; uniform float uGrain; uniform float uVignette; uniform float uAberration;
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec4 hdr(vec2 uv){ return texture2D(tScene, uv) + texture2D(tBloom, uv); }
      void main(){
        vec2 c = vUv - 0.5;
        float r2 = dot(c, c);
        vec2 off = c * r2 * uAberration;
        vec4 col = hdr(vUv);
        col.r = hdr(vUv + off).r;
        col.b = hdr(vUv - off).b;
        col.rgb *= 1.0 - r2 * uVignette;
        col.rgb += (h(vUv * 800.0 + fract(uTime * 13.0)) - 0.5) * uGrain;
        gl_FragColor = col;
        #ifdef ACES_FILMIC_TONE_MAPPING
          gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
        #endif
        #ifdef SRGB_TRANSFER
          gl_FragColor = sRGBTransferOETF(gl_FragColor);
        #endif
      }`,
  });
}

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

/** Chronomètre GPU asynchrone (EXT_disjoint_timer_query_webgl2) : ne bloque jamais. */
class GpuTimer {
  private readonly ext: TimerExt | null;
  private readonly free: WebGLQuery[] = [];
  private readonly pending: WebGLQuery[] = [];
  private running: WebGLQuery | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  }

  get available() {
    return this.ext !== null;
  }

  begin(): boolean {
    const { gl, ext } = this;
    if (!ext || this.running || this.pending.length >= 6) return false;
    // un autre chronomètre est déjà actif (outil de mesure externe) : on s'efface
    if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return false;
    const q = this.free.pop() ?? gl.createQuery();
    if (!q) return false;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.running = q;
    return true;
  }

  end() {
    if (!this.running || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.running);
    this.running = null;
  }

  /** Relève les mesures prêtes (en général 1 à 3 images plus tard). */
  poll(out: (ms: number) => void) {
    const { gl, ext } = this;
    if (!ext || !this.pending.length) return;
    // horloge GPU perturbée (changement de fréquence…) : les mesures en vol sont fausses
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!disjoint && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) out((gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6);
      this.free.push(q);
    }
  }

  get busy() {
    return this.pending.length > 0;
  }
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

/**
 * Chaîne de rendu + qualité adaptative.
 *
 * Rendu : scène → cible HDR (demi-flottants) → bloom en petite résolution → une seule passe
 * plein écran vers le canvas (aberration, bloom, vignette, grain, ACES, sRGB). La scène n'est
 * jamais rendue directement dans le canvas : changer de qualité ne recompile aucun shader.
 *
 * Qualité : d'abord la résolution (échelle dynamique du pixel ratio, le navigateur
 * agrandit le canvas gratuitement), puis, une fois au plancher, les paliers d'effets :
 *   2 : tout
 *   1 : bloom calculé en plus basse résolution
 *   0 : + cônes de lumière, brume et poussière coupés
 * Le bloom reste actif à tous les paliers : c'est l'identité visuelle de la salle.
 */
export class Post {
  level: QualityLevel;
  onChange?: (level: QualityLevel, pixelRatio: number) => void;
  onStruggle?: () => void;
  /** Chaque mesure GPU (ms) — utilisé par les outils de bench. */
  onGpuTime: ((ms: number) => void) | null = null;
  /** Chronométrage GPU interne (les outils de profilage le coupent pour poser le leur). */
  gpuTiming = true;
  /** Dernière fenêtre de mesure. */
  readonly stats = { fps: 0, gpu: 0, peak: 0 };
  /**
   * GPU mesuré très en dessous d'une image à 144 Hz : inutile de plafonner la cadence
   * (voir `Experience.frameCap`). Faux sans chronomètre GPU : on ne voit pas la marge.
   */
  roomy = false;

  private readonly hdr: THREE.WebGLRenderTarget;
  private readonly bloom = new Bloom();
  private readonly finish: THREE.RawShaderMaterial;
  private readonly quad: FullScreenQuad;
  private timer: GpuTimer;
  private si = 0;
  private scaleValue = 1;
  private w = 1;
  private h = 1;
  private readonly size = new THREE.Vector2();

  // adaptation
  private locked = false;
  private calibrating = false;
  private readonly samples: number[] = [];
  private winStart = 0;
  private winFrames = 0;
  private winMs = 0;
  private lastFrame = 0;
  private holdUntil = 0;
  private upAfter = 0;
  private bad = 0;
  private good = 0;
  private slow = 0;
  private stableSince = 0;
  private probeDelay = 8000;
  private probe: { level: QualityLevel; si: number; windows: number } | null = null;
  /** Vue la plus lourde rencontrée (ms par mégapixel), oubliée lentement. */
  private peakV = 0;
  private peakFloor = 0;
  private fixed = FIXED_MS;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private camera: THREE.Camera,
    initial: QualityLevel,
  ) {
    this.level = initial;
    // demi-flottants : les flottants compacts R11G11B10 seraient plus rapides mais tronquent
    // les valeurs (~1 %), assez pour faire passer certains néons sous le seuil du bloom
    this.hdr = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
    this.hdr.texture.name = 'Post.hdr';
    this.finish = finishMaterial(renderer);
    this.finish.uniforms.tScene.value = this.hdr.texture;
    this.finish.uniforms.tBloom.value = this.bloom.texture;
    this.quad = new FullScreenQuad(this.finish);
    this.timer = new GpuTimer(renderer.getContext() as WebGL2RenderingContext);

    // perte du contexte WebGL : three recrée ses ressources, on repart avec un chronomètre neuf
    const canvas = renderer.domElement;
    canvas.addEventListener('webglcontextrestored', () => {
      this.timer = new GpuTimer(renderer.getContext() as WebGL2RenderingContext);
      this.resetWindow(performance.now(), 2000);
    });
    document.addEventListener('visibilitychange', () => this.resetWindow(performance.now(), 1000));
  }

  /** Échelle de résolution courante (1 = natif plafonné). */
  get scale() {
    return this.scaleValue;
  }

  /** Pixel ratio natif plafonné, sans l'échelle dynamique. */
  get nativeRatio() {
    return Math.min(window.devicePixelRatio || 1, DPR_CAP);
  }

  /** Pixel ratio réellement rendu. */
  get pixelRatio() {
    return this.nativeRatio * this.scaleValue;
  }

  /** Alias historique. */
  get dpr() {
    return this.pixelRatio;
  }

  /** Mégapixels rendus à l'échelle 1 : le modèle suit la taille de la fenêtre et la densité d'écran. */
  private get nativeMP() {
    const n = this.nativeRatio;
    return Math.max(0.01, (this.w * n * this.h * n) / 1e6);
  }

  /** Coût variable (ms par mégapixel) déduit d'une mesure à l'échelle `scale`. */
  private perMP(ms: number, scale: number) {
    return (ms - fixedPart(ms)) / (this.nativeMP * scale * scale);
  }

  private predict(v: number, fixed: number, scale: number) {
    return fixed + v * this.nativeMP * scale * scale;
  }

  /** Plus grande échelle dont le coût estimé tient sous `ms`. */
  private fit(v: number, ms: number) {
    let si = 0;
    while (si < SCALES.length - 1 && this.predict(v, this.fixed, SCALES[si]) > ms) si++;
    return si;
  }

  /** Accentue le bloom (allumage de la salle, ping…). */
  set bloomBoost(v: number) {
    this.bloom.strength = 0.6 + v;
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    // le canvas est réalloué de toute façon : on reprend l'échelle adaptée à la nouvelle taille
    if (!this.locked && !this.calibrating && this.peakV > 0) {
      const si = this.fit(this.peakV, START_MS);
      if (si !== this.si) return this.set(this.level, si);
    }
    this.applySize();
    this.resetWindow(performance.now(), 1000);
  }

  /** Redimensionnement bon marché : canvas + cibles, aucun shader recompilé. */
  private applySize() {
    const r = this.renderer;
    const pr = this.pixelRatio;
    const cw = Math.max(1, Math.floor(this.w * pr));
    const ch = Math.max(1, Math.floor(this.h * pr));
    const canvas = r.domElement;
    // une seule réallocation du canvas (setPixelRatio + setSize en feraient deux)
    if (canvas.width !== cw || canvas.height !== ch || r.getPixelRatio() !== pr) r.setDrawingBufferSize(this.w, this.h, pr);
    r.getDrawingBufferSize(this.size);
    this.hdr.setSize(this.size.x, this.size.y);
    // le bloom suit la résolution native (pas l'échelle dynamique) : halo identique à toute échelle
    const s = BLOOM_RES[this.level];
    const n = this.nativeRatio;
    this.bloom.setSize(Math.round(this.w * n * s), Math.round(this.h * n * s));
  }

  /** Fige la qualité (bench, captures) : palier + échelle. */
  lock(level: QualityLevel, scale = 1) {
    this.locked = true;
    this.level = level;
    this.scaleValue = scale;
    let si = 0;
    while (si < SCALES.length - 1 && SCALES[si] > scale + 1e-6) si++;
    this.si = si;
    this.applySize();
    this.onChange?.(level, this.pixelRatio);
  }

  unlock() {
    this.locked = false;
    this.set(this.level, this.si);
  }

  /**
   * Image volontairement non rendue (plan ouvert…) : ni mesure ni décision pendant `ms`,
   * sinon ces trous passeraient pour des chutes de cadence.
   */
  hold(ms = 400) {
    this.resetWindow(performance.now(), ms);
  }

  /** Début de la boucle : laisse chauffer, et pas de montée en qualité pendant l'intro. */
  begin(introSeconds: number) {
    const now = performance.now();
    this.resetWindow(now, 1200);
    this.upAfter = now + introSeconds * 1000 + 1500;
  }

  // ── rendu ──────────────────────────────────────────────

  render(_dt: number, t: number) {
    const timed = this.gpuTiming && this.timer.begin();
    this.draw(t);
    if (timed) this.timer.end();
    this.timer.poll(this.onSample);
    if (!this.calibrating) this.adapt(performance.now());
  }

  private draw(t: number) {
    this.drawScene();
    this.drawBloom();
    this.drawFinal(t);
  }

  /** Étapes séparées : le profileur peut les chronométrer une par une. */
  drawScene() {
    this.renderer.setRenderTarget(this.hdr);
    this.renderer.render(this.scene, this.camera);
  }

  drawBloom() {
    this.bloom.render(this.renderer, this.hdr.texture);
  }

  drawFinal(t: number) {
    const r = this.renderer;
    const u = this.finish.uniforms;
    u.uTime.value = t;
    u.toneMappingExposure.value = r.toneMappingExposure;
    r.setRenderTarget(null);
    // le triangle couvre tout le canvas : effacer avant coûterait ~0,7 ms pour rien sur iGPU
    r.autoClear = false;
    this.quad.render(r);
    r.autoClear = true;
  }

  /**
   * Les shaders de la scène doivent être compilés pour la cible HDR (pas pour le canvas),
   * y compris ceux des objets encore cachés (bras du robot…) : aucune compilation en cours de visite.
   */
  async compile() {
    const r = this.renderer;
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        o.visible = true;
        hidden.push(o);
      }
    });
    r.setRenderTarget(this.hdr);
    const done = r.compileAsync(this.scene, this.camera);
    r.setRenderTarget(null);
    for (const o of hidden) o.visible = false;
    await done;
    // textures envoyées au GPU pendant le boot, pas à leur première apparition (CV, marquages au sol…)
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] | undefined;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) for (const tex of [mat.map, mat.alphaMap]) if (tex) r.initTexture(tex);
    });
    this.draw(0); // bloom + passe finale
  }

  private onSample = (ms: number) => {
    this.samples.push(ms);
    this.onGpuTime?.(ms);
  };

  // ── calibrage (écran de boot) ──────────────────────────

  /**
   * Rend quelques images sous l'écran de boot et choisit l'échelle de départ,
   * pour que les GPU modestes n'aient jamais à redescendre après l'intro.
   * `views` : poses de caméra représentatives, la plus lourde fait foi.
   */
  async calibrate(views: (() => void)[]): Promise<{ ms: number; width: number; height: number }> {
    this.calibrating = true;
    const deadline = performance.now() + 2500;
    try {
      this.set(2, 0, false);
      let worst = 0;
      let heaviest = views[0];
      for (const [i, v] of views.entries()) {
        v();
        const ms = await this.measure(8, i === 0 ? 4 : 2, deadline);
        if (ms > worst) {
          worst = ms;
          heaviest = v;
        }
      }
      this.fixed = fixedPart(worst);
      let pv = this.perMP(worst, 1);
      // plus grande échelle qui tient dans le budget
      let si = this.fit(pv, START_MS);
      let level: QualityLevel = 2;
      heaviest();
      // vérification à l'échelle choisie, sur la vue la plus lourde
      for (let k = 0; si > 0 && k < 4 && performance.now() < deadline; k++) {
        this.set(level, si, false);
        const ms = await this.measure(6, 2, deadline);
        worst = ms;
        pv = Math.max(pv, this.perMP(ms, SCALES[si]));
        if (ms <= START_MS * 1.1) break;
        if (si < SCALES.length - 1) si++;
        else if (level > 0) level = (level - 1) as QualityLevel;
        else break;
      }
      this.set(level, si, false);
      this.roomy = this.timer.available && this.gpuTiming && worst < ROOMY_IN;
      // la boucle ne remontera pas au-delà de ce que la vue la plus lourde permet
      this.peakV = pv;
      this.peakFloor = pv * 0.85;
      return { ms: worst, width: this.size.x, height: this.size.y };
    } finally {
      this.calibrating = false;
      this.samples.length = 0;
      this.onChange?.(this.level, this.pixelRatio);
    }
  }

  /** Temps GPU médian d'une image (chronomètre GPU, sinon synchronisation explicite). */
  private async measure(frames: number, warmup: number, deadline: number): Promise<number> {
    const gl = this.renderer.getContext();
    const px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const useTimer = this.timer.available && this.gpuTiming;
    const got: number[] = [];
    let skip = warmup;
    const collect = (ms: number) => {
      if (skip > 0) skip--;
      else got.push(ms);
    };
    for (let i = 0; i < frames + warmup; i++) {
      await nextFrame();
      if (useTimer) {
        const ok = this.timer.begin();
        this.draw(0);
        if (ok) this.timer.end();
        this.timer.poll(collect);
      } else {
        sync();
        const t0 = performance.now();
        this.draw(0);
        sync();
        collect(performance.now() - t0);
      }
      if (performance.now() > deadline && got.length >= 2) break;
    }
    // les dernières mesures arrivent quelques images plus tard
    for (let k = 0; k < 8 && useTimer && this.timer.busy; k++) {
      await nextFrame();
      this.timer.poll(collect);
    }
    if (!got.length) {
      // pas de résultat exploitable du chronomètre : mesure synchrone
      sync();
      const t0 = performance.now();
      this.draw(0);
      sync();
      return performance.now() - t0;
    }
    return median(got);
  }

  // ── adaptation continue ────────────────────────────────

  private set(level: QualityLevel, si: number, notify = true) {
    this.level = level;
    this.si = si;
    this.scaleValue = SCALES[si];
    this.applySize();
    const now = performance.now();
    this.bad = this.good = 0;
    this.stableSince = now;
    // au moins 2 s entre deux changements ; la fenêtre suivante est ignorée
    this.resetWindow(now, 2000);
    if (notify) this.onChange?.(level, this.pixelRatio);
  }

  private resetWindow(now: number, hold = 0) {
    this.winStart = now;
    this.winFrames = 0;
    this.winMs = 0;
    this.lastFrame = now;
    this.samples.length = 0;
    if (hold) this.holdUntil = Math.max(this.holdUntil, now + hold);
  }

  private adapt(now: number) {
    if (document.hidden) return;
    const gap = now - this.lastFrame;
    this.lastFrame = now;
    if (gap > 250) {
      // pause, onglet caché, débogueur… : on ne juge pas là-dessus
      this.resetWindow(now);
      return;
    }
    this.winFrames++;
    this.winMs += gap;
    if (now - this.winStart < 1000) return;
    const fps = (this.winFrames * 1000) / Math.max(1, this.winMs);
    const gpu = this.samples.length >= 5 ? median(this.samples) : null;
    this.stats.fps = fps;
    this.stats.gpu = gpu ?? 0;
    if (gpu !== null) this.roomy = gpu < (this.roomy ? ROOMY_OUT : ROOMY_IN);
    this.resetWindow(now);
    if (this.locked || now < this.holdUntil) return;
    this.decide(fps, gpu, now);
  }

  private decide(fps: number, gpu: number | null, now: number) {
    const floor = this.si >= SCALES.length - 1;

    // même au plus bas (ou limité par le processeur), ça ne suit pas : on propose la version classique
    if (fps < 28 && ((floor && this.level === 0) || (gpu !== null && gpu < DOWN_MS))) {
      if (++this.slow === 3) this.onStruggle?.();
    } else if (this.slow < 3) this.slow = 0;

    // coût d'une image à la résolution actuelle, et diagnostic
    let cost: number;
    let over: boolean;
    let severe: boolean;
    let measured: boolean; // le coût est-il visible (pas masqué par la synchro écran) ?
    if (gpu !== null) {
      cost = gpu;
      over = gpu > DOWN_MS;
      severe = gpu > SEVERE_MS;
      measured = true;
    } else {
      // sans chronomètre GPU on ne voit que l'intervalle entre images (plafonné par l'écran)
      cost = 1000 / fps;
      over = fps < 52;
      severe = fps < 38;
      measured = over || fps > 75;
    }
    // mémoire de la vue la plus lourde : on ne remonte pas pour redescendre trois pas plus loin
    this.peakFloor *= FLOOR_DECAY;
    this.peakV = Math.max(measured ? this.perMP(cost, this.scaleValue) : 0, this.peakFloor, this.peakV * PEAK_DECAY);
    this.stats.peak = this.peakV;
    this.bad = over ? this.bad + 1 : 0;

    // essai de montée en cours (mode fps) : on confirme ou on revient en arrière
    if (this.probe) {
      if (over) {
        const back = this.probe;
        this.probe = null;
        this.probeDelay = Math.min(this.probeDelay * 2, 120000);
        this.set(back.level, back.si);
        this.upAfter = now + this.probeDelay;
        return;
      }
      if (++this.probe.windows >= 2) {
        this.probe = null;
        this.stableSince = now;
      }
      return;
    }

    if (severe || this.bad >= 2) {
      this.stepDown(cost, this.peakV);
      this.upAfter = Math.max(this.upAfter, now + 15000); // pas de va-et-vient
      return;
    }
    if (over || now < this.upAfter) {
      this.good = 0;
      if (fps < 57) this.stableSince = now;
      return;
    }

    // montée : les paliers d'effets ne baissent qu'au plancher, on les rétablit donc d'abord
    const up = this.level < 2 ? { level: (this.level + 1) as QualityLevel, si: this.si } : this.si > 0 ? { level: this.level, si: this.si - 1 } : null;
    if (!up) return;
    // estimation pour la vue la plus lourde récente, pas seulement pour celle-ci
    const predicted = this.predict(this.peakV, this.fixed, SCALES[up.si]) + (up.level !== this.level ? TIER_MS : 0);
    if (gpu !== null || fps > 75) {
      // coût visible (chronomètre GPU, ou écran > 60 Hz) : on remonte s'il y a de la marge
      this.good = predicted <= UP_MS ? this.good + 1 : 0;
      if (this.good >= 3) this.set(up.level, up.si);
    } else if (fps >= 57) {
      // plafonné par la synchro écran : on tente un cran au-dessus, prudemment
      if (predicted <= DOWN_MS && now - this.stableSince >= this.probeDelay) {
        this.probe = { level: this.level, si: this.si, windows: 0 };
        this.set(up.level, up.si);
      }
    } else this.stableSince = now;
  }

  private stepDown(cost: number, v: number) {
    if (this.si < SCALES.length - 1) {
      // vise directement le budget plutôt que de descendre cran par cran
      const fixed = fixedPart(cost);
      let si = this.si + 1;
      while (si < SCALES.length - 1 && this.predict(v, fixed, SCALES[si]) > BUDGET) si++;
      this.set(this.level, si);
    } else if (this.level > 0) this.set((this.level - 1) as QualityLevel, this.si);
  }
}
