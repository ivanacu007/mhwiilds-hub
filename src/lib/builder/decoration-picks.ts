/**
 * Qué joya conviene meter en una ranura.
 *
 * Una lista de los 361 adornos ordenada por nombre no ayuda: en una ranura de
 * arma de nivel 3 caben casi trescientos. Lo que hace falta es saber cuáles
 * sirven **para este set**, y eso sale de cruzar tres cosas que ya existen:
 * las habilidades que persigue el arma (`weapon-skills.ts`), las del perfil de
 * juego (`armor-profiles.ts`) y lo que el set ya lleva puesto.
 *
 * Dos reglas del juego mandan sobre todo lo demás:
 *  - una joya de nivel N solo entra en ranuras de nivel N o mayor;
 *  - las de arma solo van al arma y las de armadura solo a la armadura.
 */
import type { CatalogIndex, Decoration } from '../catalog/types.ts';

export interface DecorationPick {
  decoration: Decoration;
  /** Cuántas tienes; 0 si ninguna. */
  owned: number;
  /**
   * Habilidades de esta joya que le interesan al set, con el nivel que aporta.
   * Vacío en las que solo se ofrecen por completar la lista.
   */
  wanted: { skillId: number; level: number; name: string }[];
  /** Para ordenar: cuánto aporta a lo que se busca. */
  score: number;
}

export interface PickContext {
  index: CatalogIndex;
  /** Ranura donde iría: decide qué joyas caben. */
  slot: number;
  kind: 'armor' | 'weapon';
  /** skillId -> nivel deseado. Del perfil, del arma o de los objetivos. */
  wantedSkills: Map<number, number>;
  /** Nivel actual de cada habilidad en el set, para no pasarse del máximo. */
  currentLevels: Map<number, number>;
  /** decorationId -> cantidad en el inventario. */
  owned: Record<string, number>;
}

/**
 * Las joyas que caben en la ranura, las útiles primero.
 *
 * Puntúa por lo que aporta a las habilidades buscadas y **no** cuenta lo que se
 * pasaría del máximo: una joya de Punto débil en un set que ya lo tiene a 5 no
 * aporta nada, por muy buscada que esté la habilidad.
 *
 * Las que dan dos habilidades útiles ganan solas, sin regla aparte: suman dos
 * veces. Son 173 de 361, así que no es un caso raro.
 */
export function pickDecorations(context: PickContext, limit = 12): DecorationPick[] {
  const { index, slot, kind, wantedSkills, currentLevels, owned } = context;

  const out: DecorationPick[] = [];
  for (const decoration of index.catalog.decorations) {
    if (decoration.kind !== kind) continue;
    // Una joya de nivel 3 no entra en una ranura de 1.
    if (decoration.slot > slot) continue;

    const wanted: DecorationPick['wanted'] = [];
    let score = 0;
    for (const grant of decoration.skills) {
      const want = wantedSkills.get(grant.skillId);
      if (want == null) continue;
      const skill = index.skillById.get(grant.skillId);
      const max = skill?.ranks.length ?? grant.level;
      const already = currentLevels.get(grant.skillId) ?? 0;
      // Solo cuenta lo que de verdad se puede subir.
      const useful = Math.max(0, Math.min(grant.level, max - already));
      if (useful <= 0) continue;
      wanted.push({ skillId: grant.skillId, level: grant.level, name: skill?.name ?? `#${grant.skillId}` });
      score += useful;
    }

    out.push({
      decoration,
      owned: owned[String(decoration.id)] ?? 0,
      wanted,
      score,
    });
  }

  return out
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // A igual aporte, la que ocupa ranura más pequeña: deja las grandes libres.
      if (a.decoration.slot !== b.decoration.slot) return a.decoration.slot - b.decoration.slot;
      // Y entre iguales, antes la que ya tienes.
      if ((b.owned > 0 ? 1 : 0) !== (a.owned > 0 ? 1 : 0)) return (b.owned > 0 ? 1 : 0) - (a.owned > 0 ? 1 : 0);
      return a.decoration.name.localeCompare(b.decoration.name);
    })
    .slice(0, limit);
}
