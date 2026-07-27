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
 * Color con el que se pinta una debilidad o resistencia.
 *
 * Elementos y estados tienen tono propio en la paleta; los efectos y trampas
 * no, y cae a un gris de texto en vez de inventarles uno: dos efectos con
 * colores parecidos se leerían como una familia que no existe.
 */
export function affinityTint(affinity: MonsterAffinity): string {
  if (affinity.kind === 'element') return `var(--el-${affinity.what})`;
  if (affinity.kind === 'status') return `var(--st-${affinity.what}, var(--text-2))`;
  return 'var(--text-3)';
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

/**
 * El repertorio completo del juego, en el orden en que se recita.
 *
 * La API solo enumera aquello a lo que el monstruo reacciona, y eso deja la
 * ficha coja: 30 de los 34 monstruos tienen una única debilidad elemental, así
 * que el bloque quedaba con una fila suelta y no respondía a la pregunta que
 * se hace de verdad, que es «¿le entra el hielo?». Con el repertorio delante,
 * un guion es una respuesta tan buena como tres estrellas.
 */
export const AFFINITY_VOCABULARY: Record<string, string[]> = {
  element: ['fire', 'water', 'thunder', 'ice', 'dragon'],
  status: ['poison', 'paralysis', 'sleep', 'blastblight'],
  effect: ['stun', 'exhaust', 'flash', 'noise'],
};

/** Una casilla del repertorio: débil con nivel, resistente, o ninguna de las dos. */
export interface AffinityCell {
  kind: string;
  what: string;
  /** 0 cuando el monstruo no es débil a esto. */
  level: number;
  resists: boolean;
  condition: string | null;
}

/**
 * Cruza debilidades y resistencias contra el repertorio para que las tres
 * columnas tengan siempre las mismas filas, monstruo tras monstruo. Un tipo que
 * la API no mencione sigue apareciendo: se ignora en silencio solo lo que no
 * está en el repertorio, y eso son datos nuevos, no huecos.
 */
export function affinityMatrix(
  kind: string,
  weaknesses: MonsterAffinity[],
  resistances: MonsterAffinity[],
): AffinityCell[] {
  const weak = new Map(weaknesses.filter((a) => a.kind === kind).map((a) => [a.what, a]));
  const resist = new Map(resistances.filter((a) => a.kind === kind).map((a) => [a.what, a]));

  // Lo que la API traiga y no esté en el repertorio va al final en vez de
  // desaparecer: un title update puede añadir un estado nuevo.
  const vocabulary = AFFINITY_VOCABULARY[kind] ?? [];
  const extra = [...weak.keys(), ...resist.keys()].filter((w) => !vocabulary.includes(w));

  return [...vocabulary, ...new Set(extra)].map((what) => {
    const hit = weak.get(what);
    return {
      kind,
      what,
      level: hit?.level ?? 0,
      resists: resist.has(what),
      condition: hit?.condition ?? resist.get(what)?.condition ?? null,
    };
  });
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
 * Tramo de la matriz de zonas. Los cortes son los del sistema de diseño; el
 * fondo tiñe muy bajo y el número conserva contraste en los cinco.
 */
export function hitzoneTone(value: number): string {
  const percent = Math.round(value * 100);
  if (percent === 0) return 'hz-0';
  if (percent <= 20) return 'hz-bad';
  if (percent <= 40) return 'hz-low';
  if (percent <= 60) return 'hz-mid';
  return 'hz-good';
}

/**
 * Puntos de tramo: segundo canal para que el nivel no dependa solo del color.
 * Cero se marca con guion largo y sin tinte.
 */
export function hitzoneDots(value: number): string {
  const percent = Math.round(value * 100);
  if (percent === 0) return '';
  if (percent <= 40) return '·';
  if (percent <= 60) return '··';
  return '···';
}

/** Los multiplicadores llegan como fracción (0.45) y se leen mejor como 45. */
export function formatMultiplier(value: number | undefined): string {
  if (value == null) return '—';
  const percent = Math.round(value * 100);
  // Cero se marca con guion largo: un "0" en una matriz de números se confunde
  // con un valor bajo, y aquí significa que el daño rebota del todo.
  return percent === 0 ? '—' : String(percent);
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
