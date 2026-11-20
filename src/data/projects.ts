import type { Project } from './types';

/**
 * ┌──────────────────────────────────────────────────────────────┐
 * │  PROJETS — une entrée = une baie dans l'allée « Projets ».   │
 * │  Ajoute / retire / réordonne librement : la salle se         │
 * │  redimensionne toute seule.                                  │
 * │                                                              │
 * │  status : 'online' | 'building' | 'slot'                     │
 * └──────────────────────────────────────────────────────────────┘
 *
 * ⚠️ Les textes ci-dessous sont des PLACEHOLDERS à compléter.
 */
export const projects: Project[] = [
  {
    id: 'ubertaxi',
    title: 'UbeRTaxi',
    status: 'online',
    hostname: 'ubertaxi-prod-01',
    tagline: 'Plateforme VTC découpée en microservices.',
    description:
      "Plateforme de réservation de VTC conçue en architecture microservices dans le cadre d'une SAE du parcours DevCloud : chaque domaine (comptes, courses, tarification, notifications) vit dans son propre service, déployé en conteneurs.\n\n" +
      "Placeholder — décris ici ton rôle, les choix d'architecture et ce que tu as appris.",
    context: 'SAE DevCloud — BUT R&T 3e année',
    year: '2025-2026',
    // ⚠️ placeholder : ajuste la stack réelle
    stack: ['Docker', 'Docker Compose', 'Kubernetes', 'API REST', 'PostgreSQL', 'CI/CD'],
    highlights: [
      'Découpage en services indépendants',
      'Déploiement conteneurisé',
      'Placeholder — un résultat chiffré',
    ],
    links: [
      { label: 'Code source', url: 'https://github.com/frnooz', kind: 'github' },
    ],
  },
  {
    id: 'alternance',
    title: "Projet d'alternance",
    status: 'building',
    hostname: 'si-alternance-01',
    tagline: 'Mission au sein du service SI.',
    description:
      "Projet mené en alternance au sein d'un service des systèmes d'information.\n\n" +
      'Placeholder — contexte, objectif, ce que tu as mis en place et l’impact pour les utilisateurs.',
    context: 'Alternance — service SI',
    year: '2025-2026',
    // ⚠️ placeholder
    stack: ['Linux', 'Réseau', 'Automatisation', 'Supervision'],
    links: [],
  },
  {
    id: 'slot-03',
    title: 'Projet à venir',
    status: 'slot',
    hostname: 'slot-03',
    tagline: 'Emplacement réservé.',
    description: 'Cette baie attend son prochain déploiement.',
    stack: [],
    links: [],
  },
  {
    id: 'slot-04',
    title: 'Projet à venir',
    status: 'slot',
    hostname: 'slot-04',
    tagline: 'Emplacement réservé.',
    description: 'Cette baie attend son prochain déploiement.',
    stack: [],
    links: [],
  },
  {
    id: 'slot-05',
    title: 'Projet à venir',
    status: 'slot',
    hostname: 'slot-05',
    tagline: 'Emplacement réservé.',
    description: 'Cette baie attend son prochain déploiement.',
    stack: [],
    links: [],
  },
];
