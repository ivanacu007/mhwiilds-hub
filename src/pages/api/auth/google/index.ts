import type { APIRoute } from 'astro';
import { beginGoogleAuth, googleConfigured } from '../../../../lib/auth/google.ts';
import { normalizeInviteCode } from '../../../../lib/auth/invites.ts';
import { redirectWithFlash } from '../../../../lib/flash.ts';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  if (!googleConfigured()) {
    return redirectWithFlash('/entrar', 'error', 'msg.googleNotConfigured');
  }

  // Si viene de /registro trae invitación; si viene de /entrar, no.
  const raw = url.searchParams.get('invite');
  const invite = raw ? normalizeInviteCode(raw) : null;

  return redirect(beginGoogleAuth(cookies, invite));
};
