/**
 * Lo que da un conjunto de piezas puestas: defensa, resistencias, habilidades y
 * bonus de serie y grupo.
 *
 * Existe porque la cuenta se hacía en dos sitios —la página de un set guardado y
 * el armador— y el bonus de grupo es fácil de contar mal: varias series comparten
 * grupo y sus piezas suman juntas, así que llevar la cuenta por serie nunca lo
 * activa. Con una sola función, un fallo aquí se ve en las dos pantallas a la vez
 * en lugar de esconderse en una.
 *
 * Acepta sets a medias: el armador deja fijar una pieza suelta, y ahí lo que
 * interesa es justamente cuánto falta.
 */
import type { ArmorKind, BonusRank, CatalogIndex } from './types.ts';
import { ARMOR_KINDS } from './types.ts';

export interface LoadoutPiece {
  armorId: number;
  /** Adornos ya colocados, con el índice de la ranura que ocupan. */
  decorations?: { slotIndex: number; decorationId: number }[];
}

export interface Loadout {
  pieces: Partial<Record<ArmorKind, LoadoutPiece | null>>;
  weaponId?: number | null;
  weaponDecorations?: { slotIndex: number; decorationId: number }[];
  charmId?: number | null;
  charmLevel?: number | null;
}

/** Un bonus que ya está activo, con las piezas que lo sostienen. */
export interface ActiveBonus {
  /** Nombre del bonus, que es el que muestra el juego; puede faltar en la API. */
  name: string | null;
  count: number;
  ranks: BonusRank[];
}

export interface LoadoutSkill {
  skillId: number;
  name: string;
  /** Ya con el tope del nivel máximo aplicado. */
  level: number;
  max: number;
}

export interface LoadoutSummary {
  defense: number;
  resistances: Record<string, number>;
  /** De mayor nivel a menor, y a igualdad por nombre. */
  skills: LoadoutSkill[];
  freeArmorSlots: number[];
  freeWeaponSlots: number[];
  setBonuses: ActiveBonus[];
  groupBonuses: ActiveBonus[];
  /** Piezas de armadura puestas, de 0 a 5. */
  pieceCount: number;
}

export function summarizeLoadout(index: CatalogIndex, loadout: Loadout): LoadoutSummary {
  const totals = new Map<number, number>();
  const bump = (skillId: number, level: number) =>
    totals.set(skillId, (totals.get(skillId) ?? 0) + level);

  const resistances: Record<string, number> = {};
  const setCounts = new Map<number, number>();
  const groupCounts = new Map<number, number>();
  const freeArmorSlots: number[] = [];
  let defense = 0;
  let pieceCount = 0;

  const freeOf = (slots: number[], placed: { slotIndex: number }[] | undefined): number[] => {
    const taken = new Set((placed ?? []).map((d) => d.slotIndex));
    return slots.filter((_, i) => !taken.has(i));
  };

  for (const kind of ARMOR_KINDS) {
    const stored = loadout.pieces[kind];
    if (!stored) continue;
    const piece = index.armorById.get(stored.armorId);
    if (!piece) continue;

    pieceCount += 1;
    defense += piece.defense;
    for (const [element, value] of Object.entries(piece.resistances)) {
      resistances[element] = (resistances[element] ?? 0) + value;
    }
    for (const grant of piece.skills) bump(grant.skillId, grant.level);
    freeArmorSlots.push(...freeOf(piece.slots, stored.decorations));

    if (piece.setId != null) {
      setCounts.set(piece.setId, (setCounts.get(piece.setId) ?? 0) + 1);
      const groupId = index.armorSetById.get(piece.setId)?.groupId;
      if (groupId != null) groupCounts.set(groupId, (groupCounts.get(groupId) ?? 0) + 1);
    }

    for (const placed of stored.decorations ?? []) {
      const deco = index.decorationById.get(placed.decorationId);
      if (deco) for (const grant of deco.skills) bump(grant.skillId, grant.level);
    }
  }

  const weapon = loadout.weaponId != null ? index.weaponById.get(loadout.weaponId) : undefined;
  if (weapon) for (const grant of weapon.skills) bump(grant.skillId, grant.level);
  for (const placed of loadout.weaponDecorations ?? []) {
    const deco = index.decorationById.get(placed.decorationId);
    if (deco) for (const grant of deco.skills) bump(grant.skillId, grant.level);
  }
  const freeWeaponSlots = weapon
    ? freeOf(weapon.slots, loadout.weaponDecorations)
    : [];

  if (loadout.charmId != null) {
    const rank = index.charmById
      .get(loadout.charmId)
      ?.ranks.find((r) => r.level === loadout.charmLevel);
    if (rank) for (const grant of rank.skills) bump(grant.skillId, grant.level);
  }

  const setBonuses: ActiveBonus[] = [];
  for (const [setId, count] of setCounts) {
    const armorSet = index.armorSetById.get(setId);
    if (!armorSet) continue;
    const ranks = armorSet.setBonus.filter((bonus) => count >= bonus.pieces);
    for (const bonus of ranks) bump(bonus.skillId, bonus.level);
    if (ranks.length > 0) {
      setBonuses.push({ name: ranks[0].name ?? armorSet.name, count, ranks });
    }
  }

  const groupBonuses: ActiveBonus[] = [];
  for (const [groupId, count] of groupCounts) {
    // El bonus de grupo lo declaran todas las series del grupo por igual; basta
    // con la primera que aparezca.
    const owner = index.catalog.armorSets.find((s) => s.groupId === groupId);
    if (!owner) continue;
    const ranks = owner.groupBonus.filter((bonus) => count >= bonus.pieces);
    for (const bonus of ranks) bump(bonus.skillId, bonus.level);
    if (ranks.length > 0) groupBonuses.push({ name: ranks[0].name, count, ranks });
  }

  const skills: LoadoutSkill[] = [];
  for (const [skillId, level] of totals) {
    const skill = index.skillById.get(skillId);
    const max = skill?.ranks.reduce((m, r) => Math.max(m, r.level), 0) || level;
    skills.push({
      skillId,
      name: skill?.name ?? `#${skillId}`,
      // Ninguna habilidad pasa de su máximo por más fuentes que se apilen.
      level: Math.min(level, max),
      max,
    });
  }
  skills.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));

  return {
    defense,
    resistances,
    skills,
    freeArmorSlots: freeArmorSlots.sort((a, b) => b - a),
    freeWeaponSlots: freeWeaponSlots.sort((a, b) => b - a),
    setBonuses,
    groupBonuses,
    pieceCount,
  };
}
