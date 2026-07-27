import type { APIRoute } from 'astro';
import {
  OAUTH_INVITE_COOKIE,
  exchangeCodeForProfile,
  googleConfigured,
  verifyState,
} from '../../../../lib/auth/google.ts';
import { loginWithGoogle } from '../../../../lib/auth/accounts.ts';
import { createSession } from '../../../../lib/auth/session.ts';
import { redirectWithFlash, type FlashKey } from '../../../../lib/flash.ts';

const fail = (key: FlashKey) => redirectWithFlash('/entrar', 'error', key);

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!googleConfigured()) return fail('msg.googleNotConfigured');

  const invite = cookies.get(OAUTH_INVITE_COOKIE)?.value ?? null;
  cookies.delete(OAUTH_INVITE_COOKIE, { path: '/' });

  if (url.searchParams.get('error')) {
    return fail('msg.googleCancelled');
  }

  // Se valida el state siempre, incluso si falta el código: así la cookie
  // de un solo uso se limpia pase lo que pase.
  const stateOk = verifyState(cookies, url.searchParams.get('state'));
  const code = url.searchParams.get('code');

  if (!stateOk) return fail('msg.googleExpired');
  if (!code) return fail('msg.googleNoCode');

  let profile;
  try {
    profile = await exchangeCodeForProfile(code);
  } catch (err) {
    console.error('[auth] fallo intercambiando código de Google:', err);
    return fail('msg.googleFailed');
  }

  if (!profile.emailVerified) {
    return fail('msg.googleUnverified');
  }

  const result = await loginWithGoogle(profile, invite);
  if (!result.ok) return fail(result.error);

  await createSession(cookies, result.user._id);
  // Cuenta recién creada: al inventario, que es lo primero que hay que llenar.
  // Quien ya la tenía solo está entrando, y entrar lleva a la portada.
  return new Response(null, {
    status: 303,
    headers: { location: result.created ? '/inventario' : '/' },
  });
};
