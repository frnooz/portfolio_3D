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

  update(dt: number) {
    this.t += dt;
    this.acc += dt;
    if (this.acc < 1 / this.fps) return;
    this.acc = 0;
    this.draw(this.ctx, this.t, this.width, this.height);
    this.texture.needsUpdate = true;
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
