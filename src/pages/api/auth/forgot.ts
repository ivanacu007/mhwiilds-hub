import { createHash, randomBytes } from 'node:crypto';
import type { APIRoute } from 'astro';
import { findByEmail } from '../../../lib/auth/accounts.ts';
import { emailConfigured, sendPasswordReset } from '../../../lib/auth/email.ts';
import { resetTokens } from '../../../lib/db.ts';
import { clientIp, rateLimit } from '../../../lib/auth/ratelimit.ts';
import { redirectWithFlash, type FlashKey } from '../../../lib/flash.ts';

const TOKEN_TTL_MS = 60 * 60 * 1000;

const done = (key: FlashKey) => redirectWithFlash('/entrar', 'aviso', key);

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!emailConfigured()) {
    return done('msg.resetNoEmail');
  }

  const ip = clientIp(request, clientAddress);
  if (!rateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000)) {
    return done('msg.tooManyRequests');
  }

  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();

  // Siempre la misma respuesta: si dijera "ese correo no existe" convertiría
  // el formulario en una forma de averiguar quién tiene cuenta.
  const generic = done('msg.resetSent');

  const user = await findByEmail(email);
  if (!user) return generic;
  if (!user.passwordHash && user.googleId) {
    // Cuenta solo-Google: mandarle un reset la dejaría más confundida.
    return generic;
  }

  const token = randomBytes(32).toString('base64url');
  const collection = await resetTokens();
  await collection.insertOne({
    _id: createHash('sha256').update(token).digest('hex'),
    userId: user._id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    usedAt: null,
  });

  const base = (process.env.PUBLIC_SITE_URL || 'http://localhost:4321').replace(/\/$/, '');
  try {
    await sendPasswordReset(user.email, user.name, `${base}/restablecer?token=${token}`);
  } catch (err) {
    console.error('[auth] no se pudo mandar el correo de reset:', err);
  }

  return generic;
};
