import type { APIRoute } from 'astro';
import { createUser, findByEmail } from '../../../lib/auth/accounts.ts';
import { inviteIsAvailable, normalizeInviteCode } from '../../../lib/auth/invites.ts';
import { hashPassword, validateEmail, validatePassword } from '../../../lib/auth/password.ts';
import { createSession } from '../../../lib/auth/session.ts';
import { clientIp, rateLimit } from '../../../lib/auth/ratelimit.ts';
import { redirectWithFlash, type FlashKey } from '../../../lib/flash.ts';

function back(key: FlashKey, form: Record<string, string>): Response {
  return redirectWithFlash('/registro', 'error', key, form);
}

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const ip = clientIp(request, clientAddress);
  if (!rateLimit(`register:${ip}`, 10, 60 * 60 * 1000)) {
    return back('msg.tooManyTries', {});
  }

  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const name = String(form.get('name') ?? '').trim();
  const hunterName = String(form.get('hunterName') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const inviteCode = normalizeInviteCode(String(form.get('invite') ?? ''));

  const keep = { email, name, hunterName, invite: inviteCode };

  if (validateEmail(email)) return back('msg.badEmail', keep);
  if (name.length < 2 || name.length > 40) return back('msg.nameLength', keep);
  // El Hunter Name es opcional, pero si lo escriben tiene que ser usable.
  if (hunterName && hunterName.length > 40) return back('msg.hunterNameLong', keep);

  const passwordError = validatePassword(password);
  if (passwordError) {
    return back(password.length < 10 ? 'msg.passwordShort' : 'msg.passwordLong', keep);
  }
  if (!inviteCode) return back('msg.inviteNeeded', keep);

  if (!(await inviteIsAvailable(inviteCode))) return back('msg.inviteInvalid', keep);
  if (await findByEmail(email)) return back('msg.emailTaken', keep);

  const result = await createUser({
    email,
    name,
    hunterName,
    picture: null,
    googleId: null,
    passwordHash: await hashPassword(password),
    inviteCode,
  });

  if (!result.ok) return back(result.error, keep);

  await createSession(cookies, result.user._id);
  return new Response(null, { status: 303, headers: { location: '/inventario' } });
};
