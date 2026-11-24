/** Effets de texte : déchiffrement (calques aria-hidden uniquement) et compteurs. */

// hexadécimal uniquement : ça se lit comme un registre qui se remplit, pas comme un bug d'affichage
const GLYPHS = '0123456789ABCDEF';

/** Remplace progressivement des glyphes aléatoires par le texte final, de gauche à droite. */
export function scramble(el: HTMLElement, dur = 700, delay = 0): void {
  const final = (el.dataset.t ??= el.textContent ?? '');
  const n = final.length;
  if (!n) return;
  let t0 = 0;
  const tick = (now: number) => {
    if (!t0) t0 = now + delay;
    const p = (now - t0) / dur;
    if (p < 0) {
      requestAnimationFrame(tick);
      return;
    }
    let s = '';
    for (let i = 0; i < n; i++) {
      const ch = final[i];
      if (ch === ' ' || p >= 0.25 + (i / n) * 0.75) s += ch;
      else s += GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = s;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = final;
  };
  requestAnimationFrame(tick);
}

/** Délais de révélation par caractère (index → --i). */
export function indexChars(scope: Element): void {
  scope.querySelectorAll<HTMLElement>('.split .c').forEach((c, i) => c.style.setProperty('--i', String(i)));
}

/** Programme la frappe du terminal : chaque ligne démarre quand la précédente est finie. */
export function scheduleTerminal(term: HTMLElement): void {
  let t = 120;
  for (const line of term.querySelectorAll<HTMLElement>('.term-body > p')) {
    line.style.setProperty('--t', `${t}ms`);
    const cmd = line.querySelector<HTMLElement>('.cmd');
    if (cmd) {
      const n = Math.max(1, cmd.textContent?.length ?? 1);
      cmd.style.setProperty('--n', String(n));
      cmd.style.setProperty('--t', `${t + 260}ms`);
      t += 260 + n * 55 + 220;
    } else {
      t += 110;
    }
  }
}
