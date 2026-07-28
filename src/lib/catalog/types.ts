/**
 * Forma del catálogo que se manda al navegador.
 *
 * Es una versión adelgazada de lo que devuelve wilds.mhdb.io: se quedan los
 * campos que el armador necesita para resolver (slots, habilidades, bonus de
 * serie) y los materiales de crafteo, y se tira la prosa que no se muestra.
 * El objetivo es que quepa cómodo en IndexedDB y se descargue una sola vez.
 */

export type SkillKind = 'armor' | 'weapon' | 'set' | 'group';
export type ArmorKind = 'head' | 'chest' | 'arms' | 'waist' | 'legs';

/** Las 5 piezas, en el orden en que se muestran en el juego. */
export const ARMOR_KINDS: ArmorKind[] = ['head', 'chest', 'arms', 'waist', 'legs'];

export interface SkillRank {
  level: number;
  name: string | null;
  description: string | null;
}

export interface Skill {
  id: number;
  name: string;
  kind: SkillKind;
  /**
   * Qué hace en general, por encima del detalle de cada nivel. La traen 137 de
   * las 179; las 42 que no son bonus de serie y de grupo, que se explican solos
   * en su único rango. Opcional también porque los catálogos guardados antes de
   * añadir este campo no la tienen hasta que se vuelvan a sincronizar.
   */
  description?: string | null;
  /** Nivel máximo alcanzable = ranks.length. */
  ranks: SkillRank[];
}

/** Una habilidad concedida por una pieza, adorno o talismán. */
export interface SkillGrant {
  skillId: number;
  level: number;
}

export interface Material {
  itemId: number;
  quantity: number;
}

export interface ArmorPiece {
  id: number;
  name: string;
  kind: ArmorKind;
  rank: string;
  rarity: number;
  defense: number;
  resistances: Record<string, number>;
  /** Tamaño de cada slot, p. ej. [3,1] = un slot nivel 3 y uno nivel 1. */
  slots: number[];
  skills: SkillGrant[];
  setId: number | null;
  materials: Material[];
}

export interface BonusRank {
  pieces: number;
  skillId: number;
  level: number;
  name: string | null;
  description: string | null;
}

export interface ArmorSet {
  id: number;
  name: string;
  pieceIds: number[];
  /** Bonus de serie: se activa con 2 y 4 piezas de la misma serie. */
  setBonus: BonusRank[];
  /**
   * Identidad del grupo, que NO es la de la serie: varias series comparten
   * grupo y sus piezas suman juntas para llegar a las 3 requeridas. Sin esto
   * el solver contaría cada serie por separado y nunca activaría el bonus.
   */
  groupId: number | null;
  /** Bonus de grupo: se activa con 3 piezas del mismo grupo. */
  groupBonus: BonusRank[];
  /**
   * Monstruo del que sale la serie. NO viene de la API: se deduce cruzando los
   * materiales de las piezas con los botines de cada monstruo, en
   * src/lib/catalog/monster-armor.ts. `null` en las series genéricas (Hope,
   * Bone, cosméticos) y en las de monstruo pequeño, que no están en la lista.
   */
  monsterId: number | null;
}

export interface Decoration {
  id: number;
  name: string;
  /** Nivel del adorno: solo entra en slots de este tamaño o mayor. */
  slot: number;
  /** Los adornos de arma no entran en armadura y viceversa. */
  kind: 'armor' | 'weapon';
  rarity: number;
  skills: SkillGrant[];
}

export interface CharmRank {
  level: number;
  name: string;
  rarity: number;
  skills: SkillGrant[];
  materials: Material[];
}

export interface Charm {
  id: number;
  name: string;
  ranks: CharmRank[];
}

export interface Weapon {
  id: number;
  name: string;
  kind: string;
  rarity: number;
  slots: number[];
  attack: number;
  affinity: number;
  element: { kind: string; damage: number } | null;
  skills: SkillGrant[];
}

export interface Item {
  id: number;
  name: string;
  rarity: number;
  /**
   * Descriptor del icono: la API no sirve imágenes, da la forma y el color para
   * que el cliente lo dibuje. Ver src/lib/catalog/item-icons.ts.
   */
  iconKind: string | null;
  iconColor: string | null;
}

