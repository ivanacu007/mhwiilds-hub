/**
 * Qué hay que cazar, y en qué orden, para tener un set entero.
 *
 * Junta tres cosas que ya estaban sueltas: lo que pide cada pieza
 * (`materials`), lo que hay en la caja (`inventory.materials`) y de dónde sale
 * cada material (`monster.rewards[].conditions`, con su vía y su probabilidad).
 * El resultado es la respuesta a «me siento a jugar, ¿qué cazo?».
 *
 * Un arma no es un paso: es una cadena. Para llegar a Bone Slasher hay que
 * forjar Bone Blade I, II, III y IV antes, y cada eslabón cuesta lo suyo. Por
 * eso el plan del arma se calcula subiendo por `previousId` hasta encontrar una
 * que ya tengas —o la raíz— y devuelve los eslabones que faltan, en orden.
 */
import type { ArmorKind, CatalogIndex, Material } from './types.ts';

export interface MaterialNeed {
  itemId: number;
  need: number;
  have: number;
  /** De dónde sale, ya ordenado por probabilidad. */
  sources: {
    monsterId: number;
    kind: string;
    rank: string | null;
    chance: number | null;
    part: string | null;
    quantity: number;
  }[];
}

export interface PlanStep {
  key: string;
  kind: 'armor' | 'weapon';
  id: number;
  name: string;
  /** Ranura, para el icono; en armas es el tipo. */
  icon: string;
  slotLabel: ArmorKind | 'weapon';
  owned: boolean;
  /** Vacío si con lo que hay en la caja alcanza. */
  missing: MaterialNeed[];
  /** Todo lo que pide la receta, tenga o no. */
  recipe: Material[];
  /** El arma sale de mejorar otra; este es el eslabón anterior. */
  upgradeFrom: string | null;
}

export interface FarmPlan {
  steps: PlanStep[];
  total: number;
  owned: number;
  /** Materiales que faltan en total, agrupados y ordenados por monstruo. */
  byMonster: { monsterId: number; items: { itemId: number; need: number }[] }[];
}

