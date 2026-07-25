import type { Monster } from './catalog/types.ts';
import type { MonsterProgress } from './models.ts';

export type CrownKind = 'mini' | 'silver' | 'gold';

export const CROWN_KINDS: CrownKind[] = ['mini', 'silver', 'gold'];

export const CROWN_LABEL: Record<CrownKind, string> = {
  mini: 'Pequeña',
  silver: 'Plata',
  gold: 'Oro',
};

export function emptyProgress(): MonsterProgress {
  return {
    smallest: null,
    largest: null,
    hunted: 0,
    captured: 0,
    manualMini: false,
    manualSilver: false,
    manualGold: false,
  };
}

export interface CrownState {
  earned: boolean;
  /** true si viene de un tamaño registrado, false si se marcó a mano. */
  fromSize: boolean;
}

export interface MonsterCrowns {
  mini: CrownState;
  silver: CrownState;
  gold: CrownState;
  /**
   * Cuánto falta para la siguiente corona que se puede conseguir creciendo.
   * Null si ya las tiene todas, si no hay umbrales, o si lo que falta es la
   * pequeña (que se consigue cazando más chico, no más grande).
   */
  nextGoal: { kind: CrownKind; needed: number; target: number } | null;
}

/**
 * Deduce las coronas de un monstruo.
 *
 * La pequeña se gana cazando por DEBAJO del umbral; plata y oro, por encima.
 * Confundir el sentido es el error fácil aquí.
 */
export function deriveCrowns(monster: Monster, raw: MonsterProgress | undefined): MonsterCrowns {
  const p = raw ?? emptyProgress();
  const size = monster.size;

  const bySize = (kind: CrownKind): boolean => {
    if (!size) return false;
    if (kind === 'mini') return p.smallest != null && p.smallest <= size.mini;
    const threshold = kind === 'silver' ? size.silver : size.gold;
    return p.largest != null && p.largest >= threshold;
  };

  const manual: Record<CrownKind, boolean> = {
    mini: p.manualMini,
    silver: p.manualSilver,
    gold: p.manualGold,
  };

  const state = (kind: CrownKind): CrownState => {
    const fromSize = bySize(kind);
    return { earned: fromSize || manual[kind], fromSize };
  };

  const crowns = { mini: state('mini'), silver: state('silver'), gold: state('gold') };

  let nextGoal: MonsterCrowns['nextGoal'] = null;
  if (size && p.largest != null) {
    for (const kind of ['silver', 'gold'] as const) {
      if (crowns[kind].earned) continue;
      const target = kind === 'silver' ? size.silver : size.gold;
      nextGoal = { kind, needed: Math.max(0, target - p.largest), target };
      break;
    }
  }

  return { ...crowns, nextGoal };
}

export interface CrownTally {
  mini: number;
  silver: number;
  gold: number;
  /** Monstruos con las tres coronas. */
  complete: number;
  total: number;
}

export function tallyCrowns(
  monsters: Monster[],
  progress: Record<string, MonsterProgress>,
): CrownTally {
  const tally: CrownTally = { mini: 0, silver: 0, gold: 0, complete: 0, total: monsters.length };

  for (const monster of monsters) {
    const crowns = deriveCrowns(monster, progress[String(monster.id)]);
    if (crowns.mini.earned) tally.mini += 1;
    if (crowns.silver.earned) tally.silver += 1;
    if (crowns.gold.earned) tally.gold += 1;
    if (crowns.mini.earned && crowns.silver.earned && crowns.gold.earned) tally.complete += 1;
  }

  return tally;
}

/** Los tamaños se muestran con dos decimales, igual que en el juego. */
export function formatSize(value: number | null): string {
  return value == null ? '—' : value.toFixed(2);
}

/** Saneado de lo que llega del cliente. */
export function cleanProgress(raw: unknown): MonsterProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const size = (value: unknown): number | null => {
    const n = Number(value);
    // Los tamaños del juego rondan 100–6000; fuera de ahí es basura.
    if (!Number.isFinite(n) || n <= 0 || n > 100000) return null;
    return Math.round(n * 100) / 100;
  };

  const count = (value: unknown): number => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.floor(n), 99999);
  };

  let smallest = size(r.smallest);
  let largest = size(r.largest);
  // Si llegan al revés, se ordenan en vez de rechazar la captura entera.
  if (smallest != null && largest != null && smallest > largest) {
    [smallest, largest] = [largest, smallest];
  }

  const progress: MonsterProgress = {
    smallest,
    largest,
    hunted: count(r.hunted),
    captured: count(r.captured),
    manualMini: r.manualMini === true,
    manualSilver: r.manualSilver === true,
    manualGold: r.manualGold === true,
  };

  const isEmpty =
    progress.smallest == null && progress.largest == null &&
    progress.hunted === 0 && progress.captured === 0 &&
    !progress.manualMini && !progress.manualSilver && !progress.manualGold;

  // Guardar entradas vacías solo engordaría el documento.
  return isEmpty ? null : progress;
}
