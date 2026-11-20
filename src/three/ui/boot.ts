import { prefersReducedMotion } from '../../shared/env';

type Tone = 'ok' | 'info' | 'warn' | 'dim' | 'plain' | 'title';

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/**
 * Écran de démarrage façon serveur : POST du BIOS, noyau, puis services systemd.
 * Les lignes « [ OK ] » des vraies étapes (chargement de three.js, polices,
 * construction de la salle, compilation des shaders) attendent le vrai travail :
 * la barre de progression ne ment pas.
 */
export class Boot {
  private readonly root: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly skipBtn: HTMLButtonElement;
  private readonly fast = prefersReducedMotion();
  private queue: Promise<void> = Promise.resolve();
  private total = 1;
  private done = 0;
  private skipped = false;
  private readonly t0 = performance.now();
  private bootTime = 0;

  constructor(totalTasks: number) {
    this.root = document.getElementById('boot')!;
    this.logEl = this.root.querySelector('.boot-log')!;
    this.bar = this.root.querySelector('.boot-bar')!;
    this.pct = this.root.querySelector('.boot-pct')!;
    this.skipBtn = this.root.querySelector('.boot-skip')!;
    this.total = totalTasks;
    this.skipBtn.addEventListener('click', () => this.skip());
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      this.skip();
    }
  };

  skip() {
    this.skipped = true;
    this.root.classList.add('is-skipping');
  }

  get wasSkipped() {
    return this.skipped;
  }

  private delay(ms: number) {
    return this.fast || this.skipped ? Promise.resolve() : wait(ms);
  }

  private stamp() {
    this.bootTime += 0.02 + Math.random() * 0.09;
    return `[${this.bootTime.toFixed(6).padStart(12, ' ')}]`;
  }

  private line(html: string, tone: Tone = 'plain') {
    const el = document.createElement('div');
    el.className = `bl bl-${tone}`;
    el.innerHTML = html;
    this.logEl.appendChild(el);
    // on ne garde que ce qui tient à l'écran
    while (this.logEl.childElementCount > 60) this.logEl.firstElementChild?.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
    return el;
  }

  /** Ajoute des lignes « décoratives » à la file (rythme rapide). */
  private enqueue(fn: () => Promise<void> | void) {
    this.queue = this.queue.then(fn);
    return this.queue;
  }

  post(racks: number) {
    const dots = (s: string, n = 44) => s + ' ' + '.'.repeat(Math.max(2, n - s.length)) + ' ';
    const lines: [string, Tone][] = [
      ['DC-01 BIOS v2.6.0 — Guglielmino Systems', 'title'],
      ['Copyright (C) 2026, tous droits réservés.', 'dim'],
      ['', 'plain'],
      [`${dots('Processeur : curiosité x86_64 @ 4.20 GHz')}<b>OK</b>`, 'plain'],
      [`${dots('Mémoire : 16384 Mo')}<b>OK</b>`, 'plain'],
      [`${dots(`Détection des baies : ${racks} unités`)}<b>OK</b>`, 'plain'],
      [`${dots('Contrôleur réseau : 2x 10GbE')}<b>LIEN ACTIF</b>`, 'plain'],
      ['', 'plain'],
      [`${this.stamp()} Linux version 6.12.0-dc01 (noah@buildbox) #1 SMP`, 'dim'],
      [`${this.stamp()} Command line: root=/dev/portfolio ro quiet splash`, 'dim'],
      [`${this.stamp()} ACPI: salle serveur détectée, allées A, B, chaude`, 'dim'],
      [`${this.stamp()} systemd[1]: Detected architecture x86-64.`, 'dim'],
    ];
    for (const [l, t] of lines) {
      this.enqueue(async () => {
        this.line(l, t);
        await this.delay(t === 'title' ? 140 : 38);
      });
    }
    return this.queue;
  }

  /** Une vraie tâche : affiche « [ .... ] » puis passe à « [  OK  ] » quand elle est finie. */
  task(label: string) {
    let el: HTMLElement | null = null;
    const shown = this.enqueue(() => {
      el = this.line(`<span class="st st-wait">[ <i>····</i> ]</span> ${label}…`, 'info');
    });
    return {
      ok: async (detail = '') => {
        await shown;
        this.done++;
        this.progress();
        await this.enqueue(async () => {
          if (el) {
            el.className = 'bl bl-ok';
            el.innerHTML = `<span class="st">[  OK  ]</span> ${label}${detail ? ` <span class="dim">— ${detail}</span>` : ''}`;
          }
          await this.delay(60);
        });
      },
    };
  }

  service(label: string) {
    return this.enqueue(async () => {
      this.line(`<span class="st">[  OK  ]</span> ${label}`, 'ok');
      await this.delay(45);
    });
  }

  private progress() {
    const p = Math.round((this.done / this.total) * 100);
    this.bar.setAttribute('aria-valuenow', String(p));
    (this.bar.firstElementChild as HTMLElement).style.width = `${p}%`;
    this.pct.textContent = `${p} %`;
  }

  async login() {
    await this.enqueue(async () => {
      this.line('', 'plain');
      this.line('Debian GNU/Linux 13 dc-01 tty1', 'dim');
      this.line('', 'plain');
      const el = this.line('dc-01 login: ', 'plain');
      for (const ch of 'visiteur') {
        el.textContent += ch;
        await this.delay(55);
      }
      const pw = this.line('Mot de passe : ', 'plain');
      for (let i = 0; i < 8; i++) {
        pw.textContent += '•';
        await this.delay(30);
      }
      await this.delay(180);
      this.line(`Bienvenue. Dernière connexion : ${new Date().toLocaleString('fr-FR')}`, 'ok');
      await this.delay(380);
    });
  }

  /** Garde l'écran au moins `ms` au total (sauf si on passe), pour que le boot se lise. */
  async atLeast(ms: number) {
    await this.queue;
    while (!this.skipped && !this.fast && performance.now() - this.t0 < ms) await wait(50);
  }

  /** Extinction façon tube cathodique, puis on rend la main à la scène. */
  async close() {
    window.removeEventListener('keydown', this.onKey);
    this.root.classList.add(this.fast ? 'is-fade' : 'is-off');
    await wait(this.fast ? 250 : 650);
    this.root.hidden = true;
  }
}
