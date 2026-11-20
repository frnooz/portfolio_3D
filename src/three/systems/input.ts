/**
 * Entrées clavier + joystick.
 * On lit `event.code` (position physique de la touche) : ZQSD sur AZERTY et WASD sur QWERTY
 * tombent sur les mêmes codes (KeyW/KeyA/KeyS/KeyD), sans aucune config.
 */

export type Action = 'interact' | 'ping' | 'map' | 'escape' | 'sound' | 'help';

const UP = ['KeyW', 'ArrowUp'];
const DOWN = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const MOVE = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT]);

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** Les éléments interactifs gardent Espace/Entrée (activer un bouton, suivre un lien). */
function isActivatable(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && /^(A|BUTTON|SUMMARY)$/.test(el.tagName);
}

/** Zones de l'UI qui gèrent elles-mêmes les flèches (menus, listes). */
function capturesKeys(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest('[data-capture-keys]');
}

export class Input {
  private keys = new Set<string>();
  /** Joystick tactile, valeurs dans [-1, 1] (y vers le bas de l'écran = sud). */
  joy = { x: 0, y: 0 };
  boost = false;
  /** Horodatage de la dernière entrée de déplacement manuelle. */
  lastManual = 0;
  enabled = true;

  private listeners = new Set<(a: Action) => void>();

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => this.keys.clear());
  }

  onAction(fn: (a: Action) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(a: Action) {
    this.listeners.forEach((fn) => fn(a));
  }

  private onDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.code === 'Escape') {
      this.emit('escape');
      return;
    }
    if (!this.enabled) return;

    if (MOVE.has(e.code)) {
      if (capturesKeys(e.target)) return;
      e.preventDefault();
      this.keys.add(e.code);
      this.lastManual = performance.now();
      return;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.boost = true;
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Space' && !isActivatable(e.target)) {
      e.preventDefault();
      this.emit('ping');
    } else if ((e.code === 'KeyE' || e.code === 'Enter') && !isActivatable(e.target)) {
      e.preventDefault();
      this.emit('interact');
    } else if (e.key === 'm' || e.key === 'M') {
      this.emit('map');
    } else if (e.key === 'h' || e.key === 'H' || e.key === '?') {
      this.emit('help');
    }
  };

  private onUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.boost = false;
  };

  private has(codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  /** Vecteur de déplacement monde (x = est, z = sud), norme ≤ 1. */
  vector(out: { x: number; z: number }) {
    let x = 0;
    let z = 0;
    if (this.enabled) {
      if (this.has(LEFT)) x -= 1;
      if (this.has(RIGHT)) x += 1;
      if (this.has(UP)) z -= 1;
      if (this.has(DOWN)) z += 1;
      x += this.joy.x;
      z += this.joy.y;
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    out.x = x;
    out.z = z;
    return out;
  }

  get manualActive(): boolean {
    return this.keys.size > 0 || Math.hypot(this.joy.x, this.joy.y) > 0.08;
  }

  setJoystick(x: number, y: number) {
    this.joy.x = x;
    this.joy.y = y;
    if (Math.hypot(x, y) > 0.08) this.lastManual = performance.now();
  }
}
