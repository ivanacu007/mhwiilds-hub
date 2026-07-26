import type { Monster } from './catalog/types.ts';
import { MONSTER_VARIANTS, isMonsterVariant } from './catalog/monster-icons.ts';
import type { MonsterProgress, VariantCounts } from './models.ts';

/**
 * Coronas de Wilds: dos tamaños, y cada uno puede ser de plata o de oro.
 *
 *   pequeña plata · pequeña oro · grande plata · grande oro
 *
 * Las guías web hablan de "tres tipos de corona" porque enumeran los trofeos
 * (Miniatura, Plata, Oro), pero la guía de campo del juego muestra una ranura
 * para el ejemplar más pequeño y otra para el más grande, y cada una se llena
 * en plata o en oro según lo extremo que sea el tamaño.
 */
export type CrownSlot = 'small' | 'large';
export type CrownTier = 'silver' | 'gold';

/** Identificador plano, que es como se guarda y se recorre. */
export type CrownKey = 'smallSilver' | 'smallGold' | 'largeSilver' | 'largeGold';

export const CROWN_KEYS: CrownKey[] = ['smallSilver', 'smallGold', 'largeSilver', 'largeGold'];

export const CROWN_INFO: Record<CrownKey, { slot: CrownSlot; tier: CrownTier; label: string }> = {
  smallSilver: { slot: 'small', tier: 'silver', label: 'Pequeña plata' },
  smallGold: { slot: 'small', tier: 'gold', label: 'Pequeña oro' },
  largeSilver: { slot: 'large', tier: 'silver', label: 'Grande plata' },
  largeGold: { slot: 'large', tier: 'gold', label: 'Grande oro' },
};

/**
 * La API solo trae tres umbrales: `mini` (0.90 del tamaño base), `silver` (1.15)
 * y `gold` (1.23). El de la corona pequeña de PLATA no aparece en la API ni en
 * las guías, así que se estima como fracción del tamaño base.
 *
 * Es el único número aquí que no sale del juego: si al comparar con la guía de
 * campo no cuadra, se corrige esta constante y todo lo demás se recalcula solo.
 */
export const SMALL_SILVER_RATIO = 0.95;

export interface CrownThresholds {
  smallSilver: number;
  smallGold: number;
  largeSilver: number;
  largeGold: number;
}

export function crownThresholds(monster: Monster): CrownThresholds | null {
  const size = monster.size;
  if (!size) return null;
  return {
    smallSilver: size.base * SMALL_SILVER_RATIO,
    smallGold: size.mini,
    largeSilver: size.silver,
    largeGold: size.gold,
  };
}

export function emptyCounts(): VariantCounts {
  return { normal: 0, frenzied: 0, tempered: 0, 'arch-tempered': 0 };
}

export function emptyManual(): Record<CrownKey, boolean> {
  return { smallSilver: false, smallGold: false, largeSilver: false, largeGold: false };
}

export function emptyProgress(): MonsterProgress {
  return {
    smallest: null,
    largest: null,
    hunted: emptyCounts(),
    captured: emptyCounts(),
    manual: emptyManual(),
  };
}

export function sumCounts(counts: VariantCounts | undefined): number {
  if (!counts) return 0;
  return MONSTER_VARIANTS.reduce((total, variant) => total + (counts[variant] ?? 0), 0);
}

export interface CrownState {
  earned: boolean;
  /** true si viene de un tamaño registrado, false si se marcó a mano. */
  fromSize: boolean;
  threshold: number | null;
}

export type MonsterCrowns = Record<CrownKey, CrownState> & {
  /**
   * Qué falta para la siguiente corona alcanzable, con la dirección: las
   * pequeñas se consiguen cazando MÁS CHICO y las grandes cazando MÁS GRANDE.
   */
  nextGoal: { key: CrownKey; needed: number; target: number; direction: 'menor' | 'mayor' } | null;
};

/**
 * Deduce las coronas de un monstruo a partir del rango de tamaños registrado.
 *
 * Las pequeñas se ganan por DEBAJO del umbral y las grandes por encima:
 * confundir el sentido es el error fácil aquí.
 */
