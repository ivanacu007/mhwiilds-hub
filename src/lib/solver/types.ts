import type { ArmorKind } from '../catalog/types.ts';

export interface SkillTarget {
  skillId: number;
  level: number;
}

export interface OwnedInventory {
  /** decorationId -> cantidad. */
  decorations: Record<string, number>;
  /** charmId -> rango máximo forjado. */
  charms: Record<string, number>;
  /**
   * Ids de armadura poseída. Si es null, el solver considera todas las piezas
   * del juego (modo "qué podría armar si la forjo").
   */
  armor: number[] | null;
}

export interface SolveRequest {
  targets: SkillTarget[];
  inventory: OwnedInventory;
  weaponId: number | null;
  /** Rango de las piezas a considerar. */
  rank: 'all' | 'high' | 'low';
  maxResults: number;
  /** Corte duro por si alguien pide algo absurdo; el solver devuelve lo que llevaba. */
  timeBudgetMs: number;
}

export interface PlacedDecoration {
  slotIndex: number;
  decorationId: number;
}

export interface SolutionPiece {
  armorId: number;
  decorations: PlacedDecoration[];
}

export interface Solution {
  pieces: Record<ArmorKind, SolutionPiece>;
  charmId: number | null;
  charmLevel: number | null;
  weaponId: number | null;
  weaponDecorations: PlacedDecoration[];
  /** skillId -> nivel alcanzado (incluye bonus de serie y grupo). */
  skills: Record<number, number>;
  defense: number;
  resistances: Record<string, number>;
  /** Slots de armadura que quedaron libres, por tamaño. */
  freeArmorSlots: number[];
  freeWeaponSlots: number[];
  score: number;
}

export type SolveResponse =
  | { ok: true; solutions: Solution[]; searched: number; elapsedMs: number; truncated: boolean }
  | {
      ok: false;
      /**
       * Las habilidades de arma solo salen del arma y de sus adornos: ninguna
       * pieza de armadura las da. Pedirlas sin arma equipada no tiene solución
       * posible, y decirlo así es más útil que un "no encontré nada".
       */
      reason: 'falta-arma';
      weaponSkills: SkillTarget[];
      elapsedMs: number;
    }
  | {
      ok: false;
      reason: 'sin-solucion';
      /** Objetivos que no se alcanzaron ni con el mejor intento. */
      unreachable: SkillTarget[];
      /**
       * Si con inventario ilimitado sí habría solución, aquí van los adornos
       * que harían falta: es la respuesta a "¿qué me falta?".
       */
      missingDecorations: { decorationId: number; quantity: number }[];
      elapsedMs: number;
    };
