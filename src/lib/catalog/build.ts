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
  Monster,
  MonsterAffinity,
  MonsterPart,
  MonsterReward,
  Skill,
  SkillGrant,
  SkillKind,
  Weapon,
} from './types.ts';

import { compareByGameOrder } from './monster-icons.ts';

const API_BASE = 'https://wilds.mhdb.io';

/**
 * Los nombres de parte llegan de la API como claves en inglés ('left-wing').
 * Sus traducciones viven en un archivo aparte del mismo proyecto, que la propia
 * documentación de la API señala.
 */
const PART_NAMES_URL =
  'https://raw.githubusercontent.com/LartTyler/mhdb-wilds-data/main/output/merged/PartNames.json';

/**
 * Partes que el archivo de origen trae sin traducir en ningún idioma. Es un
 * hueco de sus datos, no del nuestro: sin esto se mostraría la clave cruda.
 */
const PART_NAME_FALLBACK: Record<string, Record<string, string>> = {
  hide: { en: 'Hide', es: 'Piel', 'es-419': 'Piel' },
};

async function fetchPartNames(locale: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const res = await fetch(PART_NAMES_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entries = (await res.json()) as { part: string; names: Record<string, string> }[];
    for (const entry of entries) {
      if (!entry.part) continue;
      // es-419 antes que es: son distintos y el latino es el que usa el juego aquí.
      const name =
        entry.names?.[locale] ||
        PART_NAME_FALLBACK[entry.part]?.[locale] ||
        entry.names?.en ||
        PART_NAME_FALLBACK[entry.part]?.en;
      if (name) out.set(entry.part, name);
    }
  } catch (err) {
    // Sin traducciones se muestran las claves: es fea pero legible, y no vale
    // tumbar la sincronización entera del catálogo por esto.
    console.warn('[catalog] no se pudieron leer los nombres de parte:', err);
  }
  return out;
}

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

/**
 * Igual que `materialsOf`, pero para una lista suelta: las armas traen sus
 * materiales directamente en `crafting`, no colgando de `crafting.materials`.
 */
