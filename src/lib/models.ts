import type { Catalog } from './catalog/types.ts';
import type { MonsterVariant } from './catalog/monster-icons.ts';
import type { CrownKey } from './crowns.ts';

export interface UserDoc {
  _id: string;
  email: string;
  /** Nombre en la app. Con Google llega ya puesto, sin preguntar nada. */
  name: string;
  /**
   * Nombre de cazador dentro de Wilds. Opcional y separado de `name`: quien
   * entra con Google nunca pasa por un formulario donde escribirlo, así que
   * tiene que poder quedar vacío y llenarse después desde /cuenta.
   */
  hunterName: string | null;
  /** El código que se comparte dentro del juego para agregarse. */
  hunterId: string | null;
  /** Rango de cazador. */
  hr: number | null;
  favoriteMonsters: number[];
  /** Monstruo elegido como foto de perfil, si eligió alguno. */
  avatarMonsterId: number | null;
  /** Qué nivel de ese monstruo usa: normal, templado o arcotemplado. */
  avatarVariant: MonsterVariant;
  picture: string | null;
  /** Presente si la cuenta se creó o vinculó con Google. */
  googleId: string | null;
  /** Presente si la cuenta tiene contraseña. Puede coexistir con googleId. */
  passwordHash: string | null;
  invitedWith: string | null;
  createdAt: Date;
  lastLoginAt: Date;
}

export interface SessionDoc {
  /** Hash del token de sesión; el token en claro solo vive en la cookie. */
  _id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface InviteDoc {
  /** El código de invitación en sí. */
  _id: string;
  note: string | null;
  createdAt: Date;
  usedBy: string | null;
  usedAt: Date | null;
}

/** Token de un solo uso para restablecer contraseña. */
export interface ResetTokenDoc {
  _id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface InventoryDoc {
  /** userId: un inventario por usuario. */
  _id: string;
  /** decorationId -> cantidad que posee. */
  decorations: Record<string, number>;
  /** charmId -> rango máximo forjado (1..n). */
  charms: Record<string, number>;
  /** Ids de piezas de armadura ya forjadas. */
  armor: number[];
  /** Ids de armas ya forjadas. */
  weapons: number[];
  /** itemId -> cantidad en la caja. */
  materials: Record<string, number>;
  updatedAt: Date;
}

/** Un adorno colocado en una ranura concreta de una pieza concreta. */
export interface DecorationSlotAssignment {
  /** Índice dentro del array `slots` de la pieza. */
  slotIndex: number;
  decorationId: number;
}

export interface SetPiece {
  armorId: number;
  decorations: DecorationSlotAssignment[];
}

export interface SavedSetDoc {
  _id: string;
  /** Identificador corto y público usado en /set/<slug>. */
  slug: string;
  ownerId: string;
  /** Se guarda una copia del nombre para que el enlace público no dependa
   *  de leer al usuario en cada visita. */
  ownerName: string;
  ownerHunterName: string | null;
  name: string;
  notes: string | null;
  weaponId: number | null;
  weaponDecorations: DecorationSlotAssignment[];
  head: SetPiece | null;
  chest: SetPiece | null;
  arms: SetPiece | null;
  waist: SetPiece | null;
  legs: SetPiece | null;
  charmId: number | null;
  charmLevel: number | null;
  /** Si es false, el link compartido devuelve 404 a terceros. */
  isPublic: boolean;
  clonedFrom: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Progreso por monstruo de un cazador.
 *
 * Se guarda el rango de tamaños que le han salido, no las coronas: con los
 * umbrales del catálogo las coronas se deducen, y además se puede decir cuánto
 * falta para la siguiente. Las banderas manuales existen para quien prefiera
 * palomear sin teclear números.
 */
/** Cuenta por nivel del monstruo. Los que no existen se quedan en cero. */
export type VariantCounts = Record<MonsterVariant, number>;

export interface MonsterProgress {
  /**
   * El ejemplar más pequeño que ha cazado. Las coronas son del monstruo, no de
   * su nivel: un templado gigante da la misma corona de oro que uno normal, así
   * que el tamaño se guarda una sola vez y no por variante.
   */
  smallest: number | null;
  /** El más grande. */
  largest: number | null;
  hunted: VariantCounts;
  captured: VariantCounts;
  /** Coronas marcadas a mano, sin respaldo de tamaño. */
  manual: Record<CrownKey, boolean>;
}

export interface ProgressDoc {
  /** userId: un documento de progreso por cazador. */
  _id: string;
  /** monsterId -> progreso. */
  monsters: Record<string, MonsterProgress>;
  updatedAt: Date;
}

/**
 * El gremio. Hay uno solo por servidor: quien entra con una invitación ya es
 * miembro, así que no hacen falta permisos ni altas y bajas.
 */
export interface GuildDoc {
  _id: 'current';
  name: string;
  motto: string | null;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface CatalogDoc {
  _id: 'current';
  version: string;
  locale: string;
  data: Catalog;
}
