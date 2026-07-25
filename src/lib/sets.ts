import { randomBytes, randomUUID } from 'node:crypto';
import { savedSets } from './db.ts';
import { ARMOR_KINDS } from './catalog/types.ts';
import type { DecorationSlotAssignment, SavedSetDoc, SetPiece } from './models.ts';

/** Sin caracteres ambiguos: el slug acaba pegado en WhatsApp y dictado en voz. */
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomSlug(length = 9): string {
  const bytes = randomBytes(length);
  let slug = '';
  for (let i = 0; i < length; i++) slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  return slug;
}

/** Reintenta ante una colisión de slug, que con 31^9 combinaciones es rarísima. */
export async function uniqueSlug(): Promise<string> {
  const collection = await savedSets();
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug();
    if (!(await collection.findOne({ slug }, { projection: { _id: 1 } }))) return slug;
  }
  return randomSlug(14);
}

function cleanDecorations(raw: unknown): DecorationSlotAssignment[] {
  if (!Array.isArray(raw)) return [];
  const out: DecorationSlotAssignment[] = [];
  for (const entry of raw.slice(0, 3)) {
    const slotIndex = Number((entry as any)?.slotIndex);
    const decorationId = Number((entry as any)?.decorationId);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2) continue;
    if (!Number.isInteger(decorationId) || decorationId <= 0) continue;
    out.push({ slotIndex, decorationId });
  }
  return out;
}

function cleanPiece(raw: unknown): SetPiece | null {
  const armorId = Number((raw as any)?.armorId);
  if (!Number.isInteger(armorId) || armorId <= 0) return null;
  return { armorId, decorations: cleanDecorations((raw as any)?.decorations) };
}

export interface SetInput {
  name: string;
  notes: string | null;
  weaponId: number | null;
  weaponDecorations: unknown;
  head: unknown;
  chest: unknown;
  arms: unknown;
  waist: unknown;
  legs: unknown;
  charmId: number | null;
  charmLevel: number | null;
  isPublic: boolean;
}

export function buildSetDoc(
  input: SetInput,
  owner: { id: string; name: string; hunterName: string | null },
  slug: string,
): SavedSetDoc {
  const now = new Date();
  const doc: SavedSetDoc = {
    _id: randomUUID(),
    slug,
    ownerId: owner.id,
    ownerName: owner.name,
    ownerHunterName: owner.hunterName,
    name: input.name.trim().slice(0, 60) || 'Set sin nombre',
    notes: input.notes ? String(input.notes).trim().slice(0, 500) : null,
    weaponId: Number.isInteger(input.weaponId) && (input.weaponId as number) > 0 ? input.weaponId : null,
    weaponDecorations: cleanDecorations(input.weaponDecorations),
    head: null,
    chest: null,
    arms: null,
    waist: null,
    legs: null,
    charmId: Number.isInteger(input.charmId) && (input.charmId as number) > 0 ? input.charmId : null,
    charmLevel: Number.isInteger(input.charmLevel) ? input.charmLevel : null,
    isPublic: input.isPublic !== false,
    clonedFrom: null,
    createdAt: now,
    updatedAt: now,
  };

  for (const kind of ARMOR_KINDS) {
    doc[kind] = cleanPiece((input as any)[kind]);
  }

  return doc;
}
