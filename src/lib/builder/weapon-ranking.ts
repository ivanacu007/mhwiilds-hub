/**
 * Las armas que destacan dentro de un tipo, por criterio.
 *
 * Esto sí sale de los datos, no de opinión: ataque, afinidad, ranuras, elemento
 * y filo están en el catálogo. Pero **no es una tier list**: faltan los valores
 * de movimiento, que en Monster Hunter deciden buena parte de la comparación
 * entre dos armas del mismo tipo.
 *
 * Por eso se ofrecen varios criterios en vez de un único «mejor»: en el propio
 * catálogo se contradicen —el de más ataque bruto del espadón lleva −20 % de
 * afinidad— y esa contradicción es información, no ruido que haya que esconder.
 */
import type { Weapon } from '../catalog/types.ts';

export type RankingKey = 'effective' | 'raw' | 'sharpness' | 'slots' | 'element';

/**
 * Cuánto filo bueno trae, para poder ordenar por ello.
 *
 * Pesa por color y no cuenta unidades a secas: media barra blanca vale más que
 * una entera amarilla, y sumarlas por igual pondría por delante a la peor.
 */
const SHARPNESS_WEIGHT = { red: 0, orange: 1, yellow: 2, green: 3, blue: 4, white: 5, purple: 6 } as const;

export function sharpnessScore(weapon: Weapon): number {
  if (!weapon.sharpness) return 0;
  let total = 0;
  let weighted = 0;
  for (const [color, weight] of Object.entries(SHARPNESS_WEIGHT)) {
    const units = weapon.sharpness[color as keyof typeof SHARPNESS_WEIGHT] ?? 0;
    total += units;
    weighted += units * weight;
  }
  return total > 0 ? weighted / total : 0;
}

export interface RankedWeapon {
  weapon: Weapon;
  /** Valor del criterio, ya redondeado para mostrar. */
  value: number;
}

/**
 * Ataque efectivo: la aproximación de siempre, ataque por el promedio que
 * aportan los críticos. Un 25 % de afinidad multiplica por 1.0625; una afinidad
 * negativa resta, que es justo lo que se pierde de vista mirando solo el bruto.
 */
export function effectiveRaw(weapon: Weapon): number {
  // La misma fórmula sirve para los dos signos: un crítico pega al 125 % (+0.25)
  // y uno negativo al 75 % (−0.25), así que −20 % de afinidad da 1 − 0.05 = 0.95
  // sin necesidad de tratarlo aparte.
  return weapon.attack * (1 + (weapon.affinity / 100) * 0.25);
}

export function slotCapacity(weapon: Weapon): number {
  return weapon.slots.reduce((total, level) => total + level, 0);
}

/** Las mejores `limit` de ese tipo según el criterio, ya ordenadas. */
export function rankWeapons(
  weapons: Weapon[],
  kind: string,
  key: RankingKey,
  limit = 5,
): RankedWeapon[] {
  const pool = weapons.filter((w) => w.kind === kind);

  const scored: RankedWeapon[] = pool
    .map((weapon) => {
      switch (key) {
        case 'effective': return { weapon, value: Math.round(effectiveRaw(weapon)) };
        case 'raw': return { weapon, value: weapon.attack };
        case 'sharpness': return { weapon, value: sharpnessScore(weapon) };
        case 'slots': return { weapon, value: slotCapacity(weapon) };
        case 'element': return { weapon, value: weapon.element?.damage ?? 0 };
      }
    })
    // Sin elemento no compite en el criterio de elemento; con 0 ranuras tampoco
    // tiene sentido listarla como «la que más ranuras trae».
    .filter((entry) => entry.value > 0);

  return scored
    .sort((a, b) => b.value - a.value
      // A igualdad, la de más ataque efectivo: es el desempate menos arbitrario.
      || effectiveRaw(b.weapon) - effectiveRaw(a.weapon)
      || a.weapon.name.localeCompare(b.weapon.name))
    .slice(0, limit);
}

/** Los criterios que tienen algo que enseñar para ese tipo. */
export function availableRankings(weapons: Weapon[], kind: string): RankingKey[] {
  const keys: RankingKey[] = ['effective', 'raw', 'sharpness', 'slots', 'element'];
  return keys.filter((key) => rankWeapons(weapons, kind, key, 1).length > 0);
}
