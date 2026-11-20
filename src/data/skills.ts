import type { SkillDomain } from './types';

/**
 * COMPÉTENCES — un domaine = une baie dans l'allée « Compétences ».
 * Chaque compétence = un serveur (1U) dans la baie. Ses LEDs dépendent du niveau :
 *   solide → vert · pratique → cyan · apprentissage → ambre
 *
 * ⚠️ Listes indicatives à ajuster selon ton vrai profil.
 */
export const skillDomains: SkillDomain[] = [
  {
    id: 'reseau',
    title: 'Réseau',
    hostname: 'core-net-01',
    color: '#39e58c',
    summary: 'Concevoir, configurer et dépanner des infrastructures réseau, du câble au routage.',
    skills: [
      { name: 'TCP/IP, adressage & subnetting', level: 'solide' },
      { name: 'Switching & VLAN', level: 'solide' },
      { name: 'Routage (statique, OSPF)', level: 'pratique' },
      { name: 'Équipements Cisco (IOS)', level: 'pratique' },
      { name: 'Pare-feu & filtrage', level: 'pratique' },
      { name: 'VPN (IPsec, WireGuard)', level: 'pratique' },
      { name: 'Analyse de trames (Wireshark)', level: 'solide' },
      { name: 'BGP', level: 'apprentissage' },
    ],
  },
  {
    id: 'cloud',
    title: 'Cloud',
    hostname: 'cloud-ctl-01',
    color: '#5ce1ff',
    summary: 'Conteneuriser, orchestrer et automatiser des déploiements reproductibles.',
    skills: [
      { name: 'Docker & Compose', level: 'solide' },
      { name: 'Kubernetes', level: 'pratique' },
      { name: 'Virtualisation (Proxmox)', level: 'pratique' },
      { name: 'Ansible', level: 'pratique' },
      { name: 'CI/CD (GitLab CI, GitHub Actions)', level: 'pratique' },
      { name: 'Supervision (Prometheus, Grafana)', level: 'apprentissage' },
      { name: 'Terraform', level: 'apprentissage' },
      { name: 'Cloud public (AWS / Azure)', level: 'apprentissage' },
    ],
  },
  {
    id: 'dev',
    title: 'Dev',
    hostname: 'dev-build-01',
    color: '#ffb020',
    summary: 'Écrire le code qui fait tourner, relie et automatise le tout.',
    skills: [
      { name: 'Linux & Bash', level: 'solide' },
      { name: 'Python', level: 'solide' },
      { name: 'Git', level: 'solide' },
      { name: 'JavaScript / TypeScript', level: 'pratique' },
      { name: 'API REST', level: 'pratique' },
      { name: 'SQL', level: 'pratique' },
      { name: 'Three.js', level: 'apprentissage', note: 'Ce site, par exemple.' },
    ],
  },
];

export const levelLabel: Record<string, string> = {
  solide: 'Solide',
  pratique: 'En pratique',
  apprentissage: 'En apprentissage',
};
