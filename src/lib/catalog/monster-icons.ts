/**
 * Correspondencia entre los monstruos de wilds.mhdb.io y los nombres de archivo
 * que usa monsterhunterwiki.org para sus iconos.
 *
 * Es solo una tabla de nombres: la app NO descarga ninguna imagen. Sirve para que
 * `npm run iconos:importar` sepa renombrar los archivos que tú ya obtuviste a
 * `public/monstruos/<id>.webp`, que es donde la app los busca.
 *
 * Generada contra la Category:MHWilds_Monster_Icons; los 34 monstruos grandes
 * emparejan de forma exacta.
 */
export interface MonsterIconEntry {
  id: number;
  /** Nombre en inglés, que es como nombra los archivos el wiki. */
  en: string;
  /** Nombre en español, el que muestra la app. */
  es: string;
  /** Posición en el orden por defecto de la guía de campo del juego. */
  sortOrder: number;
  /** Nombre original del archivo en el wiki. */
  wikiFile: string;
}

export const MONSTER_ICONS: MonsterIconEntry[] = [
  { id: 1, en: "Zoh Shia", es: "Zoh Shia", sortOrder: 20, wikiFile: "MHWA-Zoh Shia Icon.webp" },
  { id: 2, en: "Guardian Doshaguma", es: "Doshaguma Guardián", sortOrder: 14, wikiFile: "MHWA-Guardian Doshaguma Icon.webp" },
  { id: 3, en: "Rey Dau", es: "Rey Dau", sortOrder: 9, wikiFile: "MHWA-Rey Dau Icon.webp" },
  { id: 4, en: "Lala Barina", es: "Lala Barina", sortOrder: 3, wikiFile: "MHWA-Lala Barina Icon.webp" },
  { id: 5, en: "Congalala", es: "Congalala", sortOrder: 4, wikiFile: "MHWA-Congalala Icon.webp" },
  { id: 6, en: "Nerscylla", es: "Nerscylla", sortOrder: 10, wikiFile: "MHWA-Nerscylla Icon.webp" },
  { id: 7, en: "Gore Magala", es: "Gore Magala", sortOrder: 28, wikiFile: "MHWA-Gore Magala Icon.webp" },
  { id: 8, en: "Gravios", es: "Gravios", sortOrder: 26, wikiFile: "MHWA-Gravios Icon.webp" },
  { id: 9, en: "Guardian Arkveld", es: "Arkveld Guardián", sortOrder: 19, wikiFile: "MHWA-Guardian Arkveld Icon.webp" },
  { id: 10, en: "Quematrice", es: "Quematrice", sortOrder: 2, wikiFile: "MHWA-Quematrice Icon.webp" },
  { id: 11, en: "Doshaguma", es: "Doshaguma", sortOrder: 6, wikiFile: "MHWA-Doshaguma Icon.webp" },
  { id: 12, en: "Balahara", es: "Balahara", sortOrder: 5, wikiFile: "MHWA-Balahara Icon.webp" },
  { id: 13, en: "Rathian", es: "Rathian", sortOrder: 23, wikiFile: "MHWA-Rathian Icon.webp" },
  { id: 14, en: "Chatacabra", es: "Chatacabra", sortOrder: 1, wikiFile: "MHWA-Chatacabra Icon.webp" },
  { id: 15, en: "Mizutsune", es: "Mizutsune", sortOrder: 30, wikiFile: "MHWA-Mizutsune Icon.webp" },
  { id: 16, en: "Guardian Fulgur Anjanath", es: "Anjanath Fulgúreo Guardián", sortOrder: 24, wikiFile: "MHWA-Guardian Fulgur Anjanath Icon.webp" },
  { id: 17, en: "Hirabami", es: "Hirabami", sortOrder: 11, wikiFile: "MHWA-Hirabami Icon.webp" },
  { id: 18, en: "Yian Kut-Ku", es: "Yian Kut-Ku", sortOrder: 21, wikiFile: "MHWA-Yian Kut-Ku Icon.webp" },
  { id: 19, en: "Rompopolo", es: "Rompopolo", sortOrder: 8, wikiFile: "MHWA-Rompopolo Icon.webp" },
  { id: 20, en: "Arkveld", es: "Arkveld", sortOrder: 29, wikiFile: "MHWA-Arkveld Icon.webp" },
  { id: 21, en: "Ajarakan", es: "Ajarakan", sortOrder: 12, wikiFile: "MHWA-Ajarakan Icon.webp" },
  { id: 22, en: "Gypceros", es: "Gypceros", sortOrder: 22, wikiFile: "MHWA-Gypceros Icon.webp" },
  { id: 23, en: "Xu Wu", es: "Xu Wu", sortOrder: 18, wikiFile: "MHWA-Xu Wu Icon.webp" },
  { id: 24, en: "Guardian Rathalos", es: "Rathalos Guardián", sortOrder: 15, wikiFile: "MHWA-Guardian Rathalos Icon.webp" },
  { id: 25, en: "Uth Duna", es: "Uth Duna", sortOrder: 7, wikiFile: "MHWA-Uth Duna Icon.webp" },
  { id: 26, en: "Jin Dahaad", es: "Jin Dahaad", sortOrder: 16, wikiFile: "MHWA-Jin Dahaad Icon.webp" },
  { id: 27, en: "Nu Udra", es: "Nu Udra", sortOrder: 13, wikiFile: "MHWA-Nu Udra Icon.webp" },
  { id: 28, en: "Guardian Ebony Odogaron", es: "Odogaron Ébano Guardián", sortOrder: 17, wikiFile: "MHWA-Guardian Ebony Odogaron Icon.webp" },
  { id: 29, en: "Rathalos", es: "Rathalos", sortOrder: 25, wikiFile: "MHWA-Rathalos Icon.webp" },
  { id: 30, en: "Blangonga", es: "Blangonga", sortOrder: 27, wikiFile: "MHWA-Blangonga Icon.webp" },
  { id: 31, en: "Lagiacrus", es: "Lagiacrus", sortOrder: 32, wikiFile: "MHWA-Lagiacrus Icon.webp" },
  { id: 32, en: "Seregios", es: "Seregios", sortOrder: 31, wikiFile: "MHWA-Seregios Icon.webp" },
  { id: 33, en: "Omega Planetes", es: "Omega Planetes", sortOrder: 33, wikiFile: "MHWA-Omega Planetes Icon.webp" },
  { id: 34, en: "Gogmazios", es: "Gogmazios", sortOrder: 34, wikiFile: "MHWA-Gogmazios Icon.webp" },
];

