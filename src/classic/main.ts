import '../styles/tokens.css';
import './classic.css';
import { hasWebGL } from '../shared/env';

/** Amélioration progressive : la page est complète sans ce script. */
const params = new URLSearchParams(window.location.search);
const notice = document.getElementById('notice');

if (!hasWebGL()) document.body.classList.add('no-webgl');

if (notice && params.get('raison') === 'webgl') {
  notice.textContent =
    "Ton navigateur ne prend pas en charge WebGL 2 : la salle 3D ne peut pas démarrer, voici la version classique avec exactement le même contenu.";
  notice.hidden = false;
}
