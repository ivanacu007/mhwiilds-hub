/**
 * Iconos de tipo de arma y de pieza de armadura, tomados del juego.
 *
 * Los archivos del wiki son monocromos, así que se usan como máscara CSS y el
 * color lo pone quien los dibuja: con 20 archivos se cubren los 14 tipos de
 * arma y las 6 ranuras de equipo, en cualquier tono del tema.
 *
 * Sustituyen a las siluetas que había dibujadas a mano con `clip-path`:
 * «Espada cargada», «Espada larga» y «Espada y escudo» eran indistinguibles
 * como formas inventadas, y el jugador ya reconoce estas del menú del juego.
 */
export const GEAR_SLUGS = [
  'great-sword', 'long-sword', 'sword-shield', 'dual-blades', 'hammer',
  'hunting-horn', 'lance', 'gunlance', 'switch-axe', 'charge-blade',
  'insect-glaive', 'bow', 'light-bowgun', 'heavy-bowgun',
  'head', 'chest', 'arms', 'waist', 'legs', 'charm',
] as const;

export type GearSlug = (typeof GEAR_SLUGS)[number];

export function hasGearIcon(slug: string): slug is GearSlug {
  return (GEAR_SLUGS as readonly string[]).includes(slug);
}

/**
 * Estilo en línea para pintar el icono.
 *
 * Si el tipo no se conoce devuelve un punto tenue en vez de una máscara: sin
 * archivo, `mask` no recorta nada y saldría un bloque sólido de color, que
 * parece un icono roto en vez de un dato que falta.
 */
export function gearIconStyle(slug: string, size = 15, color = 'currentColor'): string {
  if (!hasGearIcon(slug)) {
    return `width:${size}px;height:${size}px;background-color:${color};border-radius:50%;opacity:.4`;
  }
  return maskStyle(`/iconos/equipo/${slug}.webp`, size, color);
}

/**
 * Lo mismo para cualquier archivo monocromo del proyecto: los de materiales
 * viven en otra carpeta y se pintan igual, recortando un bloque de color.
 */
export function maskStyle(path: string, size = 15, color = 'currentColor'): string {
  const url = `url("${path}") center/contain no-repeat`;
  return `width:${size}px;height:${size}px;background-color:${color};-webkit-mask:${url};mask:${url}`;
}
