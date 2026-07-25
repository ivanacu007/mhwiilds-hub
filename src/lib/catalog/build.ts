/**
 * Descarga el catálogo de wilds.mhdb.io y lo adelgaza a la forma que usa la app.
 *
 * Vive aparte del script de sincronización para poder probar la transformación
 * sin necesidad de Mongo (`npm run sync:catalog -- --dry-run`).
 */
import type {
  ArmorKind,
  ArmorPiece,
  ArmorSet,
  BonusRank,
  Catalog,
  Charm,
  Decoration,
  Item,
  Material,
  Skill,
  SkillGrant,
  SkillKind,
  Weapon,
} from './types.ts';

const API_BASE = 'https://wilds.mhdb.io';

/** Lo que devuelve la API es más ancho que esto; solo declaramos lo que leemos. */
type Raw = Record<string, any>;

async function fetchResource(locale: string, path: string): Promise<Raw[]> {
  const url = `${API_BASE}/${locale}/${path}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`GET ${url} devolvió ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`GET ${url} no devolvió un array`);
  }
  return data as Raw[];
}

/**
 * Las habilidades propias de una pieza son las que no dependen de llevar varias
 * piezas puestas. Las que sí (`setPiecesRequired`) llegan por el set, no por la
 * pieza, y contarlas aquí las duplicaría.
 */
function ownSkills(raw: Raw): SkillGrant[] {
  const out: SkillGrant[] = [];
  for (const entry of raw.skills ?? []) {
    if (entry?.setPiecesRequired != null) continue;
    const skillId = entry?.skill?.id;
    const level = entry?.level;
    if (typeof skillId === 'number' && typeof level === 'number') {
      out.push({ skillId, level });
    }
  }
  return out;
}

function materialsOf(raw: Raw): Material[] {
  const out: Material[] = [];
  for (const entry of raw?.crafting?.materials ?? []) {
    const itemId = entry?.item?.id;
    const quantity = entry?.quantity;
    if (typeof itemId === 'number' && typeof quantity === 'number') {
      out.push({ itemId, quantity });
    }
  }
  return out;
}

function bonusRanks(bonus: Raw | null | undefined): BonusRank[] {
  const out: BonusRank[] = [];
  for (const rank of bonus?.ranks ?? []) {
    const pieces = rank?.pieces;
    const skillId = rank?.skill?.skill?.id;
    const level = rank?.skill?.level;
    if (typeof pieces !== 'number' || typeof skillId !== 'number' || typeof level !== 'number') {
      continue;
    }
    out.push({
      pieces,
      skillId,
      level,
      name: rank?.skill?.name ?? null,
      description: rank?.skill?.description ?? null,
    });
  }
  return out.sort((a, b) => a.pieces - b.pieces);
}

function slotsOf(raw: Raw): number[] {
  return (raw?.slots ?? []).filter((s: unknown): s is number => typeof s === 'number');
}

const VALID_ARMOR_KINDS = new Set<string>(['head', 'chest', 'arms', 'waist', 'legs']);

/** Los talismanes se llaman "Amuleto X I", "Amuleto X II"...; el nombre base es sin el numeral. */
function baseCharmName(rankName: string): string {
  return rankName.replace(/\s+[IVX]+$/, '').trim();
}

export async function buildCatalog(locale: string): Promise<Catalog> {
  const [rawSkills, rawArmor, rawSets, rawDecos, rawCharms, rawWeapons, rawItems] =
    await Promise.all([
      fetchResource(locale, 'skills'),
      fetchResource(locale, 'armor'),
      fetchResource(locale, 'armor/sets'),
      fetchResource(locale, 'decorations'),
      fetchResource(locale, 'charms'),
      fetchResource(locale, 'weapons'),
      fetchResource(locale, 'items'),
    ]);

  const skills: Skill[] = rawSkills.map((s) => ({
    id: s.id,
    name: s.name,
    kind: (s.kind ?? 'armor') as SkillKind,
    ranks: (s.ranks ?? []).map((r: Raw) => ({
      level: r.level,
      name: r.name ?? null,
      description: r.description ?? null,
    })),
  }));

  const armor: ArmorPiece[] = rawArmor
    .filter((a) => VALID_ARMOR_KINDS.has(a.kind))
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind as ArmorKind,
      rank: a.rank ?? 'low',
      rarity: a.rarity ?? 1,
      // El valor mostrado en el juego es la defensa mejorada al máximo.
      defense: a.defense?.max ?? a.defense?.base ?? 0,
      resistances: a.resistances ?? {},
      slots: slotsOf(a),
      skills: ownSkills(a),
      setId: a.armorSet?.id ?? null,
      materials: materialsOf(a),
    }));

  const armorSets: ArmorSet[] = rawSets.map((s) => ({
    id: s.id,
    name: s.name,
    pieceIds: (s.pieces ?? [])
      .map((p: Raw) => p?.id)
      .filter((id: unknown): id is number => typeof id === 'number'),
    setBonus: bonusRanks(s.bonus),
    groupId: s.groupBonus?.id ?? null,
    groupBonus: bonusRanks(s.groupBonus),
  }));

  const decorations: Decoration[] = rawDecos.map((d) => ({
    id: d.id,
    name: d.name,
    slot: d.slot ?? 1,
    kind: d.kind === 'weapon' ? 'weapon' : 'armor',
    rarity: d.rarity ?? 1,
    skills: ownSkills(d),
  }));

  const charms: Charm[] = rawCharms.map((c) => {
    const ranks = (c.ranks ?? []).map((r: Raw) => ({
      level: r.level,
      name: r.name,
      rarity: r.rarity ?? 1,
      skills: ownSkills(r),
      materials: materialsOf(r),
    }));
    ranks.sort((a: { level: number }, b: { level: number }) => a.level - b.level);
    return {
      id: c.id,
      // La API no da un nombre al talismán, solo a cada uno de sus rangos.
      name: ranks.length ? baseCharmName(ranks[0].name) : `Amuleto ${c.id}`,
      ranks,
    };
  });

  const weapons: Weapon[] = rawWeapons.map((w) => {
    const element = (w.specials ?? []).find(
      (s: Raw) => s?.kind === 'element' && !s?.hidden,
    );
    return {
      id: w.id,
      name: w.name,
      kind: w.kind ?? 'unknown',
      rarity: w.rarity ?? 1,
      slots: slotsOf(w),
      attack: w.damage?.display ?? w.damage?.raw ?? 0,
      affinity: w.affinity ?? 0,
      element: element
        ? { kind: element.element, damage: element.damage?.display ?? element.damage?.raw ?? 0 }
        : null,
      skills: ownSkills(w),
    };
  });

  const items: Item[] = rawItems.map((i) => ({
    id: i.id,
    name: i.name,
    rarity: i.rarity ?? 1,
  }));

  return {
    version: new Date().toISOString(),
    locale,
    skills,
    armor,
    armorSets,
    decorations,
    charms,
    weapons,
    items,
  };
}
