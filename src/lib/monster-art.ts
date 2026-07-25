/**
 * Iconos generados para los monstruos.
 *
 * La API no sirve imágenes y el arte del juego es de Capcom, así que esto dibuja
 * un emblema propio a partir de la especie: un glifo distinto por familia sobre
 * un fondo tipo pergamino, teñido de forma estable según el id. No pretende
 * parecerse al del juego; pretende que 34 monstruos se distingan de un vistazo.
 *
 * Si existe `public/monstruos/<id>.webp` se muestra ese archivo y esto queda
 * detrás como respaldo.
 */

/** Un tono por especie, para que las familias se agrupen visualmente. */
const SPECIES_HUE: Record<string, number> = {
  'flying-wyvern': 265,
  'brute-wyvern': 18,
  'bird-wyvern': 95,
  'fanged-beast': 35,
  'piscine-wyvern': 200,
  leviathan: 190,
  temnoceran: 320,
  amphibian: 145,
  cephalopod: 290,
  construct: 45,
  machine: 210,
  'elder-dragon': 0,
  'demi-elder': 350,
  unknown: 220,
};

export const SPECIES_LABEL: Record<string, string> = {
  'flying-wyvern': 'Wyvern volador',
  'brute-wyvern': 'Wyvern bruto',
  'bird-wyvern': 'Wyvern pájaro',
  'fanged-beast': 'Bestia colmilluda',
  'piscine-wyvern': 'Wyvern pez',
  leviathan: 'Leviatán',
  temnoceran: 'Temnoceran',
  amphibian: 'Anfibio',
  cephalopod: 'Cefalópodo',
  construct: 'Constructo',
  machine: 'Máquina',
  'elder-dragon': 'Dragón anciano',
  'demi-elder': 'Semianciano',
  unknown: 'Desconocido',
};

/**
 * Glifos por especie, en una caja de 100×100. Son formas abstractas: alas para
 * los wyverns, tentáculos para el cefalópodo, engranaje para las máquinas.
 */
const SPECIES_GLYPH: Record<string, string> = {
  'flying-wyvern': 'M50 22 L78 44 L64 50 L74 74 L50 62 L26 74 L36 50 L22 44 Z',
  'brute-wyvern': 'M28 70 L38 30 L62 30 L72 70 L58 62 L50 74 L42 62 Z',
  'bird-wyvern': 'M50 20 L70 46 L58 48 L66 76 L50 64 L34 76 L42 48 L30 46 Z',
  'fanged-beast': 'M26 44 A24 24 0 0 1 74 44 L68 74 L58 64 L50 74 L42 64 L32 74 Z',
  'piscine-wyvern': 'M22 50 Q46 26 70 50 Q46 74 22 50 Z M70 50 L82 36 L82 64 Z',
  leviathan: 'M20 58 Q34 34 50 50 Q66 66 80 42 L80 66 Q64 82 50 66 Q36 50 20 72 Z',
  temnoceran: 'M50 32 A16 16 0 1 1 50 64 A16 16 0 1 1 50 32 M24 30 L38 44 M76 30 L62 44 M22 62 L38 56 M78 62 L62 56 M34 78 L44 62 M66 78 L56 62',
  amphibian: 'M50 26 A26 22 0 0 1 76 52 Q76 74 50 74 Q24 74 24 52 A26 22 0 0 1 50 26 M38 44 A5 5 0 1 0 38 43 M62 44 A5 5 0 1 0 62 43',
  cephalopod: 'M50 22 A24 22 0 0 1 74 44 Q74 56 68 60 L70 78 L60 64 L56 80 L50 62 L44 80 L40 64 L30 78 L32 60 Q26 56 26 44 A24 22 0 0 1 50 22',
  construct: 'M50 20 L76 34 L76 66 L50 80 L24 66 L24 34 Z M50 38 L62 45 L62 59 L50 66 L38 59 L38 45 Z',
  machine: 'M50 26 L58 32 L68 30 L70 40 L78 46 L72 54 L74 64 L64 66 L58 74 L50 70 L42 74 L36 66 L26 64 L28 54 L22 46 L30 40 L32 30 L42 32 Z M50 42 A8 8 0 1 0 50 58 A8 8 0 1 0 50 42',
  'elder-dragon': 'M50 18 L62 34 L82 30 L70 48 L84 62 L62 62 L50 82 L38 62 L16 62 L30 48 L18 30 L38 34 Z',
  'demi-elder': 'M50 20 L60 36 L78 34 L68 50 L78 66 L60 64 L50 80 L40 64 L22 66 L32 50 L22 34 L40 36 Z',
  unknown: 'M50 24 A26 26 0 1 1 50 76 A26 26 0 1 1 50 24 M50 38 L50 56 M50 62 L50 66',
};

const STROKE_ONLY = new Set(['temnoceran', 'machine']);

/** Las iniciales que van bajo el glifo, para desempatar dentro de una especie. */
function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export interface MonsterArtInput {
  id: number;
  name: string;
  species: string;
}

/**
 * SVG completo del emblema. Se devuelve como marcado, no como archivo, para
 * poder incrustarlo en la página sin una petición extra por monstruo.
 */
export function monsterArtSvg(monster: MonsterArtInput, size = 96): string {
  const species = SPECIES_GLYPH[monster.species] ? monster.species : 'unknown';
  const hue = SPECIES_HUE[species] ?? 220;
  // El id desplaza el tono para que dos monstruos de la misma familia no salgan idénticos.
  const shift = (monster.id * 37) % 26;
  const h = (hue + shift - 13 + 360) % 360;

  const glyph = SPECIES_GLYPH[species];
  const stroke = STROKE_ONLY.has(species);
  const gradientId = `g${monster.id}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${escapeXml(monster.name)}">`,
    `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="hsl(${h} 34% 26%)"/>`,
    `<stop offset="1" stop-color="hsl(${h} 38% 15%)"/>`,
    `</linearGradient></defs>`,
    `<rect width="100" height="100" rx="14" fill="url(#${gradientId})"/>`,
    `<rect x="3" y="3" width="94" height="94" rx="11" fill="none" stroke="hsl(${h} 40% 55%)" stroke-opacity="0.35" stroke-width="1.5"/>`,
    `<path d="${glyph}" fill="${stroke ? 'none' : `hsl(${h} 48% 68%)`}" stroke="hsl(${h} 48% 70%)" stroke-width="${stroke ? 4 : 1}" stroke-linejoin="round" stroke-linecap="round" opacity="0.92" transform="translate(0,-6)"/>`,
    `<text x="50" y="92" text-anchor="middle" font-family="Georgia, serif" font-size="15" font-weight="700" fill="hsl(${h} 30% 82%)" opacity="0.75">${escapeXml(initials(monster.name))}</text>`,
    `</svg>`,
  ].join('');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Para usarlo como `background-image` en CSS. */
export function monsterArtDataUri(monster: MonsterArtInput, size = 96): string {
  return `data:image/svg+xml,${encodeURIComponent(monsterArtSvg(monster, size))}`;
}