/**
 * Umbrales de tamaño que reparten las coronas. Vienen de la API, así que la app
 * puede deducir qué coronas tiene alguien a partir del tamaño que le salió,
 * en vez de pedirle que marque casillas.
 */
export interface MonsterSize {
  base: number;
  /** Corona pequeña: se obtiene con un ejemplar de este tamaño o menor. */
  mini: number;
  /** Corona de plata: de este tamaño o mayor. */
  silver: number;
  /** Corona de oro: de este tamaño o mayor. */
  gold: number;
}

/** Una debilidad o resistencia, con el nivel tipo estrellas cuando lo hay. */
export interface MonsterAffinity {
  /** 'element' | 'status' en debilidades; 'element' | 'effect' en resistencias. */
  kind: string;
  /** El elemento, estado o efecto concreto. */
  what: string;
  /** 1 a 3 en las debilidades; null en las resistencias. */
  level: number | null;
  /** Cuándo aplica, si es condicional (p. ej. solo enfurecido). */
  condition: string | null;
}

/**
 * Una parte del monstruo con sus multiplicadores de daño: es la tabla de zonas
 * de impacto, lo que decide dónde conviene golpear.
 */
export interface MonsterPart {
  kind: string;
  /** Ya traducido al idioma del catálogo. */
  name: string;
  health: number | null;
  /** Color del extracto para el insectoglaive. */
  kinsectEssence: string | null;
  multipliers: Record<string, number>;
}

export interface MonsterReward {
  itemId: number;
  conditions: {
    kind: string;
    rank: string | null;
    quantity: number;
    /** Probabilidad en porcentaje. */
    chance: number | null;
    part: string | null;
  }[];
}

export interface Monster {
  id: number;
  name: string;
  species: string;
  size: MonsterSize | null;
  elements: string[];
  weaknesses: MonsterAffinity[];
  resistances: MonsterAffinity[];
  parts: MonsterPart[];
  rewards: MonsterReward[];
  locations: { name: string; zones: number | null }[];
  /**
   * Niveles que declara la API para este monstruo. Es la fuente buena: antes se
   * deducía de si existía el archivo del icono, y eso hacía desaparecer la fila
   * de un nivel que sí existe cuando falta su imagen.
   */
  variants: string[];
  description: string | null;
  tips: string | null;
  baseHealth: number | null;
}

export interface Catalog {
  /** Marca de tiempo del import; el cliente la usa para invalidar su caché. */
  version: string;
  locale: string;
  skills: Skill[];
  armor: ArmorPiece[];
  armorSets: ArmorSet[];
  decorations: Decoration[];
  charms: Charm[];
  weapons: Weapon[];
  items: Item[];
  /** Solo los grandes: son los que tienen coronas. */
  monsters: Monster[];
}

/** Índices por id, para no andar buscando linealmente en el cliente. */
export interface CatalogIndex {
  catalog: Catalog;
  skillById: Map<number, Skill>;
  armorById: Map<number, ArmorPiece>;
  armorSetById: Map<number, ArmorSet>;
  decorationById: Map<number, Decoration>;
  charmById: Map<number, Charm>;
  itemById: Map<number, Item>;
  weaponById: Map<number, Weapon>;
  monsterById: Map<number, Monster>;
  /** Piezas agrupadas por ranura, que es como las recorre el solver. */
  armorByKind: Record<ArmorKind, ArmorPiece[]>;
}

export function indexCatalog(catalog: Catalog): CatalogIndex {
  const armorByKind = {
    head: [], chest: [], arms: [], waist: [], legs: [],
  } as Record<ArmorKind, ArmorPiece[]>;
  for (const piece of catalog.armor) {
    if (armorByKind[piece.kind]) armorByKind[piece.kind].push(piece);
  }

  return {
    catalog,
    skillById: new Map(catalog.skills.map((s) => [s.id, s])),
    armorById: new Map(catalog.armor.map((a) => [a.id, a])),
    armorSetById: new Map(catalog.armorSets.map((s) => [s.id, s])),
    decorationById: new Map(catalog.decorations.map((d) => [d.id, d])),
    charmById: new Map(catalog.charms.map((c) => [c.id, c])),
    itemById: new Map(catalog.items.map((i) => [i.id, i])),
    weaponById: new Map(catalog.weapons.map((w) => [w.id, w])),
    monsterById: new Map((catalog.monsters ?? []).map((m) => [m.id, m])),
    armorByKind,
  };
}
