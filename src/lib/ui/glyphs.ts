/**
 * Glifos del sistema de diseño, como marcado SVG.
 *
 * Se devuelven como cadena y no como componente porque los usan tanto las
 * páginas de Astro como las islas de Preact, y duplicarlos era justo lo que
 * hacía que la lista y el detalle se separaran.
 */
import type { CrownKey } from '../crowns.ts';

/**
 * Corona, con la misma silueta que usa el juego.
 *
 * Reparte la información como la maqueta: **la forma dice el tamaño** (tres
 * picos la pequeña, cinco la grande) y **el color dice el metal** (plata u
 * oro). Antes lo tenía al revés —la plata era un contorno de tres picos y el
 * oro una forma distinta— y la plata no parecía una corona.
 *
 * Sin lograr, la misma silueta en el gris de vacío: el hueco se lee igual que
 * la pieza que falta en el álbum, no como una corona apagada.
 */
const CROWN_SHAPE = {
  small: {
    width: 18,
    height: 13,
    clip: 'polygon(0 100%, 0 42%, 25% 64%, 50% 8%, 75% 64%, 100% 42%, 100% 100%)',
  },
  large: {
    width: 24,
    height: 17,
    clip: 'polygon(0 100%, 0 34%, 18% 58%, 34% 6%, 50% 40%, 66% 6%, 82% 58%, 100% 34%, 100% 100%)',
  },
} as const;

export function crownSvg(crown: CrownKey, earned: boolean): string {
  const gold = crown === 'smallGold' || crown === 'largeGold';
  const large = crown === 'largeSilver' || crown === 'largeGold';
  const shape = large ? CROWN_SHAPE.large : CROWN_SHAPE.small;
  const color = earned
    ? `var(${gold ? '--crown-gold' : '--crown-silver'})`
    : 'var(--crown-empty)';

  return (
    `<span style="display:inline-block;width:${shape.width}px;height:${shape.height}px;` +
    `background:${color};clip-path:${shape.clip}" aria-hidden="true"></span>`
  );
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
