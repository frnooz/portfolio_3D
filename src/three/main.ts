import '../styles/tokens.css';
import './ui/hud.css';
import { hasWebGL } from '../shared/env';

if (!hasWebGL()) {
  // pas de WebGL 2 : on bascule directement sur la version classique
  window.location.replace('../classique/?depuis=3d&raison=webgl');
} else {
  // la scène (et three.js) n'est chargée qu'ici, à la demande
  import('./experience').then(({ Experience }) => {
    const xp = new Experience();
    (window as unknown as { __xp: unknown }).__xp = xp;
  });
}
