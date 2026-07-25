import { createHash } from 'node:crypto';
import type { APIRoute } from 'astro';
import { hashPassword, validatePassword } from '../../../lib/auth/password.ts';
import { createSession, destroyAllSessions } from '../../../lib/auth/session.ts';
import { resetTokens, users } from '../../../lib/db.ts';

function back(token: string, message: string): Response {
  const params = new URLSearchParams({ token, error: message });
  return new Response(null, {
    status: 303,
    headers: { location: `/restablecer?${params}` },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const form = await request.formData();
  const token = String(form.get('token') ?? '');
  const password = String(form.get('password') ?? '');

  if (!token) return back('', 'Falta el token del enlace.');

  const passwordError = validatePassword(password);
  if (passwordError) return back(token, passwordError);

  const collection = await resetTokens();
  const hashed = createHash('sha256').update(token).digest('hex');

  // findOneAndUpdate con usedAt:null hace que el token sirva una sola vez,
  // aunque lleguen dos peticiones a la vez.
  const record = await collection.findOneAndUpdate(
    { _id: hashed, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );

  if (!record) {
    return back(token, 'Ese enlace ya se usó o venció. Pide uno nuevo.');
  }

  const userCollection = await users();
  await userCollection.updateOne(
    { _id: record.userId },
    { $set: { passwordHash: await hashPassword(password) } },
  );

  // Quien haya entrado con la contraseña vieja se queda fuera.
  await destroyAllSessions(record.userId);
  await createSession(cookies, record.userId);

  return new Response(null, { status: 303, headers: { location: '/inventario' } });
};
