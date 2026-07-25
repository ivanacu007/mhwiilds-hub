import type { APIRoute } from 'astro';
import {
  OAUTH_INVITE_COOKIE,
  exchangeCodeForProfile,
  googleConfigured,
  verifyState,
} from '../../../../lib/auth/google.ts';
import { loginWithGoogle } from '../../../../lib/auth/accounts.ts';
import { createSession } from '../../../../lib/auth/session.ts';

function fail(message: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: `/entrar?error=${encodeURIComponent(message)}` },
  });
}

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!googleConfigured()) return fail('El acceso con Google no está configurado.');

  const invite = cookies.get(OAUTH_INVITE_COOKIE)?.value ?? null;
  cookies.delete(OAUTH_INVITE_COOKIE, { path: '/' });

  if (url.searchParams.get('error')) {
    return fail('Cancelaste el acceso con Google.');
  }

  // Se valida el state siempre, incluso si falta el código: así la cookie
  // de un solo uso se limpia pase lo que pase.
  const stateOk = verifyState(cookies, url.searchParams.get('state'));
  const code = url.searchParams.get('code');

  if (!stateOk) return fail('La sesión de acceso caducó. Inténtalo otra vez.');
  if (!code) return fail('Google no devolvió un código de acceso.');

  let profile;
  try {
    profile = await exchangeCodeForProfile(code);
  } catch (err) {
    console.error('[auth] fallo intercambiando código de Google:', err);
    return fail('No se pudo completar el acceso con Google.');
  }

  if (!profile.emailVerified) {
    return fail('Tu correo de Google no está verificado.');
  }

  const result = await loginWithGoogle(profile, invite);
  if (!result.ok) return fail(result.error);

  await createSession(cookies, result.user._id);
  return new Response(null, { status: 303, headers: { location: '/inventario' } });
};
