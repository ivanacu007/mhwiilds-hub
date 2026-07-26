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

export function emptyCounts(): VariantCounts {
  return { normal: 0, frenzied: 0, tempered: 0, 'arch-tempered': 0 };
}

export function emptyCrowns(): Record<CrownKey, boolean> {
  return { smallSilver: false, smallGold: false, largeSilver: false, largeGold: false };
}

export function emptyProgress(): MonsterProgress {
  return {
    hunted: emptyCounts(),
    captured: emptyCounts(),
    crowns: emptyCrowns(),
  };
}

export function sumCounts(counts: VariantCounts | undefined): number {
  if (!counts) return 0;
  return MONSTER_VARIANTS.reduce((total, variant) => total + (counts[variant] ?? 0), 0);
}

/** Cuántas coronas tiene marcadas, de las cuatro. */
export function countCrowns(crowns: Record<CrownKey, boolean> | undefined): number {
  if (!crowns) return 0;
  return CROWN_KEYS.reduce((n, key) => n + (crowns[key] ? 1 : 0), 0);
}

/** Las coronas de un monstruo, con los huecos rellenos. */
export function crownsOf(progress: MonsterProgress | undefined): Record<CrownKey, boolean> {
  return { ...emptyCrowns(), ...progress?.crowns };
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
    const crowns = crownsOf(progress[String(monster.id)]);
    let all = true;
    for (const key of CROWN_KEYS) {
      if (crowns[key]) tally[key] += 1;
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

/** Saneado de lo que llega del cliente. */
export function cleanProgress(raw: unknown): MonsterProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

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
   * Modelos anteriores: primero tres banderas planas (manualMini/Silver/Gold) y
   * luego un objeto `manual`. Ambos se traducen para no perder lo ya marcado.
   */
  const crowns = emptyCrowns();
  if (r.manualMini === true) crowns.smallGold = true;
  if (r.manualSilver === true) crowns.largeSilver = true;
  if (r.manualGold === true) crowns.largeGold = true;
  for (const source of [r.manual, r.crowns]) {
    if (source && typeof source === 'object') {
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        if ((CROWN_KEYS as string[]).includes(key)) crowns[key as CrownKey] = value === true;
      }
    }
  }

  const progress: MonsterProgress = {
    hunted: counts(r.hunted),
    captured: counts(r.captured),
    crowns,
  };

  const isEmpty =
    sumCounts(progress.hunted) === 0 && sumCounts(progress.captured) === 0 &&
    !CROWN_KEYS.some((key) => progress.crowns[key]);

  // Guardar entradas vacías solo engordaría el documento.
  return isEmpty ? null : progress;
}
