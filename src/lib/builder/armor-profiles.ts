/**
 * Perfiles de juego: qué le pides a la armadura según cómo cazas.
 *
 * No hay un top por tipo de arma, y no es por pereza: en Wilds la armadura solo
 * concede habilidades de `kind: 'armor'`, y ninguna de esas cambia según lleves
 * espadón o ballesta. Catorce listas por arma saldrían casi calcadas. Lo que sí
 * cambia de verdad es el estilo —esquivar, aguantar, pegar, apoyar, romper— y
 * eso es lo que se ofrece.
 *
 * Como `weapon-skills.ts`, esto es opinión y no dato: se edita aquí y ya.
 *
 * Los objetivos van **en orden de prioridad**: si no hay set que cumpla el
 * perfil entero, `solveProfile` suelta el último y reintenta, así que lo que va
 * al final es lo que estás dispuesto a perder.
 */
export interface ArmorProfile {
  id: string;
  /** Clave del diccionario; el nombre y la explicación se traducen. */
  nameKey: string;
  blurbKey: string;
  targets: { skillId: number; level: number }[];
}

export const ARMOR_PROFILES: ArmorProfile[] = [
  {
    id: 'aggressive',
    nameKey: 'profile.aggressive',
    blurbKey: 'profile.aggressiveBlurb',
    targets: [
      { skillId: 57, level: 5 },  // Weakness Exploit
      { skillId: 99, level: 3 },  // Maximum Might
      { skillId: 144, level: 5 }, // Agitator
      { skillId: 142, level: 3 }, // Latent Power
      { skillId: 154, level: 3 }, // Peak Performance
    ],
  },
  {
    id: 'evasion',
    nameKey: 'profile.evasion',
    blurbKey: 'profile.evasionBlurb',
    targets: [
      { skillId: 77, level: 5 },  // Evade Window
      { skillId: 102, level: 3 }, // Evade Extender
      { skillId: 14, level: 3 },  // Constitution
      { skillId: 58, level: 3 },  // Stamina Surge
    ],
  },
  {
    id: 'survival',
    nameKey: 'profile.survival',
    blurbKey: 'profile.survivalBlurb',
    targets: [
      { skillId: 122, level: 3 }, // Divine Blessing
      { skillId: 108, level: 3 }, // Flinch Free
      { skillId: 80, level: 3 },  // Earplugs
      { skillId: 105, level: 3 }, // Stun Resistance
      { skillId: 30, level: 3 },  // Recovery Up
    ],
  },
  {
    id: 'support',
    nameKey: 'profile.support',
    blurbKey: 'profile.supportBlurb',
    targets: [
      { skillId: 113, level: 5 }, // Wide-Range
      { skillId: 111, level: 3 }, // Free Meal
      { skillId: 100, level: 3 }, // Speed Eating
      { skillId: 15, level: 3 },  // Item Prolonger
    ],
  },
  {
    id: 'partbreaker',
    nameKey: 'profile.partbreaker',
    blurbKey: 'profile.partbreakerBlurb',
    targets: [
      { skillId: 129, level: 3 }, // Partbreaker
      { skillId: 38, level: 5 },  // Flayer
      { skillId: 75, level: 3 },  // Foray
      { skillId: 37, level: 3 },  // Bombardier
    ],
  },
];

/**
 * Qué perfiles pegan con cada arma. Es una sugerencia de orden, no un filtro:
 * los cinco siguen estando a mano, porque quien juega decide.
 */
const SUGGESTED: Record<string, string[]> = {
  'great-sword': ['aggressive', 'survival'],
  'long-sword': ['aggressive', 'evasion'],
  'sword-shield': ['support', 'aggressive'],
  'dual-blades': ['evasion', 'aggressive'],
  hammer: ['partbreaker', 'aggressive'],
  'hunting-horn': ['support', 'survival'],
  lance: ['survival', 'aggressive'],
  gunlance: ['partbreaker', 'survival'],
  'switch-axe': ['aggressive', 'evasion'],
  'charge-blade': ['aggressive', 'survival'],
  'insect-glaive': ['evasion', 'aggressive'],
  bow: ['evasion', 'aggressive'],
  'light-bowgun': ['evasion', 'support'],
  'heavy-bowgun': ['survival', 'aggressive'],
};

/** Los cinco perfiles, con los sugeridos para ese arma delante. */
export function profilesFor(kind: string): ArmorProfile[] {
  const order = SUGGESTED[kind] ?? [];
  return [...ARMOR_PROFILES].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

export function isSuggested(kind: string, profileId: string): boolean {
  return (SUGGESTED[kind] ?? []).includes(profileId);
}

/** Para la prueba de humo. */
export function allProfileSkillIds(): number[] {
  return [...new Set(ARMOR_PROFILES.flatMap((p) => p.targets.map((t) => t.skillId)))];
}

export const SUGGESTED_KINDS = Object.keys(SUGGESTED);
