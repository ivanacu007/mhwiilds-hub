/**
 * Resuelve un perfil aflojándolo hasta que quepa.
 *
 * Un perfil pide cinco cosas a la vez y a veces no hay armadura en el juego que
 * las dé todas: medido, «Punto débil 5 + Instigador 5 + Plena forma 5 +
 * Resentimiento 5 + Ráfaga 5» no tiene solución. Devolver «no hay nada» sería
 * inútil, así que se suelta el objetivo de menor prioridad —el último de la
 * lista— y se reintenta, hasta que salga algo.
 *
 * Lo que se soltó se devuelve aparte: la pantalla tiene que decir «esto no llegó
 * a entrar» en vez de fingir que el perfil se cumplió entero.
 */
import { solve } from './solve.ts';
import type { CatalogIndex } from '../catalog/types.ts';
import type { SkillTarget, SolveRequest, SolveResponse } from './types.ts';

export interface ProfileResponse {
  /** La respuesta del solver con los objetivos que sí se pudieron pedir. */
  response: SolveResponse;
  /** Objetivos alcanzados, en el orden en que se pidieron. */
  used: SkillTarget[];
  /** Objetivos que hubo que soltar para que hubiera solución. */
  dropped: SkillTarget[];
}

export function solveProfile(request: SolveRequest, index: CatalogIndex): ProfileResponse {
  const list = request.targets.slice();
  const dropped: SkillTarget[] = [];

  while (list.length > 0) {
    const response = solve({ ...request, targets: list }, index);
    if (response.ok && response.solutions.length > 0) {
      return { response, used: list.slice(), dropped };
    }
    // El último es el de menor prioridad: la tabla de perfiles los ordena así.
    dropped.unshift(list.pop()!);
  }

  // Ni con un solo objetivo: se devuelve el último intento para que la pantalla
  // pueda explicar por qué, con los mismos mensajes que la búsqueda normal.
  return {
    response: solve({ ...request, targets: request.targets }, index),
    used: [],
    dropped: request.targets.slice(),
  };
}
