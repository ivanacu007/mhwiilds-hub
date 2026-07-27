import { createHash, randomBytes } from 'node:crypto';
import { invites, progress, resetTokens, savedSets, users } from '../db.ts';
import { countCrowns } from '../crowns.ts';

/**
 * Quién es admin se decide por variable de entorno y no por un campo en el
 * usuario.
 *
 * Con un campo haría falta un script para marcar al primero —la pescadilla de
 * siempre— y un `update` mal hecho en Mongo te deja fuera de tu propia app. Con
 * la variable el admin existe desde el primer despliegue y se recupera
 * reiniciando el contenedor. Admite varios separados por coma.
 */
export function isAdmin(user: { email: string } | null | undefined): boolean {
  if (!user) return false;
  return adminEmails().includes(user.email.toLowerCase());
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Sin la variable puesta no hay admin: nadie entra, en vez de entrar todos. */
export function adminConfigured(): boolean {
  return adminEmails().length > 0;
}

export interface InviteRow {
  code: string;
  note: string | null;
  createdAt: Date;
  /** Nombre de quien lo canjeó, o `null` si sigue libre. */
  usedByName: string | null;
  usedAt: Date | null;
}

/** Las invitaciones con el nombre de quien las usó, no su id. */
export async function listInvites(limit = 100): Promise<InviteRow[]> {
  const collection = await invites();
  const rows = await collection.find({}).sort({ createdAt: -1 }).limit(limit).toArray();

  const usedIds = [...new Set(rows.map((r) => r.usedBy).filter((id): id is string => id != null))];
  const byId = new Map<string, string>();
  if (usedIds.length > 0) {
    const collectionUsers = await users();
    const list = await collectionUsers
      .find({ _id: { $in: usedIds } }, { projection: { name: 1, hunterName: 1 } })
      .toArray();
    for (const u of list) byId.set(u._id, u.hunterName || u.name);
  }

  return rows.map((row) => ({
    code: row._id,
    note: row.note,
    createdAt: row.createdAt,
    usedByName: row.usedBy ? (byId.get(row.usedBy) ?? row.usedBy) : null,
    usedAt: row.usedAt,
  }));
}

export interface AdminMember {
  id: string;
  name: string;
  hunterName: string | null;
  hr: number | null;
  /** Cómo entra: puede tener las dos. */
  hasPassword: boolean;
  hasGoogle: boolean;
  createdAt: Date;
  lastLoginAt: Date;
  sets: number;
  crowns: number;
}

/**
 * La foto del gremio de un vistazo. Cuenta sets y coronas con dos consultas
 * agregadas y no una por miembro: son pocos, pero una consulta por fila dentro
 * de un bucle es la forma más fácil de que esto se caiga cuando dejen de serlo.
 */
export async function listAdminMembers(): Promise<AdminMember[]> {
  const collection = await users();
  const list = await collection
    .find({}, { projection: { passwordHash: 1, googleId: 1, name: 1, hunterName: 1, hr: 1, createdAt: 1, lastLoginAt: 1 } })
    .sort({ createdAt: 1 })
    .limit(500)
    .toArray();

  const sets = await (await savedSets())
    .aggregate<{ _id: string; n: number }>([{ $group: { _id: '$ownerId', n: { $sum: 1 } } }])
    .toArray();
  const setsByUser = new Map(sets.map((s) => [s._id, s.n]));

  const progressDocs = await (await progress()).find({}).toArray();
  const crownsByUser = new Map(
    progressDocs.map((doc) => [
      doc._id,
      Object.values(doc.monsters ?? {}).reduce((n, m) => n + countCrowns(m?.crowns), 0),
    ]),
  );

  return list.map((user) => ({
    id: user._id,
    name: user.name,
    hunterName: user.hunterName ?? null,
    hr: user.hr ?? null,
    hasPassword: Boolean(user.passwordHash),
    hasGoogle: Boolean(user.googleId),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    sets: setsByUser.get(user._id) ?? 0,
    crowns: crownsByUser.get(user._id) ?? 0,
  }));
}

const TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Enlace de restablecimiento para dárselo a alguien a mano.
 *
 * Es la misma mecánica que `/api/auth/forgot` —token aleatorio, en Mongo solo
 * su hash, una hora de vida y un solo uso—, pero sin correo: mientras no haya
 * Resend configurado esta es la única vía de recuperar una contraseña, y sin
 * ella un olvido deja a alguien fuera para siempre.
 */
export async function createResetLink(
  email: string,
): Promise<{ ok: true; url: string; name: string } | { ok: false; reason: 'noUser' | 'googleOnly' }> {
  const collection = await users();
  const user = await collection.findOne({ email: email.trim().toLowerCase() });
  if (!user) return { ok: false, reason: 'noUser' };
  // Una cuenta solo-Google no tiene contraseña que restablecer.
  if (!user.passwordHash && user.googleId) return { ok: false, reason: 'googleOnly' };

  const token = randomBytes(32).toString('base64url');
  await (await resetTokens()).insertOne({
    _id: createHash('sha256').update(token).digest('hex'),
    userId: user._id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    usedAt: null,
  });

  const base = (process.env.PUBLIC_SITE_URL || 'http://localhost:4321').replace(/\/$/, '');
  return { ok: true, url: `${base}/restablecer?token=${token}`, name: user.hunterName || user.name };
}
