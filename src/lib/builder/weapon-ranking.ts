/**
 * Las armas que destacan dentro de un tipo, por criterio.
 *
 * Esto sí sale de los datos, no de opinión: ataque, afinidad, ranuras y elemento
 * están en el catálogo. Pero **no es una tier list**, y conviene decirlo donde se
 * muestre: la API no trae afilado ni valores de movimiento, y en Monster Hunter
 * eso decide media comparación. Un espadón de 1200 con afilado verde y otro de
 * 1104 con blanco no se ordenan por el número que tenemos.
 *
 * Por eso se ofrecen varios criterios en vez de un único «mejor»: en el propio
 * catálogo se contradicen —el de más ataque bruto del espadón lleva −20 % de
 * afinidad— y esa contradicción es información, no ruido que haya que esconder.
 */
import type { Weapon } from '../catalog/types.ts';

export type RankingKey = 'effective' | 'raw' | 'slots' | 'element';

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
  const keys: RankingKey[] = ['effective', 'raw', 'slots', 'element'];
  return keys.filter((key) => rankWeapons(weapons, kind, key, 1).length > 0);
}
