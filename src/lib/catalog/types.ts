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

export interface Monster {
  id: number;
  name: string;
  species: string;
  size: MonsterSize | null;
  elements: string[];
  weaknesses: string[];
  locations: string[];
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

/** Nivel máximo que puede alcanzar una habilidad. */
export function maxSkillLevel(skill: Skill): number {
  return skill.ranks.reduce((max, r) => Math.max(max, r.level), 0);
}
