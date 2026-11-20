/**
 * Modèle de données du portfolio.
 * La scène 3D ET la version classique lisent ces mêmes types :
 * ajouter un élément dans un fichier de `src/data/` suffit à le faire apparaître partout.
 */

export type ProjectStatus =
  /** En prod / terminé : LEDs vertes. */
  | 'online'
  /** En cours : LEDs ambre. */
  | 'building'
  /** Emplacement réservé : baie vide, LED ambre qui pulse. */
  | 'slot';

export interface ProjectLink {
  label: string;
  url: string;
  kind: 'github' | 'demo' | 'doc' | 'other';
}

export interface Project {
  /** Identifiant unique, utilisé dans l'URL (ex : `3d/#ubertaxi`). Minuscules, sans espace. */
  id: string;
  title: string;
  status: ProjectStatus;
  /** Nom d'hôte affiché sur l'étiquette de la baie. */
  hostname: string;
  /** Une phrase d'accroche. */
  tagline: string;
  /** Description longue (paragraphes séparés par une ligne vide). */
  description: string;
  /** Contexte : SAE, alternance, perso… */
  context?: string;
  year?: string;
  stack: string[];
  links: ProjectLink[];
  /** Points marquants (optionnel), affichés en liste. */
  highlights?: string[];
}

export type SkillLevel = 'solide' | 'pratique' | 'apprentissage';

export interface Skill {
  name: string;
  level: SkillLevel;
  /** Détail court (optionnel). */
  note?: string;
}

export interface SkillDomain {
  id: string;
  title: string;
  /** Étiquette de baie. */
  hostname: string;
  summary: string;
  /** Couleur d'accent de la baie (hex). */
  color: string;
  skills: Skill[];
}

export interface Profile {
  name: string;
  firstName: string;
  role: string;
  /** Ligne courte sous le nom. */
  headline: string;
  location?: string;
  /** Paragraphes « À propos ». */
  about: string[];
  /** Faits rapides affichés sur le poste de supervision. */
  facts: { label: string; value: string }[];
  links: ProjectLink[];
  email?: string;
  cv: {
    /** Chemin relatif depuis la racine du site (dossier `public/`). */
    path: string;
    fileName: string;
    updated: string;
  };
}
