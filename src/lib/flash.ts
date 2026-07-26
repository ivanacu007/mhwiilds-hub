import { es } from './i18n/es.ts';
import type { TranslationKey, Translator } from './i18n/index.ts';

/**
 * Mensajes de un formulario al siguiente.
 *
 * Por la URL viaja la CLAVE, no el texto. Dos razones:
 *
 * 1. El texto se traduce al leerlo, así que sale en el idioma de quien lo lee
 *    y no en el que tenía el servidor al generarlo.
 * 2. Un `?error=` con texto libre se pinta tal cual en la página, y eso permite
 *    a cualquiera fabricar un enlace que muestre el mensaje que quiera. Con
 *    claves, solo se pinta lo que está en el diccionario.
 */
export type FlashKey = Extract<TranslationKey, `msg.${string}`>;

const VALID = new Set(Object.keys(es).filter((k) => k.startsWith('msg.')));

export function isFlashKey(value: unknown): value is FlashKey {
  return typeof value === 'string' && VALID.has(value);
}

/** Traduce la clave que venga en la URL, o null si no es una conocida. */
export function readFlash(t: Translator, raw: string | null): string | null {
  return isFlashKey(raw) ? t(raw) : null;
}

/** Redirección con mensaje, conservando los campos que se quieran repoblar. */
export function redirectWithFlash(
  path: string,
  kind: 'error' | 'aviso',
  key: FlashKey,
  keep: Record<string, string> = {},
): Response {
  const params = new URLSearchParams({ [kind]: key, ...keep });
  return new Response(null, { status: 303, headers: { location: `${path}?${params}` } });
}
