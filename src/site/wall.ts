/**
 * Mur de baies du hero (Canvas 2D, décoratif).
 * Les baies (cadres, serveurs 1U) sont dessinées une fois dans un calque hors écran ;
 * chaque image ne redessine que les LEDs, à 30 i/s (20 sur mobile).
 * Pause hors écran (IntersectionObserver), onglet caché et bouton « Animations ».
 * La parallaxe déplace le canvas en transform (composité), jamais son contenu.
 */

interface Led {
  x: number;
  y: number;
  c: number;
  rate: number;
  phase: number;
  duty: number;
}

const rand = (seed: number) => {
  const s = Math.sin(seed * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

export class Wall {
  private readonly g: CanvasRenderingContext2D;
  private readonly layer = document.createElement('canvas');
  private leds: Led[] = [];
  private colors: string[] = [];
  private W = 0;
  private H = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private running = false;
  private visible = true;
  private enabled = true;
  private mx = 0;
  private my = 0;
  private px = 0;
  private py = 0;
  private readonly lite = window.matchMedia('(max-width: 47.99em), (pointer: coarse)').matches;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d', { alpha: true })!;
    this.layout();
    let t = 0;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        this.layout();
        this.draw(this.last / 1000);
      }, 150);
    });
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      this.layout();
      this.draw(this.last / 1000);
    });
  }

  private css(name: string): string {
    // lu sur le canvas lui-même : il hérite des jetons de sa zone (le hero reste sombre en thème clair)
    return getComputedStyle(this.canvas).getPropertyValue(name).trim() || '#888';
  }

  layout(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, this.lite ? 1.5 : 2);
    this.W = Math.max(1, Math.round(r.width));
    this.H = Math.max(1, Math.round(r.height));
    for (const c of [this.canvas, this.layer]) {
      c.width = Math.round(this.W * this.dpr);
      c.height = Math.round(this.H * this.dpr);
    }
    this.colors = [this.css('--led-ok'), this.css('--led-info'), this.css('--led-warn')];
    const lg = this.layer.getContext('2d')!;
    lg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    lg.clearRect(0, 0, this.W, this.H);
    const line = this.css('--line');
    const strong = this.css('--line-strong');
    const face = this.css('--bg-2');

    this.leds = [];
    const rackW = this.lite ? 60 : 64;
    const gap = this.lite ? 30 : 26;
    const unit = 11;
    let seed = 3;
    const top = 40;
    for (let rx = 12; rx < this.W + rackW; rx += rackW + gap) {
      // cadre de la baie + montants
      lg.strokeStyle = strong;
      lg.globalAlpha = 0.55;
      lg.lineWidth = 1;
      lg.strokeRect(rx + 0.5, top + 0.5, rackW, this.H - top - 8);
      lg.globalAlpha = 0.35;
      lg.fillStyle = line;
      lg.fillRect(rx + 3, top, 1, this.H - top);
      lg.fillRect(rx + rackW - 4, top, 1, this.H - top);
      for (let y = top + 6; y < this.H - unit; y += unit) {
        const fill = rand(seed++ + rx);
        if (fill < 0.16) continue; // emplacement vide
        // façade 1U
        lg.globalAlpha = 0.5;
        lg.fillStyle = face;
        lg.fillRect(rx + 6, y, rackW - 12, unit - 2);
        lg.globalAlpha = 0.4;
        lg.fillStyle = line;
        for (let k = 0; k < 3; k++) lg.fillRect(rx + 9 + k * 7, y + 3, 5, 3); // baies de disques
        if (this.lite && rand(seed++) < 0.45) continue;
        const n = 1 + Math.floor(rand(seed++) * 3);
        for (let k = 0; k < n; k++) {
          const r = rand(seed++);
          const c = rand(seed++);
          this.leds.push({
            x: rx + rackW - 11 - k * 5,
            y: y + 3,
            c: c < 0.62 ? 0 : c < 0.88 ? 1 : 2,
            rate: 0.3 + r * 4.2,
            phase: rand(seed++) * 10,
            duty: 0.3 + rand(seed++) * 0.6,
          });
        }
      }
    }
    lg.globalAlpha = 1;
  }

  draw(t: number): void {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    g.drawImage(this.layer, 0, 0, this.W, this.H);
    for (let c = 0; c < 3; c++) {
      g.fillStyle = this.colors[c];
      for (const l of this.leds) {
        if (l.c !== c) continue;
        const on = (t * l.rate + l.phase) % 1 < l.duty;
        g.globalAlpha = on ? 0.85 : 0.12;
        g.fillRect(l.x, l.y, 2, 2);
      }
    }
    g.globalAlpha = 1;
  }

  /** Parallaxe : position normalisée du pointeur (-0,5 → 0,5). */
  pointer(x: number, y: number): void {
    this.mx = x;
    this.my = y;
    this.kick();
  }

  private readonly loop = (now: number) => {
    this.raf = 0;
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    this.px += (this.mx - this.px) * 0.06;
    this.py += (this.my - this.py) * 0.06;
    this.canvas.style.transform = `translate3d(${(this.px * -18).toFixed(2)}px, ${(this.py * -12).toFixed(2)}px, 0)`;
    if (now - this.last < (this.lite ? 50 : 33)) return;
    this.last = now;
    this.draw(now / 1000);
  };

  private kick(): void {
    const should = this.enabled && this.visible && !document.hidden;
    this.running = should;
    if (should && !this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  start(): void {
    const io = new IntersectionObserver(([en]) => {
      this.visible = en.isIntersecting;
      this.kick();
    });
    io.observe(this.canvas);
    document.addEventListener('visibilitychange', () => this.kick());
    this.kick();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.kick();
  }
}

/** Reduced-motion : une seule image fixe, LEDs figées. */
export function staticWall(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('.hero-wall');
  if (!canvas) return;
  const w = new Wall(canvas);
  w.draw(0.37);
}
