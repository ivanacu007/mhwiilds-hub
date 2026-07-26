import { defineMiddleware } from 'astro:middleware';
import { ensureIndexes } from './lib/db.ts';
import { readSession, toPublicUser } from './lib/auth/session.ts';
import { LOCALE_COOKIE, isLocale, localeFromHeader, translatorFor } from './lib/i18n/index.ts';

/** Rutas que exigen sesión. El resto es público (landing, login, /set/<slug>). */
const PROTECTED = [
  '/inventario', '/armador', '/mis-sets', '/cuenta',
  '/coronas', '/cazadores', '/cazador', '/gremio',
];

export const onRequest = defineMiddleware(async (context, next) => {
  await ensureIndexes();

  const user = await readSession(context.cookies);
  context.locals.user = user ? toPublicUser(user) : null;

  // La cookie manda; si no hay, se adivina del navegador la primera vez.
  const saved = context.cookies.get(LOCALE_COOKIE)?.value;
  context.locals.locale = isLocale(saved)
    ? saved
    : localeFromHeader(context.request.headers.get('accept-language'));
  context.locals.t = translatorFor(context.locals.locale);

  const path = context.url.pathname;
  const needsAuth = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

  if (needsAuth && !context.locals.user) {
    const next = encodeURIComponent(path + context.url.search);
    return context.redirect(`/entrar?siguiente=${next}`);
  }

  return next();
});
