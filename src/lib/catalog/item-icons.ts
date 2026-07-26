/**
 * Iconos de material.
 *
 * La API describe cada material con `icon: { kind, color }` pero no sirve
 * imágenes. El wiki sí tiene una colección sistemática, con un archivo `Base`
 * monocromo por tipo: se usa ese como máscara CSS y se tiñe con el color que da
 * la API, así hace falta un archivo por TIPO en vez de uno por tipo y color
 * (65 en vez de 360).
 *
 * Los archivos van en `public/iconos/materiales/<slug>.webp` y no se versionan,
 * igual que los de monstruo.
 */

/**
 * Tipo de la API -> nombre del tipo en el wiki.
 *
 * Los vocabularios no coinciden, así que la tabla se sacó cruzando las páginas
 * de materiales del wiki con el color que la API da para cada uno: el color
 * desambigua cuando una página muestra varios iconos. Varios tipos de la API
 * comparten icono, que es correcto.
 */
export const ICON_KIND_MAP: Record<string, string> = {
  // Emparejados por nombre directo
  'armor-sphere': 'Armor Sphere', barrel: 'Barrel', binoculars: 'Binoculars',
  bomb: 'Bomb', bone: 'Bone', bug: 'Bug', 'capture-net': 'Capture Net',
  claw: 'Claw', coin: 'Coin', crystal: 'Crystal', drug: 'Drug', egg: 'Egg',
  fish: 'Fish', hide: 'Hide', knife: 'Knife', meat: 'Meat', mushroom: 'Mushroom',
  ore: 'Ore', pill: 'Pill', plate: 'Plate', scale: 'Scale', seed: 'Seed',
  shell: 'Shell', tail: 'Tail', trap: 'Trap', whetstone: 'Whetstone', wing: 'Wing',

  // Resueltos cruzando páginas del wiki con el color de la API
  certificate: 'Ticket',
  'cooking-mushroom': 'Ingredient Mushroom',
  'cooking-shellfish': 'Ingredient Shrimp',
  curative: 'Vial',
  extract: 'Chemical',
  'fishing-rod': 'Bait',
  gem: 'Ball',
  honey: 'Webbing',
  mantle: 'Cape',
  medulla: 'Monster Part',
  'mystery-artian': 'Weapon Shard',
  'mystery-decoration': 'Decoration',
  'mystery-material': 'Pouch',
  nut: 'Husk',
  phial: 'Coating',
  plant: 'Herb',
  poop: 'Dung',
  potion: 'Medicine',
  powder: 'Sac',
  question: 'Question Mark',
  skull: 'Head',
  'slinger-ammo': 'Pod',
  smoke: 'Smoke Bomb',
  voucher: 'Meal Ticket',
  web: 'Spiderweb',
  'camping-kit': 'Tent',
  'ammo-special': 'Ammo Pierce',
  'ammo-utility': 'Ammo Sticky',
  'ammo-heavy': 'Ammo Cluster',

  // Con muy pocos materiales para que el cruce decidiera: van por significado.
  'ammo-basic': 'Ammo',
  'ammo-slug': 'Ammo Spread',
  'cooking-cheese': 'Ingredient Cheese',
  'cooking-egg': 'Ingredient Eggs',
  'cooking-garlic': 'Ingredient Garlic',
  'trap-tool': 'Trap',
  sprout: 'Seed',
  grill: 'Spit',
  // Los materiales de colaboración traen icono propio; sin uno genérico bueno
  // se usa la interrogación, que es lo que el juego enseña cuando no sabe.
  unknown: 'Question Mark',
};

/**
 * Color de la API -> valor CSS con el que se tiñe la máscara.
 *
 * Son aproximaciones a la paleta del juego: el archivo `Base` es monocromo, así
 * que el color sale de aquí y no del nombre del archivo.
 */
export const ICON_COLOR: Record<string, string> = {
  white: '#e6e8ee',
  ivory: '#ded4bc',
  gray: '#9aa3b0',
  yellow: '#e0b53c',
  lemon: '#d9d24e',
  orange: '#dd8a3a',
  vermilion: '#d9603a',
  red: '#cf4a48',
  rose: '#d9799a',
  pink: '#dd82ac',
  purple: '#a776ce',
  'dark-purple': '#7a55a8',
  'blue-purple': '#8a7fd0',
  ultramarine: '#4a63c0',
  blue: '#4a86d8',
  sky: '#63b4e0',
  emerald: '#3fb894',
  green: '#57ab63',
  'sage-green': '#8fb87f',
  'moss-green': '#7f9a52',
  brown: '#a2794f',
  none: '#8b93a1',
};

const FALLBACK_COLOR = '#9aa3b0';

/** Nombre de archivo estable a partir del tipo del wiki. */
export function iconSlug(wikiKind: string): string {
  return wikiKind.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Ruta del icono de un material, exista el archivo o no. */
export function itemIconPath(apiKind: string | undefined): string | null {
  const wikiKind = apiKind ? ICON_KIND_MAP[apiKind] : undefined;
  return wikiKind ? `/iconos/materiales/${iconSlug(wikiKind)}.webp` : null;
}

export function itemIconColor(apiColor: string | undefined): string {
  return (apiColor && ICON_COLOR[apiColor]) || FALLBACK_COLOR;
}

/** Los tipos de archivo que hay que tener, sin repetir. */
export function requiredIconSlugs(): { slug: string; wikiKind: string }[] {
  const seen = new Map<string, string>();
  for (const wikiKind of Object.values(ICON_KIND_MAP)) {
    seen.set(iconSlug(wikiKind), wikiKind);
  }
  return [...seen].map(([slug, wikiKind]) => ({ slug, wikiKind })).sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
}
