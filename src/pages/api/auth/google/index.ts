import type { APIRoute } from 'astro';
import { beginGoogleAuth, googleConfigured } from '../../../../lib/auth/google.ts';
import { normalizeInviteCode } from '../../../../lib/auth/invites.ts';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  if (!googleConfigured()) {
    return redirect('/entrar?error=' + encodeURIComponent('El acceso con Google no está configurado en este servidor.'));
  }

  // Si viene de /registro trae invitación; si viene de /entrar, no.
  const raw = url.searchParams.get('invite');
  const invite = raw ? normalizeInviteCode(raw) : null;

  return redirect(beginGoogleAuth(cookies, invite));
};
