/**
 * Rendu statique de `/cv/` : le serveur legacy (terminal ambre).
 * Aucun contenu de CV n'est inventé : on décrit le fichier (nom, poids, mise à jour) et on le sert.
 */
import { profile } from '../data/profile.ts';
import { cvInfo, esc, ext, tidy } from './shared.ts';

export function renderCv(): string {
  const cv = cvInfo();
  const href = `../${esc(profile.cv.path)}`;
  const prompt = `${esc(profile.firstName.toLowerCase())}@legacy-01:~$`;
  const user = esc(profile.firstName.toLowerCase());
  const info = [
    ['Titulaire', profile.name],
    ['Rôle', profile.role],
    ['Fichier', profile.cv.fileName],
    ['Format', cv.label],
    ['Mise à jour', profile.cv.updated],
  ];
  return tidy(`
<a class="skip-link" href="#contenu">Aller au contenu</a>
<header class="cv-hd">
  <a class="cv-back" href="../"><span aria-hidden="true">←</span> Retour au portfolio</a>
  <p class="cv-hd-tag" aria-hidden="true"><span>DC-01</span><span>legacy-01 · tty1</span></p>
</header>
<main id="contenu" class="cv-main" tabindex="-1">
  <div class="crt">
    <div class="crt-screen">
      <p class="crt-banner" aria-hidden="true">LEGACY-01 · serveur de documents · ${user}@legacy-01</p>
      <h1 class="cv-title">CV <span class="cv-dash" aria-hidden="true">—</span> ${esc(profile.name)}</h1>
      <p class="tl"><span class="pr" aria-hidden="true">${prompt}</span> <span class="cmd">ls -l /srv/cv/</span></p>
      <p class="out ls"><span aria-hidden="true">-rw-r--r-- 1 ${user} ${user} ${esc(cv.short)} ${esc(profile.cv.updated)} </span>${esc(profile.cv.fileName)}</p>
      <p class="tl"><span class="pr" aria-hidden="true">${prompt}</span> <span class="cmd">file --info ${esc(profile.cv.fileName)}</span></p>
      <dl class="cv-info">${info.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <p class="cv-act">
        <a class="cv-btn" href="${href}" target="_blank" rel="noopener">Ouvrir le PDF<span class="sr-only"> (nouvel onglet)</span><span aria-hidden="true"> ↗</span></a>
        <a class="cv-btn cv-btn-alt" href="${href}" download="${esc(profile.cv.fileName)}">Télécharger<span class="sr-only"> le CV</span> <span class="dim">(${esc(cv.label)})</span></a>
      </p>
      <p class="tl tl-end" aria-hidden="true"><span class="pr">${prompt}</span> <span class="caret"></span></p>
    </div>
  </div>
</main>
<footer class="cv-ft">
  <p>© 2026 ${esc(profile.name)}</p>
  <ul>
    <li><a href="../#contact">Contact</a></li>
    ${profile.links.map((l) => `<li>${ext(l)}</li>`).join('')}
  </ul>
</footer>`);
}
