import type { Input } from '../systems/input';

/**
 * Pilotage au doigt / à la souris sur le canvas :
 *  - glisser (tactile) → joystick flottant qui apparaît sous le pouce
 *  - toucher / cliquer → « va là » (baie ou point du sol)
 */
export class TouchControls {
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private pointer: number | null = null;
  private sx = 0;
  private sy = 0;
  private t0 = 0;
  private dragging = false;
  private readonly R = 56;
  onTap?: (x: number, y: number) => void;
  onHover?: (x: number, y: number) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly input: Input,
  ) {
    this.base = document.getElementById('joystick')!;
    this.knob = this.base.querySelector('.joy-knob')!;
    canvas.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move, { passive: true });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private down = (e: PointerEvent) => {
    if (this.pointer !== null || e.button > 0) return;
    this.pointer = e.pointerId;
    this.sx = e.clientX;
    this.sy = e.clientY;
    this.t0 = performance.now();
    this.dragging = false;
  };

  private move = (e: PointerEvent) => {
    if (this.pointer === null) {
      if (e.pointerType === 'mouse' && e.target === this.canvas) this.onHover?.(e.clientX, e.clientY);
      return;
    }
    if (e.pointerId !== this.pointer) return;
    const dx = e.clientX - this.sx;
    const dy = e.clientY - this.sy;
    if (!this.dragging && Math.hypot(dx, dy) > 12 && e.pointerType !== 'mouse') {
      this.dragging = true;
      this.base.style.left = `${this.sx}px`;
      this.base.style.top = `${this.sy}px`;
      this.base.classList.add('is-on');
    }
    if (this.dragging) {
      const len = Math.hypot(dx, dy);
      const k = len > this.R ? this.R / len : 1;
      this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const mag = Math.min(1, len / this.R);
      const n = len > 0 ? 1 / len : 0;
      // petite zone morte + courbe douce pour un contrôle fin
      const m = mag < 0.15 ? 0 : (mag - 0.15) / 0.85;
      this.input.setJoystick(dx * n * m, dy * n * m);
    }
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    const quick = performance.now() - this.t0 < 350;
    if (!this.dragging && quick) this.onTap?.(e.clientX, e.clientY);
    this.pointer = null;
    this.dragging = false;
    this.input.setJoystick(0, 0);
    this.base.classList.remove('is-on');
    this.knob.style.transform = '';
  };
}
