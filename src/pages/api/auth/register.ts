import type { APIRoute } from 'astro';
import { createUser, findByEmail } from '../../../lib/auth/accounts.ts';
import { inviteIsAvailable, normalizeInviteCode } from '../../../lib/auth/invites.ts';
import { hashPassword, validateEmail, validatePassword } from '../../../lib/auth/password.ts';
import { createSession } from '../../../lib/auth/session.ts';
import { clientIp, rateLimit } from '../../../lib/auth/ratelimit.ts';

function back(message: string, form: Record<string, string>): Response {
  const params = new URLSearchParams({ error: message, ...form });
  return new Response(null, {
    status: 303,
    headers: { location: `/registro?${params}` },
  });
}

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const ip = clientIp(request, clientAddress);
  if (!rateLimit(`register:${ip}`, 10, 60 * 60 * 1000)) {
    return back('Demasiados intentos. Espera un rato.', {});
  }

  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const name = String(form.get('name') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const inviteCode = normalizeInviteCode(String(form.get('invite') ?? ''));

  const keep = { email, name, invite: inviteCode };

  const emailError = validateEmail(email);
  if (emailError) return back(emailError, keep);
  if (name.length < 2 || name.length > 40) {
    return back('El nombre debe tener entre 2 y 40 caracteres.', keep);
  }
  const passwordError = validatePassword(password);
  if (passwordError) return back(passwordError, keep);
  if (!inviteCode) return back('Necesitas un código de invitación.', keep);

  if (!(await inviteIsAvailable(inviteCode))) {
    return back('Ese código de invitación no existe o ya fue usado.', keep);
  }
  if (await findByEmail(email)) {
    return back('Ya existe una cuenta con ese correo.', keep);
  }

  const result = await createUser({
    email,
    name,
    picture: null,
    googleId: null,
    passwordHash: await hashPassword(password),
    inviteCode,
  });

  if (!result.ok) return back(result.error, keep);

  await createSession(cookies, result.user._id);
  return new Response(null, { status: 303, headers: { location: '/inventario' } });
};
