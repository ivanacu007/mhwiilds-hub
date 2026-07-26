import { es } from './es.ts';
import { en } from './en.ts';

export type Locale = 'es' | 'en';

export const LOCALES: Locale[] = ['es', 'en'];

export const LOCALE_LABEL: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};

/**
 * Locale de la API de wilds.mhdb.io para cada idioma de la interfaz.
 *
 * Español latino, no el de España: difieren en el 100% de los adornos y en la
 * mitad de las armaduras, y los nombres del juego en México son los de es-419.
 */
export const API_LOCALE: Record<Locale, string> = {
  es: 'es-419',
  en: 'en',
};

export const DEFAULT_LOCALE: Locale = 'es';

export const LOCALE_COOKIE = 'mhw_lang';

/** El diccionario español es la fuente: el inglés debe cubrir sus mismas claves. */
export type TranslationKey = keyof typeof es;
// Los valores son `string` y no el literal de cada texto, o el inglés no encajaría.
export type Dictionary = Record<TranslationKey, string>;

const DICTIONARIES: Record<Locale, Dictionary> = { es, en };

export function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en';
}

/**
 * Del `Accept-Language` del navegador saca un idioma soportado. Solo se usa la
 * primera vez, antes de que haya preferencia guardada.
 */
export function localeFromHeader(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (tag.startsWith('en')) return 'en';
    if (tag.startsWith('es')) return 'es';
  }
  return DEFAULT_LOCALE;
}

/**
 * Traduce. Los marcadores van como `{nombre}` y se sustituyen con `params`.
 *
 * Si falta una clave en el idioma pedido se cae al español en vez de mostrar la
 * clave cruda: un texto en el idioma equivocado molesta menos que "crowns.title"
 * en mitad de la pantalla.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  let text: string = dictionary[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? String(key);

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/** Traductor ya atado a un idioma, que es como se usa en páginas y componentes. */
export type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function translatorFor(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params);
}

/** Para `toLocaleDateString` y compañía. */
export const INTL_LOCALE: Record<Locale, string> = {
  es: 'es-MX',
  en: 'en-US',
};
