/**
 * ¿Este set lo puedo forjar hoy?
 *
 * El armador propone sets con todo el catálogo, que es lo útil para planear,
 * pero luego no decía cuáles están al alcance. Aquí se cruza el set con el
 * inventario: qué piezas ya tienes, y de las que no, qué material te falta y de
 * qué monstruo sale.
 *
 * El reparto de materiales se hace pieza por pieza descontando de una bolsa
 * común. Dos piezas de la misma serie suelen pedir el mismo material, y contar
 * cada una por separado diría que puedes forjar las dos cuando solo te alcanza
 * para una.
 */
import { ARMOR_KINDS, type ArmorKind, type CatalogIndex } from './types.ts';

export interface MissingMaterial {
  itemId: number;
  /** Cuánto pide la receta. */
  need: number;
  /** Cuánto quedaba en la bolsa al llegar a esta pieza. */
  have: number;
}

export interface PieceAvailability {
  kind: ArmorKind;
  armorId: number;
  owned: boolean;
  /** Vacío si con lo que tienes te alcanza para forjarla. */
  missing: MissingMaterial[];
  /** Monstruo de la serie, deducido en monster-armor.ts; null si es genérica. */
  monsterId: number | null;
}

export interface SetAvailability {
  pieces: PieceAvailability[];
  ownedCount: number;
  total: number;
  /** Ya la llevas puesta entera. */
  complete: boolean;
  /** Lo que falta se puede forjar sin farmear nada más. */
  craftable: boolean;
}

export interface OwnedForCrafting {
  armor: number[];
  /** itemId -> cantidad, tal como lo guarda el inventario. */
  materials: Record<string, number>;
}

export function setAvailability(
  index: CatalogIndex,
  owned: OwnedForCrafting,
  armorIds: Partial<Record<ArmorKind, number | undefined>>,
): SetAvailability {
  const ownedArmor = new Set(owned.armor ?? []);
  // Bolsa común: cada pieza descuenta de aquí, así el reparto no cuenta dos
  // veces el mismo material.
  const pool = new Map<number, number>();
  for (const [itemId, count] of Object.entries(owned.materials ?? {})) {
    pool.set(Number(itemId), count);
  }

  const pieces: PieceAvailability[] = [];
  let ownedCount = 0;

  for (const kind of ARMOR_KINDS) {
    const armorId = armorIds[kind];
    if (armorId == null) continue;
    const piece = index.armorById.get(armorId);
    if (!piece) continue;

    const monsterId = piece.setId != null
      ? index.armorSetById.get(piece.setId)?.monsterId ?? null
      : null;

    if (ownedArmor.has(armorId)) {
      ownedCount += 1;
      pieces.push({ kind, armorId, owned: true, missing: [], monsterId });
      continue;
    }

    const missing: MissingMaterial[] = [];
    for (const material of piece.materials) {
      const have = pool.get(material.itemId) ?? 0;
      const take = Math.min(have, material.quantity);
      pool.set(material.itemId, have - take);
      if (take < material.quantity) {
        missing.push({ itemId: material.itemId, need: material.quantity, have: take });
      }
    }

    pieces.push({ kind, armorId, owned: false, missing, monsterId });
  }

  return {
    pieces,
    ownedCount,
    total: pieces.length,
    complete: pieces.length > 0 && ownedCount === pieces.length,
    craftable: pieces.every((p) => p.owned || p.missing.length === 0),
  };
}
