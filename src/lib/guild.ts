import { guild, users } from './db.ts';
import type { GuildDoc, UserDoc } from './models.ts';

const DEFAULT_NAME = 'Gremio sin nombre';

/** Siempre devuelve un gremio: si nadie lo ha nombrado, uno por defecto. */
export async function getGuild(): Promise<GuildDoc> {
  const collection = await guild();
  const doc = await collection.findOne({ _id: 'current' });
  return (
    doc ?? {
      _id: 'current',
      name: DEFAULT_NAME,
      motto: null,
      updatedBy: null,
      updatedAt: new Date(),
    }
  );
}

export async function setGuild(
  name: string,
  motto: string | null,
  updatedBy: string,
): Promise<void> {
  const collection = await guild();
  await collection.replaceOne(
    { _id: 'current' },
    {
      name: name.trim().slice(0, 50) || DEFAULT_NAME,
      motto: motto?.trim().slice(0, 140) || null,
      updatedBy,
      updatedAt: new Date(),
    },
    { upsert: true },
  );
}

export interface GuildMember {
  id: string;
  name: string;
  hunterName: string | null;
  hunterId: string | null;
  hr: number | null;
  picture: string | null;
  favoriteMonsters: number[];
  joinedAt: Date;
  lastLoginAt: Date;
}

function toMember(user: UserDoc): GuildMember {
  return {
    id: user._id,
    name: user.name,
    hunterName: user.hunterName ?? null,
    hunterId: user.hunterId ?? null,
    hr: user.hr ?? null,
    picture: user.picture,
    favoriteMonsters: user.favoriteMonsters ?? [],
    joinedAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

/**
 * Todos los registrados son miembros: el registro ya es por invitación, así que
 * no hace falta un alta aparte.
 */
export async function listMembers(): Promise<GuildMember[]> {
  const collection = await users();
  const list = await collection
    .find({}, { projection: { passwordHash: 0, email: 0 } })
    .sort({ createdAt: 1 })
    .limit(500)
    .toArray();
  return list.map(toMember);
}

export async function getMember(userId: string): Promise<GuildMember | null> {
  const collection = await users();
  const user = await collection.findOne({ _id: userId }, { projection: { passwordHash: 0 } });
  return user ? toMember(user) : null;
}

/** Cómo se le llama al cazador: su nombre del juego si lo puso. */
export function displayName(member: { hunterName: string | null; name: string }): string {
  return member.hunterName || member.name;
}
