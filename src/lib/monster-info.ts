import type { MonsterAffinity, MonsterPart } from './catalog/types.ts';
import type { Translator } from './i18n/index.ts';

/**
 * Traduce un elemento, estado o efecto.
 *
 * La API los nombra en tres campos distintos según de qué tipo sean, pero la
 * app ya los normalizó a `{kind, what}`; aquí solo se elige el prefijo de la
 * clave. Si aparece uno nuevo se muestra su identificador en vez de romperse.
 */
export function affinityLabel(t: Translator, affinity: MonsterAffinity): string {
  const prefix =
    affinity.kind === 'status' ? 'st'
    : affinity.kind === 'effect' ? 'ef'
    : 'el';
  const key = `${prefix}.${affinity.what}`;
  const label = t(key as never);
  return label === key ? affinity.what : label;
}

/**
 * Separa debilidades por tipo.
 *
 * Mezclarlas y ordenar por nivel esconde lo que más se busca: los estados son
 * casi siempre nivel 2 o 3 y los elementos nivel 1, así que al recortar la
 * lista los elementos desaparecían en 32 de los 34 monstruos.
 */
export function splitAffinities(list: MonsterAffinity[]): {
  elements: MonsterAffinity[];
  statuses: MonsterAffinity[];
  effects: MonsterAffinity[];
} {
  const by = (kind: string) => list.filter((a) => a.kind === kind);
  return { elements: by('element'), statuses: by('status'), effects: by('effect') };
}

/** Nombre del tipo de daño de una columna de zonas de impacto. */
export function damageLabel(t: Translator, key: string): string {
  const full = `el.${key}`;
  const label = t(full as never);
  return label === full ? key : label;
}

/**
 * Orden de las columnas de la tabla de zonas: primero los tres tipos de daño
 * físico, luego los elementos, y el aturdimiento al final.
 */
export const DAMAGE_COLUMNS = [
  'slash', 'blunt', 'pierce',
  'fire', 'water', 'thunder', 'ice', 'dragon',
  'stun',
];

/**
 * Tinte según lo bueno que sea golpear ahí. Los umbrales son los de siempre en
 * la serie: 45 o más es zona blanda, y por debajo de 25 el daño casi rebota.
 */
export function hitzoneTone(value: number): string {
  const percent = value * 100;
  if (percent >= 45) return 'text-jade-400 font-semibold';
  if (percent >= 25) return 'text-base-100';
  if (percent > 0) return 'text-base-500';
  return 'text-base-700';
}

/** Los multiplicadores llegan como fracción (0.45) y se leen mejor como 45. */
export function formatMultiplier(value: number | undefined): string {
  if (value == null) return '—';
  return String(Math.round(value * 100));
}

/** La parte con mejor multiplicador para un tipo de daño, si alguna destaca. */
export function bestPartFor(parts: MonsterPart[], damage: string): MonsterPart | null {
  let best: MonsterPart | null = null;
  for (const part of parts) {
    const value = part.multipliers[damage];
    if (value == null) continue;
    if (!best || value > (best.multipliers[damage] ?? 0)) best = part;
  }
  return best;
}
