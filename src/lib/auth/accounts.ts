import { users } from '../db.ts';
import type { UserDoc } from '../models.ts';
import { consumeInvite, releaseInvite } from './invites.ts';
import { newUserId } from './session.ts';
import type { GoogleProfile } from './google.ts';
import type { FlashKey } from '../flash.ts';

export type AccountResult =
  | {
      ok: true;
      user: UserDoc;
      /**
       * La cuenta se acaba de crear en esta misma petición. Con Google, entrar y
       * registrarse son la misma dirección, y quien llega decide a dónde mandar
       * después: a estrenar el inventario o a la portada de siempre.
       */
      created?: boolean;
    }
  /** Clave de mensaje, no texto: quien lo muestre lo traduce a su idioma. */
  | { ok: false; error: FlashKey };

export async function findByEmail(email: string): Promise<UserDoc | null> {
  const collection = await users();
  return collection.findOne({ email: email.trim().toLowerCase() });
}

export async function createUser(params: {
  email: string;
  name: string;
  hunterName?: string | null;
  picture: string | null;
  googleId: string | null;
  passwordHash: string | null;
  inviteCode: string;
}): Promise<AccountResult> {
  const email = params.email.trim().toLowerCase();
  const collection = await users();

  // Se consume la invitación primero para que dos registros simultáneos con el
  // mismo código no puedan colarse ambos.
  const claimed = await consumeInvite(params.inviteCode, 'pending');
  if (!claimed) {
    return { ok: false, error: 'msg.inviteInvalid' };
  }

  const user: UserDoc = {
    _id: newUserId(),
    email,
    name: params.name,
    hunterName: params.hunterName?.trim() || null,
    hunterId: null,
    hr: null,
    favoriteMonsters: [],
    avatarMonsterId: null,
    avatarVariant: 'normal',
    picture: params.picture,
    googleId: params.googleId,
    passwordHash: params.passwordHash,
    invitedWith: params.inviteCode,
    createdAt: new Date(),
    lastLoginAt: new Date(),
  };

  try {
    await collection.insertOne(user);
  } catch (err: any) {
    await releaseInvite(params.inviteCode);
    if (err?.code === 11000) {
      // Distinguir el índice que chocó evita el mensaje engañoso de "ya existe
      // ese correo" cuando en realidad colisionó otra cosa.
      const clashedOnEmail = String(err?.keyPattern ? Object.keys(err.keyPattern)[0] : '') === 'email';
      return {
        ok: false,
        error: clashedOnEmail ? 'msg.emailTaken' : 'msg.googleTaken',
      };
    }
    throw err;
  }

  // Ahora que el usuario existe, se apunta la invitación a su id real.
  const inviteCollection = await (await import('../db.ts')).invites();
  await inviteCollection.updateOne(
    { _id: params.inviteCode },
    { $set: { usedBy: user._id } },
  );

  return { ok: true, user, created: true };
}

/**
 * Resuelve el login con Google. Si ya hay una cuenta con ese correo (creada con
 * contraseña), le vincula el googleId en vez de rechazarla: es la misma persona
 * y forzarla a recordar cuál de los dos métodos usó sería una molestia inútil.
 */
export async function loginWithGoogle(
  profile: GoogleProfile,
  inviteCode: string | null,
): Promise<AccountResult> {
  const collection = await users();

  const byGoogleId = await collection.findOne({ googleId: profile.googleId });
  if (byGoogleId) {
    await collection.updateOne(
      { _id: byGoogleId._id },
      { $set: { lastLoginAt: new Date(), picture: profile.picture } },
    );
    return { ok: true, user: byGoogleId };
  }

  const byEmail = await findByEmail(profile.email);
  if (byEmail) {
    await collection.updateOne(
      { _id: byEmail._id },
      {
        $set: {
          googleId: profile.googleId,
          picture: profile.picture ?? byEmail.picture,
          lastLoginAt: new Date(),
        },
      },
    );
    return { ok: true, user: { ...byEmail, googleId: profile.googleId } };
  }

  if (!inviteCode) {
    return { ok: false, error: 'msg.googleNoAccount' };
  }

  return createUser({
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    googleId: profile.googleId,
    passwordHash: null,
    inviteCode,
  });
}

export async function touchLogin(userId: string): Promise<void> {
  const collection = await users();
  await collection.updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } });
}
