import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { sessions, users } from '../db.ts';
import type { UserDoc } from '../models.ts';

export const SESSION_COOKIE = 'mhw_session';
const SESSION_DAYS = 30;

/**
 * En Mongo se guarda solo el hash del token. Si alguien se lleva un volcado de
 * la base, no se lleva sesiones utilizables.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  hunterName: string | null;
  hunterId: string | null;
  hr: number | null;
  favoriteMonsters: number[];
  picture: string | null;
  hasPassword: boolean;
}

export function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    // Las cuentas creadas antes de que existiera el campo no lo traen.
    hunterName: user.hunterName ?? null,
    hunterId: user.hunterId ?? null,
    hr: user.hr ?? null,
    favoriteMonsters: user.favoriteMonsters ?? [],
    picture: user.picture,
    hasPassword: Boolean(user.passwordHash),
  };
}

export async function createSession(cookies: AstroCookies, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const collection = await sessions();
  await collection.insertOne({
    _id: hashToken(token),
    userId,
    createdAt: new Date(),
    expiresAt,
  });

  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    expires: expiresAt,
  });
}

export async function readSession(cookies: AstroCookies): Promise<UserDoc | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const collection = await sessions();
  const session = await collection.findOne({ _id: hashToken(token) });
  if (!session) return null;

  // El índice TTL de Mongo borra las vencidas, pero puede tardar hasta un
  // minuto en pasar; no confiar en él para decidir si la sesión sirve.
  if (session.expiresAt.getTime() < Date.now()) {
    await collection.deleteOne({ _id: session._id });
    return null;
  }

  const userCollection = await users();
  return userCollection.findOne({ _id: session.userId });
}

export async function destroySession(cookies: AstroCookies): Promise<void> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const collection = await sessions();
    await collection.deleteOne({ _id: hashToken(token) });
  }
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

/** Cierra todas las sesiones de un usuario (tras cambiar contraseña). */
export async function destroyAllSessions(userId: string): Promise<void> {
  const collection = await sessions();
  await collection.deleteMany({ userId });
}

export function newUserId(): string {
  return randomUUID();
}
