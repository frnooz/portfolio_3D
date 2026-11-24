/**
 * Défilement partagé : natif par défaut, remplacé par Lenis quand le motion est chargé.
 * Les ancres internes passent toutes par ici pour garder le focus clavier cohérent.
 */
const hdr = (): number => document.querySelector<HTMLElement>('.hd')?.offsetHeight ?? 0;

export const scroller = {
  /** Va jusqu'à un élément (sous le header fixe). */
  to(el: HTMLElement, smooth = true): void {
    const y = el.getBoundingClientRect().top + window.scrollY - hdr();
    window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
  },
  /** Saut immédiat à une position (utilisé par le focus clavier dans l'allée épinglée). */
  jump(y: number): void {
    window.scrollTo({ top: y, behavior: 'auto' });
  },
  stop(): void {},
  start(): void {},
};

export const emit = (name: string, detail?: unknown): void => {
  document.dispatchEvent(new CustomEvent(name, { detail }));
};