export function buildFarmPlan(
  index: CatalogIndex,
  inventory: { armor: number[]; weapons: number[]; materials: Record<string, number> },
  set: {
    weaponId: number | null;
    pieces: Partial<Record<ArmorKind, number | null>>;
  },
): FarmPlan {
  const ownedArmor = new Set(inventory.armor ?? []);
  const ownedWeapons = new Set(inventory.weapons ?? []);

  /** itemId -> de qué monstruos sale y cómo. */
  const sourcesOf = (itemId: number): MaterialNeed['sources'] => {
    const out: MaterialNeed['sources'] = [];
    for (const monster of index.catalog.monsters) {
      const reward = monster.rewards.find((r) => r.itemId === itemId);
      if (!reward) continue;
      for (const condition of reward.conditions) {
        out.push({
          monsterId: monster.id,
          kind: condition.kind,
          rank: condition.rank,
          chance: condition.chance,
          part: condition.part,
          quantity: condition.quantity,
        });
      }
    }
    // Lo más probable primero: es por donde conviene ir.
    return out.sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0));
  };

  /**
   * La caja se va gastando según avanza el plan: si dos piezas piden la misma
   * escama, la segunda no puede contar con la que se lleva la primera.
   */
  const stock = new Map<number, number>();
  for (const [id, count] of Object.entries(inventory.materials ?? {})) {
    stock.set(Number(id), count);
  }

  const need = (recipe: Material[]): MaterialNeed[] => {
    const out: MaterialNeed[] = [];
    for (const material of recipe) {
      const have = stock.get(material.itemId) ?? 0;
      const take = Math.min(have, material.quantity);
      stock.set(material.itemId, have - take);
      if (take < material.quantity) {
        out.push({
          itemId: material.itemId,
          need: material.quantity,
          have: take,
          sources: sourcesOf(material.itemId),
        });
      }
    }
    return out;
  };

  const steps: PlanStep[] = [];

  // --- El arma, con toda su cadena de mejora ---
  if (set.weaponId != null) {
    const chain: number[] = [];
    let cursor: number | null = set.weaponId;
    const guard = new Set<number>();
    while (cursor != null && !guard.has(cursor)) {
      guard.add(cursor);
      const weapon = index.weaponById.get(cursor);
      if (!weapon) break;
      chain.unshift(cursor);
      // Al llegar a una que ya tienes, el resto de la cadena ya está hecho.
      if (ownedWeapons.has(cursor)) break;
      cursor = weapon.crafting?.previousId ?? null;
    }

    for (const [i, id] of chain.entries()) {
      const weapon = index.weaponById.get(id)!;
      const owned = ownedWeapons.has(id);
      const previous = weapon.crafting?.previousId != null
        ? index.weaponById.get(weapon.crafting.previousId) ?? null
        : null;
      const recipe = previous && (weapon.crafting?.upgradeMaterials.length ?? 0) > 0
        ? weapon.crafting!.upgradeMaterials
        : weapon.crafting?.craftMaterials ?? [];
      steps.push({
        key: `weapon-${id}`,
        kind: 'weapon',
        id,
        name: weapon.name,
        icon: weapon.kind,
        slotLabel: 'weapon',
        owned,
        recipe,
        missing: owned ? [] : need(recipe),
        // Solo se nombra el eslabón anterior si también forma parte del plan.
        upgradeFrom: i > 0 ? index.weaponById.get(chain[i - 1])?.name ?? null : null,
      });
    }
  }

  // --- Las piezas de armadura ---
  const pending: PlanStep[] = [];
  for (const [kind, armorId] of Object.entries(set.pieces) as [ArmorKind, number | null][]) {
    if (armorId == null) continue;
    const piece = index.armorById.get(armorId);
    if (!piece) continue;
    const owned = ownedArmor.has(armorId);
    pending.push({
      key: `armor-${armorId}`,
      kind: 'armor',
      id: armorId,
      name: piece.name,
      icon: kind,
      slotLabel: kind,
      owned,
      recipe: piece.materials,
      missing: owned ? [] : need(piece.materials),
      upgradeFrom: null,
    });
  }

  /**
   * Lo que ya se puede forjar, primero. Es la diferencia entre un plan y una
   * lista: si algo está a un clic de hacerse, hacerlo antes de salir a cazar.
   * Después, lo que menos falta. Lo ya forjado se va al final.
   */
  pending.sort((a, b) => {
    if (a.owned !== b.owned) return a.owned ? 1 : -1;
    const missA = a.missing.reduce((n, m) => n + (m.need - m.have), 0);
    const missB = b.missing.reduce((n, m) => n + (m.need - m.have), 0);
    return missA - missB;
  });
  steps.push(...pending);

  // --- Resumen por monstruo: a quién conviene visitar ---
  const perMonster = new Map<number, Map<number, number>>();
  for (const step of steps) {
    for (const material of step.missing) {
      const seen = new Set<number>();
      for (const source of material.sources) {
        if (seen.has(source.monsterId)) continue;
        seen.add(source.monsterId);
        if (!perMonster.has(source.monsterId)) perMonster.set(source.monsterId, new Map());
        const items = perMonster.get(source.monsterId)!;
        items.set(material.itemId, (items.get(material.itemId) ?? 0) + (material.need - material.have));
      }
    }
  }

  const byMonster = [...perMonster]
    .map(([monsterId, items]) => ({
      monsterId,
      items: [...items].map(([itemId, need]) => ({ itemId, need })),
    }))
    // El que más cosas de la lista cubre, primero.
    .sort((a, b) => b.items.length - a.items.length);

  return {
    steps,
    total: steps.length,
    owned: steps.filter((s) => s.owned).length,
    byMonster,
  };
}
