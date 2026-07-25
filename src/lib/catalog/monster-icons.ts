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
  /** Nombre original del archivo en el wiki. */
  wikiFile: string;
}

export const MONSTER_ICONS: MonsterIconEntry[] = [
  { id: 1, en: "Zoh Shia", es: "Zoh Shia", wikiFile: "MHWA-Zoh Shia Icon.webp" },
  { id: 2, en: "Guardian Doshaguma", es: "Doshaguma Guardián", wikiFile: "MHWA-Guardian Doshaguma Icon.webp" },
  { id: 3, en: "Rey Dau", es: "Rey Dau", wikiFile: "MHWA-Rey Dau Icon.webp" },
  { id: 4, en: "Lala Barina", es: "Lala Barina", wikiFile: "MHWA-Lala Barina Icon.webp" },
  { id: 5, en: "Congalala", es: "Congalala", wikiFile: "MHWA-Congalala Icon.webp" },
  { id: 6, en: "Nerscylla", es: "Nerscylla", wikiFile: "MHWA-Nerscylla Icon.webp" },
  { id: 7, en: "Gore Magala", es: "Gore Magala", wikiFile: "MHWA-Gore Magala Icon.webp" },
  { id: 8, en: "Gravios", es: "Gravios", wikiFile: "MHWA-Gravios Icon.webp" },
  { id: 9, en: "Guardian Arkveld", es: "Arkveld Guardián", wikiFile: "MHWA-Guardian Arkveld Icon.webp" },
  { id: 10, en: "Quematrice", es: "Quematrice", wikiFile: "MHWA-Quematrice Icon.webp" },
  { id: 11, en: "Doshaguma", es: "Doshaguma", wikiFile: "MHWA-Doshaguma Icon.webp" },
  { id: 12, en: "Balahara", es: "Balahara", wikiFile: "MHWA-Balahara Icon.webp" },
  { id: 13, en: "Rathian", es: "Rathian", wikiFile: "MHWA-Rathian Icon.webp" },
  { id: 14, en: "Chatacabra", es: "Chatacabra", wikiFile: "MHWA-Chatacabra Icon.webp" },
  { id: 15, en: "Mizutsune", es: "Mizutsune", wikiFile: "MHWA-Mizutsune Icon.webp" },
  { id: 16, en: "Guardian Fulgur Anjanath", es: "Anjanath Fulgúreo Guardián", wikiFile: "MHWA-Guardian Fulgur Anjanath Icon.webp" },
  { id: 17, en: "Hirabami", es: "Hirabami", wikiFile: "MHWA-Hirabami Icon.webp" },
  { id: 18, en: "Yian Kut-Ku", es: "Yian Kut-Ku", wikiFile: "MHWA-Yian Kut-Ku Icon.webp" },
  { id: 19, en: "Rompopolo", es: "Rompopolo", wikiFile: "MHWA-Rompopolo Icon.webp" },
  { id: 20, en: "Arkveld", es: "Arkveld", wikiFile: "MHWA-Arkveld Icon.webp" },
  { id: 21, en: "Ajarakan", es: "Ajarakan", wikiFile: "MHWA-Ajarakan Icon.webp" },
  { id: 22, en: "Gypceros", es: "Gypceros", wikiFile: "MHWA-Gypceros Icon.webp" },
  { id: 23, en: "Xu Wu", es: "Xu Wu", wikiFile: "MHWA-Xu Wu Icon.webp" },
  { id: 24, en: "Guardian Rathalos", es: "Rathalos Guardián", wikiFile: "MHWA-Guardian Rathalos Icon.webp" },
  { id: 25, en: "Uth Duna", es: "Uth Duna", wikiFile: "MHWA-Uth Duna Icon.webp" },
  { id: 26, en: "Jin Dahaad", es: "Jin Dahaad", wikiFile: "MHWA-Jin Dahaad Icon.webp" },
  { id: 27, en: "Nu Udra", es: "Nu Udra", wikiFile: "MHWA-Nu Udra Icon.webp" },
  { id: 28, en: "Guardian Ebony Odogaron", es: "Odogaron Ébano Guardián", wikiFile: "MHWA-Guardian Ebony Odogaron Icon.webp" },
  { id: 29, en: "Rathalos", es: "Rathalos", wikiFile: "MHWA-Rathalos Icon.webp" },
  { id: 30, en: "Blangonga", es: "Blangonga", wikiFile: "MHWA-Blangonga Icon.webp" },
  { id: 31, en: "Lagiacrus", es: "Lagiacrus", wikiFile: "MHWA-Lagiacrus Icon.webp" },
  { id: 32, en: "Seregios", es: "Seregios", wikiFile: "MHWA-Seregios Icon.webp" },
  { id: 33, en: "Omega Planetes", es: "Omega Planetes", wikiFile: "MHWA-Omega Planetes Icon.webp" },
  { id: 34, en: "Gogmazios", es: "Gogmazios", wikiFile: "MHWA-Gogmazios Icon.webp" },
];

/** Ruta pública del icono de un monstruo, exista el archivo o no. */
export function monsterIconPath(monsterId: number): string {
  return `/monstruos/${monsterId}.webp`;
}
