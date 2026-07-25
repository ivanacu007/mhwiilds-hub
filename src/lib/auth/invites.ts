import { randomBytes } from 'node:crypto';
import { invites } from '../db.ts';

/** Sin vocales ni caracteres que se confunden al dictarlos por voz. */
const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY3479';

export function generateInviteCode(): string {
  const bytes = randomBytes(12);
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
    if (i === 3 || i === 7) code += '-';
  }
  return code;
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

/**
 * Consume un código de invitación de forma atómica: el `findOneAndUpdate` con
 * `usedBy: null` garantiza que dos personas que lo canjeen al mismo tiempo no
 * puedan entrar ambas con el mismo código.
 */
export async function consumeInvite(code: string, userId: string): Promise<boolean> {
  const collection = await invites();
  const result = await collection.findOneAndUpdate(
    { _id: normalizeInviteCode(code), usedBy: null },
    { $set: { usedBy: userId, usedAt: new Date() } },
  );
  return result != null;
}

/** Devuelve el código a disponible si el registro falla después de consumirlo. */
export async function releaseInvite(code: string): Promise<void> {
  const collection = await invites();
  await collection.updateOne(
    { _id: normalizeInviteCode(code) },
    { $set: { usedBy: null, usedAt: null } },
  );
}

export async function inviteIsAvailable(code: string): Promise<boolean> {
  const collection = await invites();
  const invite = await collection.findOne({ _id: normalizeInviteCode(code), usedBy: null });
  return invite != null;
}

export async function createInvite(note: string | null): Promise<string> {
  const collection = await invites();
  const code = generateInviteCode();
  await collection.insertOne({
    _id: code,
    note,
    createdAt: new Date(),
    usedBy: null,
    usedAt: null,
  });
  return code;
}
