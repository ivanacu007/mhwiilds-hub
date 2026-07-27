/**
 * De qué monstruo sale cada serie de armadura.
 *
 * La API no lo dice: `armor/sets` no menciona monstruos por ningún lado. Pero la
 * receta de cada pieza sí trae los materiales, y cada monstruo trae sus botines,
 * así que el vínculo se deduce cruzando ambas listas.
 *
 * La deducción se hace sobre **materiales de firma**: los que suelta exactamente
 * un monstruo grande. Los genéricos (Hueso robusto, minerales) los comparte medio
 * juego y solo meterían ruido.
 *
 * Se resuelve con ids, no con nombres. Emparejar por nombre parece más directo y
 * funciona en inglés, pero en español el adjetivo cambia de sitio —«Rathalos β»
 * contra «Rathalos Guardián»— y desbarata once series. Los ids de material son
 * los mismos en todos los idiomas.
 */
import type { Catalog } from './types.ts';

/**
 * Cuántos materiales de firma del monstruo dominante hacen falta, y qué parte
 * del total tienen que ser. Medido contra los datos reales: con esto entran las
 * 106 series de monstruo (33 de los 34 grandes) y se quedan fuera las genéricas
 * —Hope, Bone, Alloy, los cosméticos— que apenas rozan un material suelto.
 */
const MIN_HITS = 3;
const MIN_SHARE = 0.5;

/** setId -> monsterId de las series que salen claramente de un monstruo. */
export function attributeSetsToMonsters(catalog: Catalog): Map<number, number> {
  const out = new Map<number, number>();
  if (catalog.monsters.length === 0 || catalog.armorSets.length === 0) return out;

  const owners = new Map<number, Set<number>>();
  for (const monster of catalog.monsters) {
    for (const reward of monster.rewards) {
      let set = owners.get(reward.itemId);
      if (!set) owners.set(reward.itemId, (set = new Set()));
      set.add(monster.id);
    }
  }

  const armorById = new Map(catalog.armor.map((piece) => [piece.id, piece]));

  for (const armorSet of catalog.armorSets) {
    const tally = new Map<number, number>();
    let total = 0;

    for (const pieceId of armorSet.pieceIds) {
      for (const material of armorById.get(pieceId)?.materials ?? []) {
        const from = owners.get(material.itemId);
        if (!from || from.size !== 1) continue;
        const monsterId = from.values().next().value as number;
        tally.set(monsterId, (tally.get(monsterId) ?? 0) + 1);
        total += 1;
      }
    }

    let bestId = 0;
    let bestHits = 0;
    for (const [monsterId, hits] of tally) {
      if (hits > bestHits) {
        bestHits = hits;
        bestId = monsterId;
      }
    }

    if (bestHits >= MIN_HITS && bestHits / total >= MIN_SHARE) out.set(armorSet.id, bestId);
  }

  return out;
}

/** Escribe la atribución sobre el catálogo, en sitio. */
export function applyMonsterAttribution(catalog: Catalog): void {
  const byMonster = attributeSetsToMonsters(catalog);
  for (const armorSet of catalog.armorSets) {
    armorSet.monsterId = byMonster.get(armorSet.id) ?? null;
  }
}