export function deriveCrowns(monster: Monster, raw: MonsterProgress | undefined): MonsterCrowns {
  const p = { ...emptyProgress(), ...raw };
  const manual = { ...emptyManual(), ...p.manual };
  const thresholds = crownThresholds(monster);

  const state = (key: CrownKey): CrownState => {
    const threshold = thresholds?.[key] ?? null;
    let fromSize = false;

    if (threshold != null) {
      fromSize = CROWN_INFO[key].slot === 'small'
        ? p.smallest != null && p.smallest <= threshold
        : p.largest != null && p.largest >= threshold;
    }

    return { earned: fromSize || manual[key], fromSize, threshold };
  };

  const crowns = {
    smallSilver: state('smallSilver'),
    smallGold: state('smallGold'),
    largeSilver: state('largeSilver'),
    largeGold: state('largeGold'),
  };

  let nextGoal: MonsterCrowns['nextGoal'] = null;
  if (thresholds) {
    // Primero las grandes, en orden de dificultad; luego las pequeñas.
    for (const key of ['largeSilver', 'largeGold'] as const) {
      if (crowns[key].earned || p.largest == null) continue;
      nextGoal = {
        key,
        needed: Math.max(0, thresholds[key] - p.largest),
        target: thresholds[key],
        direction: 'mayor',
      };
      break;
    }
    if (!nextGoal) {
      for (const key of ['smallSilver', 'smallGold'] as const) {
        if (crowns[key].earned || p.smallest == null) continue;
        nextGoal = {
          key,
          needed: Math.max(0, p.smallest - thresholds[key]),
          target: thresholds[key],
          direction: 'menor',
        };
        break;
      }
    }
  }

  return { ...crowns, nextGoal };
}

export type CrownTally = Record<CrownKey, number> & {
  /** Monstruos con las cuatro coronas. */
  complete: number;
  total: number;
};

export function tallyCrowns(
  monsters: Monster[],
  progress: Record<string, MonsterProgress>,
): CrownTally {
  const tally: CrownTally = {
    smallSilver: 0, smallGold: 0, largeSilver: 0, largeGold: 0,
    complete: 0,
    total: monsters.length,
  };

  for (const monster of monsters) {
    const crowns = deriveCrowns(monster, progress[String(monster.id)]);
    let all = true;
    for (const key of CROWN_KEYS) {
      if (crowns[key].earned) tally[key] += 1;
      else all = false;
    }
    if (all) tally.complete += 1;
  }

  return tally;
}

/** Totales de caza de un cazador, por nivel de monstruo. */
export function tallyHunts(progress: Record<string, MonsterProgress>): {
  hunted: VariantCounts;
  captured: VariantCounts;
  totalHunted: number;
  totalCaptured: number;
} {
  const hunted = emptyCounts();
  const captured = emptyCounts();

  for (const entry of Object.values(progress)) {
    for (const variant of MONSTER_VARIANTS) {
      hunted[variant] += entry.hunted?.[variant] ?? 0;
      captured[variant] += entry.captured?.[variant] ?? 0;
    }
  }

  return { hunted, captured, totalHunted: sumCounts(hunted), totalCaptured: sumCounts(captured) };
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

  const one = (value: unknown): number => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.floor(n), 99999);
  };

  /**
   * Antes de que existieran las variantes esto era un solo número. Los
   * documentos viejos siguen en la base, así que un número suelto se interpreta
   * como cacerías del monstruo normal en vez de perderse.
   */
  const counts = (value: unknown): VariantCounts => {
    const out = emptyCounts();
    if (typeof value === 'number') {
      out.normal = one(value);
      return out;
    }
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (isMonsterVariant(key)) out[key] = one(entry);
      }
    }
    return out;
  };

  /**
   * El modelo anterior tenía tres coronas planas. Se traducen a las nuevas: la
   * "mini" era la pequeña de oro, y plata y oro eran las grandes.
   */
  const manual = emptyManual();
  if (r.manualMini === true) manual.smallGold = true;
  if (r.manualSilver === true) manual.largeSilver = true;
  if (r.manualGold === true) manual.largeGold = true;
  if (r.manual && typeof r.manual === 'object') {
    for (const [key, value] of Object.entries(r.manual as Record<string, unknown>)) {
      if ((CROWN_KEYS as string[]).includes(key)) manual[key as CrownKey] = value === true;
    }
  }

  let smallest = size(r.smallest);
  let largest = size(r.largest);
  // Si llegan al revés, se ordenan en vez de rechazar la captura entera.
  if (smallest != null && largest != null && smallest > largest) {
    [smallest, largest] = [largest, smallest];
  }

  const progress: MonsterProgress = {
    smallest,
    largest,
    hunted: counts(r.hunted),
    captured: counts(r.captured),
    manual,
  };

  const isEmpty =
    progress.smallest == null && progress.largest == null &&
    sumCounts(progress.hunted) === 0 && sumCounts(progress.captured) === 0 &&
    !CROWN_KEYS.some((key) => progress.manual[key]);

  // Guardar entradas vacías solo engordaría el documento.
  return isEmpty ? null : progress;
}
