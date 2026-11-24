import * as THREE from 'three';

/**
 * Écran animé dessiné en Canvas 2D (moniteurs du NOC, CRT legacy…).
 * Rafraîchi à fréquence réduite (quelques images/s) : un écran n'a pas besoin de 60 fps.
 */
export class ScreenTexture {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private acc = 0;
  private t = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly draw: (g: CanvasRenderingContext2D, t: number, w: number, h: number) => void,
    public fps = 8,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.draw(this.ctx, 0, width, height);
  }

  /** Budget partagé par tous les écrans : au plus un redessiné (canvas + envoi GPU + mipmaps) par image. */
  private static budget = 1;

  /** À appeler une fois par image, avant les `update` des écrans. */
  static beginFrame() {
    ScreenTexture.budget = 1;
  }

  /**
   * `canDraw` à faux (hors champ) : le temps avance mais on ne redessine ni ne renvoie rien au GPU.
   * Un écran dû attend une image libre (1 ou 2 images de retard au pire, invisible à 4–10 i/s).
   * Renvoie vrai si l'écran a été redessiné.
   */
  update(dt: number, canDraw = true): boolean {
    this.t += dt;
    this.acc += dt;
    const period = 1 / this.fps;
    if (!canDraw || this.acc < period || ScreenTexture.budget <= 0) return false;
    ScreenTexture.budget--;
    // phase conservée (pas de remise à zéro) : cadence nominale tenue, et deux écrans de même
    // cadence ne retombent plus sur la même image ; retour dans le champ après une absence : on repart de zéro
    this.acc = this.acc > period * 3 ? 0 : Math.min(this.acc - period, period);
    this.draw(this.ctx, this.t, this.width, this.height);
    this.texture.needsUpdate = true;
    return true;
  }

  /** Matériau « écran » : non éclairé, assez lumineux pour déclencher le bloom. */
  material(intensity = 1.6): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    m.color.setScalar(intensity);
    return m;
  }
}

/** Texte peint au sol / sur un panneau (canvas statique). */
export function textTexture(
  lines: { text: string; font: string; color: string; y: number; x?: number; align?: CanvasTextAlign }[],
  w: number,
  h: number,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  for (const l of lines) {
    g.font = l.font;
    g.fillStyle = l.color;
    g.textAlign = l.align ?? 'left';
    g.textBaseline = 'middle';
    g.fillText(l.text, l.x ?? 0, l.y);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Les polices web doivent être prêtes avant de peindre du texte dans un canvas. */
export const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';
export const FONT_DISPLAY = '"Archivo Variable", "Archivo", "Arial Narrow", sans-serif';
