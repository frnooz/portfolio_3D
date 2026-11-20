import '../styles/tokens.css';
import './ui/hud.css';
import './ui/boot.css';
import { hasWebGL, prefersReducedMotion } from '../shared/env';
import { Boot } from './ui/boot';
import { projects } from '../data/projects';
import { skillDomains } from '../data/skills';

/**
 * Point d'entrée de la salle 3D.
 * 1. pas de WebGL 2 → version classique, direct
 * 2. animations réduites demandées → on propose la version classique (sauf choix explicite)
 * 3. écran de boot pendant le chargement réel de three.js et de la scène
 */

const params = new URLSearchParams(window.location.search);

function reducedMotionGate(): Promise<void> {
  return new Promise((resolve) => {
    const gate = document.getElementById('motion-gate')!;
    gate.hidden = false;
    document.getElementById('boot')!.classList.add('is-gated');
    const go = gate.querySelector<HTMLButtonElement>('[data-enter]')!;
    go.focus();
    go.addEventListener('click', () => {
      gate.hidden = true;
      document.getElementById('boot')!.classList.remove('is-gated');
      resolve();
    });
  });
}

async function run() {
  if (!hasWebGL()) {
    window.location.replace('../classique/?depuis=3d&raison=webgl');
    return;
  }
  if (prefersReducedMotion() && params.get('choix') !== '3d') await reducedMotionGate();

  const racksCount = projects.length + skillDomains.length;
  const boot = new Boot(5);
  void boot.post(racksCount);

  // la scène (et three.js) n'est chargée qu'ici, à la demande
  const engine = boot.task('Chargement du moteur 3D (three.js)');
  const modPromise = import('./experience');

  const fonts = boot.task('Montage des polices');
  await Promise.all([
    document.fonts.load('500 20px "IBM Plex Mono"'),
    document.fonts.load('600 20px "IBM Plex Mono"'),
    document.fonts.load('800 40px "Archivo Variable"'),
  ]).catch(() => undefined);
  await fonts.ok('IBM Plex Mono, Archivo');

  const { Experience } = await modPromise;
  await engine.ok();

  const build = boot.task('Construction de la salle');
  await new Promise((r) => requestAnimationFrame(r));
  const xp = new Experience();
  (window as unknown as { __xp: unknown }).__xp = xp;
  await build.ok(`${xp.layout.racks.length} baies, ${xp.layout.items.length} points d'intérêt`);

  const shaders = boot.task('Compilation des shaders');
  await xp.compile();
  await shaders.ok();

  await boot.service('Started <b>led-blink.service</b> — 100 % GPU');
  await boot.service('Started <b>cooling.service</b> — 18,4 °C');
  const robot = boot.task('Réveil du robot de maintenance');
  await robot.ok('rob-01 en ligne');
  await boot.login();
  await boot.atLeast(2600);

  xp.start({ intro: !boot.wasSkipped && !prefersReducedMotion() });
  await boot.close();
}

void run().catch((err) => {
  console.error(err);
  const log = document.querySelector('.boot-log');
  if (log) {
    log.insertAdjacentHTML(
      'beforeend',
      `<div class="bl bl-warn">[FAILED] La salle n'a pas pu démarrer. <a href="../classique/">Ouvrir la version classique</a></div>`,
    );
  }
});
