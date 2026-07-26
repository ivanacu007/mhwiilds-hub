import type { APIRoute } from 'astro';
import { findByEmail, touchLogin } from '../../../lib/auth/accounts.ts';
import { verifyPassword } from '../../../lib/auth/password.ts';
import { createSession } from '../../../lib/auth/session.ts';
import { clientIp, rateLimit } from '../../../lib/auth/ratelimit.ts';
import { redirectWithFlash, type FlashKey } from '../../../lib/flash.ts';

function back(key: FlashKey, email: string, next: string): Response {
  const keep: Record<string, string> = { email };
  if (next) keep.siguiente = next;
  return redirectWithFlash('/entrar', 'error', key, keep);
}

/** Solo rutas internas: evita que un ?siguiente= manipulado mande a otro sitio. */
function safeNext(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/armador';
  return raw;
}

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('siguiente') ?? '');

  const ip = clientIp(request, clientAddress);
  // Dos cubetas: una frena a quien rocía contraseñas desde una IP, la otra
  // frena a quien ataca una cuenta concreta desde muchas IPs.
  if (!rateLimit(`login-ip:${ip}`, 20, 15 * 60 * 1000)) {
    return back('msg.tooManyTriesShort', email, next);
  }
  if (email && !rateLimit(`login-user:${email}`, 10, 15 * 60 * 1000)) {
    return back('msg.tooManyTriesShort', email, next);
  }

  const user = await findByEmail(email);

  // Mismo mensaje exista o no la cuenta, para no revelar qué correos hay.
  const invalid = () => back('msg.badCredentials', email, next);

  if (!user || !user.passwordHash) {
    if (user && !user.passwordHash) {
      return back('msg.useGoogle', email, next);
    }
    return invalid();
  }

  if (!(await verifyPassword(password, user.passwordHash))) return invalid();

  await touchLogin(user._id);
  await createSession(cookies, user._id);
  return new Response(null, {
    status: 303,
    headers: { location: safeNext(next) },
  });
};
