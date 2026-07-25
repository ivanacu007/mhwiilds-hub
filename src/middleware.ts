import { defineMiddleware } from 'astro:middleware';
import { ensureIndexes } from './lib/db.ts';
import { readSession, toPublicUser } from './lib/auth/session.ts';

/** Rutas que exigen sesión. El resto es público (landing, login, /set/<slug>). */
const PROTECTED = [
  '/inventario', '/armador', '/mis-sets', '/cuenta',
  '/coronas', '/cazadores', '/cazador', '/gremio',
];

export const onRequest = defineMiddleware(async (context, next) => {
  await ensureIndexes();

  const user = await readSession(context.cookies);
  context.locals.user = user ? toPublicUser(user) : null;

  const path = context.url.pathname;
  const needsAuth = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

  if (needsAuth && !context.locals.user) {
    const next = encodeURIComponent(path + context.url.search);
    return context.redirect(`/entrar?siguiente=${next}`);
  }

  return next();
});
