import { guild, users } from './db.ts';
import type { GuildDoc, UserDoc } from './models.ts';
import type { MonsterVariant } from './catalog/monster-icons.ts';
import type { Translator } from './i18n/index.ts';

/**
 * Siempre devuelve un gremio; sin nombre si nadie lo ha puesto.
 *
 * El hueco es `null` y no un texto por defecto: guardar «Gremio sin nombre» en
 * el documento metía copia de interfaz —y en un solo idioma— dentro del dato, y
 * salía en español aunque la sesión fuera en inglés. El rótulo lo pone la vista
 * con `guildName`.
 */
export async function getGuild(): Promise<GuildDoc> {
  const collection = await guild();
  const doc = await collection.findOne({ _id: 'current' });
  return (
    doc ?? {
      _id: 'current',
      name: null,
      motto: null,
      updatedBy: null,
      updatedAt: new Date(),
    }
  );
}

/** Cómo se le llama al gremio en pantalla, con su rótulo traducido si no tiene nombre. */
export function guildName(t: Translator, doc: { name: string | null }): string {
  return doc.name || t('guild.unnamed');
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
      name: name.trim().slice(0, 50) || null,
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
  avatarMonsterId: number | null;
  avatarVariant: MonsterVariant;
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
    avatarMonsterId: user.avatarMonsterId ?? null,
    avatarVariant: user.avatarVariant ?? 'normal',
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
