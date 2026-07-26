import type { APIRoute } from 'astro';
import { LOCALE_COOKIE, isLocale } from '../../lib/i18n/index.ts';

/**
 * Guarda el idioma en una cookie y devuelve a donde estabas.
 *
 * Va por cookie y no por prefijo de URL a propósito: los enlaces de sets se
 * comparten entre amigos, y así cada quien lo abre en su propio idioma en vez
 * de heredar el de quien lo mandó.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const form = await request.formData();
  const lang = String(form.get('lang') ?? '');
  const back = String(form.get('back') ?? '/');

  if (isLocale(lang)) {
    cookies.set(LOCALE_COOKIE, lang, {
      httpOnly: false,
      sameSite: 'lax',
      secure: import.meta.env.PROD,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // Solo rutas internas: un `back` manipulado no debe sacarte del sitio.
  const target = back.startsWith('/') && !back.startsWith('//') ? back : '/';
  return new Response(null, { status: 303, headers: { location: target } });
};
