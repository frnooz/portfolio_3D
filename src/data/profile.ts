import type { Profile } from './types';

/**
 * PROFIL — alimente le poste de supervision (« À propos »),
 * le serveur legacy (CV) et la version classique.
 * ⚠️ Les liens LinkedIn / e-mail sont des placeholders.
 */
export const profile: Profile = {
  name: 'Noah Guglielmino',
  firstName: 'Noah',
  role: 'Étudiant BUT Réseaux & Télécoms — parcours DevCloud',
  headline: 'Réseau, cloud et dev — en alternance',
  about: [
    "Étudiant en 3e année de BUT Réseaux & Télécommunications, parcours DevCloud, en alternance dans un service des systèmes d'information.",
    "J'aime les infrastructures qui tiennent debout : un réseau propre, des services conteneurisés, des déploiements automatisés et du code qui relie le tout.",
    'Placeholder — ajoute ici ce que tu cherches (poursuite d’études, poste…) et ce qui te fait vibrer.',
  ],
  facts: [
    { label: 'Formation', value: 'BUT R&T — DevCloud (3e année)' },
    { label: 'Rythme', value: 'Alternance' },
    { label: 'Terrain', value: 'Service SI' },
    { label: 'Focus', value: 'Réseau · Cloud · Automatisation' },
  ],
  links: [
    { label: 'GitHub', url: 'https://github.com/frnooz', kind: 'github' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/', kind: 'other' },
  ],
  email: 'contact@example.com',
  cv: {
    path: 'cv/CV-Noah-Guglielmino.pdf',
    fileName: 'CV-Noah-Guglielmino.pdf',
    updated: '2026',
  },
};
