import type { Catalog } from './catalog/types.ts';

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

export interface CatalogDoc {
  _id: 'current';
  version: string;
  locale: string;
  data: Catalog;
}
