/**
 * Glifos del sistema de diseño, como marcado SVG.
 *
 * Se devuelven como cadena y no como componente porque los usan tanto las
 * páginas de Astro como las islas de Preact, y duplicarlos era justo lo que
 * hacía que la lista y el detalle se separaran.
 */
import type { CrownKey } from '../crowns.ts';

/**
 * Corona.
 *
 * El color refuerza, pero **el dato es la silueta**: plata son tres puntas en
 * contorno y oro cinco puntas sólidas con estrella. Así se distinguen para
 * quien no separa esos dos tonos, y también impresas en blanco y negro.
 * El tamaño distingue pequeña de grande: 14 px contra 18.
 */
export function crownSvg(crown: CrownKey, earned: boolean): string {
  const gold = crown === 'smallGold' || crown === 'largeGold';
  const large = crown === 'largeSilver' || crown === 'largeGold';
  const size = large ? 18 : 14;
  const color = earned
    ? `var(${gold ? '--crown-gold' : '--crown-silver'})`
    : 'var(--crown-empty)';

  // Cinco puntas para el oro, tres para la plata.
  const path = gold
    ? 'M2 17 L2 5 L6.5 9 L12 2 L17.5 9 L22 5 L22 17 Z'
    : 'M3 17 L3 7 L12 2.5 L21 7 L21 17 Z';

  const star = gold
    ? `<path d="M12 6.4 L13 9 L15.7 9 L13.5 10.6 L14.4 13.2 L12 11.6 L9.6 13.2 L10.5 10.6 L8.3 9 L11 9 Z" fill="${
        earned ? 'var(--bg-0)' : 'none'
      }" opacity="${earned ? 0.55 : 0}"/>`
    : '';

  return [
    `<svg viewBox="0 0 24 20" width="${size}" height="${Math.round((size * 20) / 24)}" aria-hidden="true">`,
    `<path d="${path}" fill="${gold && earned ? color : 'none'}" stroke="${color}" stroke-width="${gold ? 1 : 1.6}" stroke-linejoin="round"/>`,
    star,
    `<rect x="${gold ? 2 : 3}" y="17" width="${gold ? 20 : 18}" height="2.4" fill="${gold && earned ? color : 'none'}" stroke="${color}" stroke-width="${gold ? 0 : 1.2}"/>`,
    `</svg>`,
  ].join('');
}

/**
 * Insignia de ranura: rombo con el dígito impreso dentro.
 *
 * El dígito es obligatorio: sin él, distinguir una ranura de nivel 2 de una de
 * 3 dependería solo del color.
 */
export function slotSvg(level: number, occupied = false, compact = false): string {
  const size = compact ? 16 : 20;
  const color = `var(--slot-${Math.min(Math.max(level, 1), 3)})`;
  return [
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">`,
    `<path d="M12 2 L22 12 L12 22 L2 12 Z" fill="${occupied ? color : 'none'}" stroke="${color}" stroke-width="1.5"/>`,
    `<text x="12" y="16" text-anchor="middle" font-family="var(--font-num)" font-size="11" font-weight="600" fill="${
      occupied ? 'var(--bg-0)' : color
    }">${level}</text>`,
    `</svg>`,
  ].join('');
}