function materialList(raw: unknown): Material[] {
  if (!Array.isArray(raw)) return [];
  const out: Material[] = [];
  for (const entry of raw as Raw[]) {
    const itemId = entry?.item?.id;
    const quantity = entry?.quantity;
    if (typeof itemId === 'number' && typeof quantity === 'number') {
      out.push({ itemId, quantity });
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

/** Debilidades y resistencias comparten forma; solo cambia el campo que nombran. */
function affinities(raw: unknown): MonsterAffinity[] {
  if (!Array.isArray(raw)) return [];
  const out: MonsterAffinity[] = [];
  for (const entry of raw as Raw[]) {
    const what = entry?.element ?? entry?.status ?? entry?.effect;
    if (typeof what !== 'string') continue;
    out.push({
      kind: entry?.kind ?? 'element',
      what,
      level: typeof entry?.level === 'number' ? entry.level : null,
      condition: entry?.condition?.trim?.() || null,
    });
  }
  // Primero las más débiles, que es el orden en que se leen.
  return out.sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.what.localeCompare(b.what));
}

function parts(raw: unknown, names: Map<string, string>): MonsterPart[] {
  if (!Array.isArray(raw)) return [];
  const out: MonsterPart[] = [];
  for (const entry of raw as Raw[]) {
    const kind = entry?.kind ?? entry?.part;
    if (typeof kind !== 'string') continue;
    const multipliers: Record<string, number> = {};
    for (const [key, value] of Object.entries(entry?.multipliers ?? {})) {
      if (typeof value === 'number') multipliers[key] = value;
    }
    out.push({
      kind,
      name: names.get(kind) ?? kind,
      health: typeof entry?.health === 'number' ? entry.health : null,
      kinsectEssence: entry?.kinsectEssence ?? null,
      multipliers,
    });
  }
  return out;
}

function rewards(raw: unknown): MonsterReward[] {
  if (!Array.isArray(raw)) return [];
  const out: MonsterReward[] = [];
  for (const entry of raw as Raw[]) {
    const itemId = entry?.item?.id;
    if (typeof itemId !== 'number') continue;
    out.push({
      itemId,
      conditions: (entry?.conditions ?? [])
        .filter((c: Raw) => typeof c?.kind === 'string')
        .map((c: Raw) => ({
          kind: c.kind,
          rank: c.rank ?? null,
          quantity: typeof c.quantity === 'number' ? c.quantity : 1,
          chance: typeof c.chance === 'number' ? c.chance : null,
          part: c.part ?? null,
        })),
    });
  }
  return out;
}

export async function buildCatalog(locale: string): Promise<Catalog> {
  const [rawSkills, rawArmor, rawSets, rawDecos, rawCharms, rawWeapons, rawItems, rawMonsters] =
    await Promise.all([
      fetchResource(locale, 'skills'),
      fetchResource(locale, 'armor'),
      fetchResource(locale, 'armor/sets'),
      fetchResource(locale, 'decorations'),
      fetchResource(locale, 'charms'),
      fetchResource(locale, 'weapons'),
      fetchResource(locale, 'items'),
      fetchResource(locale, 'monsters'),
    ]);

  const partNames = await fetchPartNames(locale);

  const skills: Skill[] = rawSkills.map((s) => ({
    id: s.id,
    name: s.name,
    kind: (s.kind ?? 'armor') as SkillKind,
    description: s.description?.trim() || null,
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
    // Lo rellena `applyMonsterAttribution` al cargar: necesita los monstruos y
    // las piezas ya montados, y aquí todavía se están construyendo.
    monsterId: null,
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
    const crafting = w.crafting;
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
      // Arcos y ballestas no tienen filo: la API manda null y se respeta, que
      // no es lo mismo que un filo de cero.
      sharpness: w.sharpness ?? null,
      handicraft: Array.isArray(w.handicraft) ? w.handicraft : [],
      seriesId: w.series?.id ?? null,
      seriesName: w.series?.name ?? null,
      crafting: crafting
        ? {
            craftable: Boolean(crafting.craftable),
            previousId: crafting.previous?.id ?? crafting.previous ?? null,
            branchIds: (crafting.branches ?? [])
              .map((b: Raw) => (typeof b === 'number' ? b : b?.id))
              .filter((id: unknown): id is number => typeof id === 'number'),
            craftMaterials: materialList(crafting.craftingMaterials),
            upgradeMaterials: materialList(crafting.upgradeMaterials),
            craftZenny: crafting.craftingZennyCost ?? 0,
            upgradeZenny: crafting.upgradeZennyCost ?? 0,
            row: crafting.row ?? 0,
            column: crafting.column ?? 0,
          }
        : null,
    };
  });

  const items: Item[] = rawItems.map((i) => ({
    id: i.id,
    name: i.name,
    rarity: i.rarity ?? 1,
    iconKind: i.icon?.kind ?? null,
    iconColor: i.icon?.color ?? null,
  }));

  // Solo los grandes: los pequeños no tienen coronas ni entran en el registro.
  const monsters: Monster[] = rawMonsters
    .filter((m) => m.kind === 'large')
    .map((m) => {
      const size = m.size ?? null;
      return {
        id: m.id,
        name: m.name,
        species: m.species ?? 'unknown',
        // Sin los cuatro umbrales no se puede deducir ninguna corona.
        size:
          size && ['base', 'mini', 'silver', 'gold'].every((k) => typeof size[k] === 'number')
            ? { base: size.base, mini: size.mini, silver: size.silver, gold: size.gold }
            : null,
        elements: (m.elements ?? []).filter((e: unknown) => typeof e === 'string'),
        weaknesses: affinities(m.weaknesses),
        resistances: affinities(m.resistances),
        parts: parts(m.parts, partNames),
        rewards: rewards(m.rewards),
        locations: (m.locations ?? [])
          .map((l: Raw) => ({ name: l?.name ?? '', zones: l?.zoneCount ?? null }))
          .filter((l: { name: string }) => l.name),
        variants: (m.variants ?? [])
          .map((v: Raw) => v?.kind)
          .filter((k: unknown): k is string => typeof k === 'string'),
        description: m.description?.trim() || null,
        tips: m.tips?.trim() || null,
        baseHealth: typeof m.baseHealth === 'number' ? m.baseHealth : null,
      };
    })
    // El orden por defecto de la guía de campo, no el alfabético.
    .sort(compareByGameOrder);

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
    monsters,
  };
}
