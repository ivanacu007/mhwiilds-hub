/**
 * Qué habilidades busca cada tipo de arma.
 *
 * Esto NO se deduce del catálogo: es conocimiento del juego, y es lo único del
 * proyecto que no sale de los datos. Vive aquí solo, en una tabla editable, para
 * que corregirla no obligue a tocar código.
 *
 * Todas las que hay aquí son de `kind: 'weapon'`, y eso no es casualidad: en
 * Wilds las habilidades están partidas en dos mitades estancas —ninguna pieza de
 * armadura ni adorno de armadura concede una sola habilidad de arma, medido
 * sobre las 714 piezas y los 66 adornos—. Por eso el consejo por tipo de arma va
 * aparte del set: la armadura no puede darte Guard ni Handicraft ni Attack Boost,
 * salgan de donde salgan en otros juegos de la saga.
 *
 * Se referencian por id y no por nombre: los ids son iguales en los dos idiomas
 * y el catálogo llega al cliente ya traducido. El nombre en inglés va al lado
 * para poder mantener la tabla; la prueba de humo comprueba que cada id sigue
 * existiendo y sigue siendo de arma.
 */
export type WeaponCategory =
  | 'charge' | 'block' | 'melee' | 'artillery' | 'gauge' | 'ranged' | 'ko';

/** Por qué se recomienda; la pantalla lo agrupa así. */
export type SkillReason = WeaponCategory | 'exclusive' | 'universal';

/**
 * Qué armas comparten cada mecánica. Un arma cae en varias: la espada cargada
 * bloquea, es cuerpo a cuerpo, tira viales y lleva medidor.
 */
const MEMBERS: Record<WeaponCategory, string[]> = {
  /**
   * Armas que cargan un ataque antes de soltarlo. `Focus` es de aquí y no de los
   * medidores: en español se llama «Tiempo de carga», y en el catálogo aparece
   * sobre todo en arco (30 armas), espadas dobles (25), espadón (24) y martillo
   * (23). Estaba solo en `gauge`, así que al espadón no le salía.
   */
  charge: ['great-sword', 'hammer', 'bow', 'charge-blade', 'sword-shield'],
  block: ['lance', 'gunlance', 'charge-blade', 'sword-shield', 'great-sword', 'heavy-bowgun'],
  melee: [
    'great-sword', 'long-sword', 'sword-shield', 'dual-blades', 'hammer', 'hunting-horn',
    'lance', 'gunlance', 'switch-axe', 'charge-blade', 'insect-glaive',
  ],
  artillery: ['gunlance', 'charge-blade', 'light-bowgun', 'heavy-bowgun'],
  gauge: ['long-sword', 'dual-blades', 'switch-axe', 'charge-blade', 'insect-glaive'],
  ranged: ['bow', 'light-bowgun', 'heavy-bowgun'],
  ko: ['hammer', 'hunting-horn', 'sword-shield', 'lance'],
};

const CATEGORY_SKILLS: Record<WeaponCategory, number[]> = {
  // Charge Up, Charge Master, Focus
  charge: [83, 24, 60],
  // Guard, Guard Up, Offensive Guard
  block: [59, 16, 66],
  // Handicraft, Razor Sharp, Protective Polish, Master's Touch, Speed Sharpening,
  // Bludgeoner, Mind's Eye, Bladescale Honing
  melee: [119, 117, 134, 124, 126, 85, 136, 163],
  // Artillery, Load Shells
  artillery: [47, 109],
  // Power Prolonger, Focus
  gauge: [104, 60],
  // Normal Shots, Piercing Shots, Spread/Power Shots, Ballistics, Special Ammo
  // Boost, Opening Shot, Tetrad Shot, Evading Reload
  ranged: [6, 94, 2, 53, 69, 140, 137, 166],
  // Slugger, Stamina Thief, Punishing Draw
  ko: [36, 141, 8],
};

/**
 * Solo sirven si llevas ese arma: su mecánica no existe en las demás. Las de
 * carga vivían aquí repetidas en cinco entradas, que es justo lo que significa
 * ser una categoría y no una exclusiva; ahora están en `charge`.
 */
const EXCLUSIVE: Record<string, number[]> = {
  'hunting-horn': [29],                 // Horn Maestro
  'switch-axe': [7],                    // Rapid Morph
  'charge-blade': [7],                  // Rapid Morph
  'light-bowgun': [23],                 // Rapid Fire Up
  // Los viales del arco: en el catálogo se llaman «X Functionality».
  bow: [116, 44, 79, 5],                // Poison / Para / Sleep / Blast
};

/** Le sirven a cualquier arma; van al final porque no distinguen. */
const UNIVERSAL = [72, 3, 22]; // Attack Boost, Critical Eye, Critical Boost

export interface WeaponSkillHint {
  skillId: number;
  why: SkillReason;
}

/**
 * Las habilidades que persigue un tipo de arma, de lo más específico a lo más
 * genérico: primero lo que solo le sirve a ella, luego lo de su mecánica, y al
 * final lo que le viene bien a todo el mundo.
 */
export function weaponSkillsFor(kind: string): WeaponSkillHint[] {
  const out: WeaponSkillHint[] = [];
  const seen = new Set<number>();
  const push = (skillId: number, why: SkillReason) => {
    if (seen.has(skillId)) return;
    seen.add(skillId);
    out.push({ skillId, why });
  };

  for (const skillId of EXCLUSIVE[kind] ?? []) push(skillId, 'exclusive');
  for (const category of Object.keys(MEMBERS) as WeaponCategory[]) {
    if (!MEMBERS[category].includes(kind)) continue;
    for (const skillId of CATEGORY_SKILLS[category]) push(skillId, category);
  }
  for (const skillId of UNIVERSAL) push(skillId, 'universal');

  return out;
}

/** Todas las que la tabla nombra, para que la prueba las pueda revisar. */
export function allWeaponSkillIds(): number[] {
  const ids = new Set<number>(UNIVERSAL);
  for (const list of Object.values(CATEGORY_SKILLS)) for (const id of list) ids.add(id);
  for (const list of Object.values(EXCLUSIVE)) for (const id of list) ids.add(id);
  return [...ids];
}