/**
 * Niveles de un mismo monstruo. La API no los separa —comparten id, solo cambia
 * la dificultad— así que se distinguen por sufijo en el nombre del archivo.
 */
export type MonsterVariant = 'normal' | 'frenzied' | 'tempered' | 'arch-tempered';

/** En orden de dificultad, que es como se muestran. */
export const MONSTER_VARIANTS: MonsterVariant[] = [
  'normal',
  'frenzied',
  'tempered',
  'arch-tempered',
];

/** Nombres del doblaje latino, que es el que usa el juego aquí. */
export const VARIANT_LABEL: Record<MonsterVariant, string> = {
  normal: 'Normal',
  frenzied: 'Frenético',
  tempered: 'Curtido',
  'arch-tempered': 'Archicurtido',
};

/** Sufijo del archivo. El normal no lleva ninguno. */
export function variantSuffix(variant: MonsterVariant): string {
  return variant === 'normal' ? '' : `-${variant}`;
}

/** Ruta pública del icono, exista el archivo o no. */
export function monsterIconPath(monsterId: number, variant: MonsterVariant = 'normal'): string {
  return `/monstruos/${monsterId}${variantSuffix(variant)}.webp`;
}

/** monsterId -> posición en el orden del juego. */
export const MONSTER_SORT_ORDER: Map<number, number> = new Map(
  MONSTER_ICONS.map((m) => [m.id, m.sortOrder]),
);

/**
 * Orden por defecto del juego. Los que no estén en la tabla (un monstruo nuevo
 * de un title update, antes de actualizarla) van al final por nombre, en vez de
 * desaparecer o colarse al principio.
 */
export function compareByGameOrder(
  a: { id: number; name: string },
  b: { id: number; name: string },
): number {
  const oa = MONSTER_SORT_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const ob = MONSTER_SORT_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  return oa - ob || a.name.localeCompare(b.name, 'es');
}

export function isMonsterVariant(value: unknown): value is MonsterVariant {
  return typeof value === 'string' && (MONSTER_VARIANTS as string[]).includes(value);
}
