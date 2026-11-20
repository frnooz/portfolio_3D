/** Notification brève en haut de l'écran (doublée dans la région live pour les lecteurs d'écran). */
export class Toast {
  private readonly el: HTMLElement;
  private readonly announcer: HTMLElement;
  private timer = 0;

  constructor() {
    this.el = document.getElementById('toast')!;
    this.announcer = document.getElementById('announcer')!;
  }

  show(text: string, tone: 'info' | 'ok' | 'warn' = 'info', ms = 3200) {
    this.el.textContent = text;
    this.el.dataset.tone = tone;
    this.el.classList.add('is-on');
    this.announcer.textContent = text;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove('is-on'), ms);
  }
}
