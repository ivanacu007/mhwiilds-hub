import { MongoClient, type Db, type Collection } from 'mongodb';
import type {
  CatalogDoc,
  GuildDoc,
  ProgressDoc,
  InventoryDoc,
  InviteDoc,
  ResetTokenDoc,
  SavedSetDoc,
  SessionDoc,
  UserDoc,
} from './models.ts';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'mhwilds_sets';

if (!uri) {
  throw new Error('Falta MONGODB_URI. Copia .env.example a .env y llénalo.');
}

/**
 * Una sola conexión para todo el proceso. El driver de Mongo ya maneja su
 * propio pool, así que abrir más clientes solo desperdicia sockets.
 */
let clientPromise: Promise<MongoClient> | null = null;

function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    clientPromise = new MongoClient(uri!, {
      // El VPS y Mongo están en la misma red de Docker: si no conecta rápido,
      // es que algo está mal, no que la red esté lenta.
      serverSelectionTimeoutMS: 5000,
    }).connect();
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(dbName);
}

export async function users(): Promise<Collection<UserDoc>> {
  return (await getDb()).collection<UserDoc>('users');
}

export async function sessions(): Promise<Collection<SessionDoc>> {
  return (await getDb()).collection<SessionDoc>('sessions');
}

export async function invites(): Promise<Collection<InviteDoc>> {
  return (await getDb()).collection<InviteDoc>('invites');
}

export async function resetTokens(): Promise<Collection<ResetTokenDoc>> {
  return (await getDb()).collection<ResetTokenDoc>('resetTokens');
}

export async function inventories(): Promise<Collection<InventoryDoc>> {
  return (await getDb()).collection<InventoryDoc>('inventories');
}

export async function savedSets(): Promise<Collection<SavedSetDoc>> {
  return (await getDb()).collection<SavedSetDoc>('sets');
}

export async function progress(): Promise<Collection<ProgressDoc>> {
  return (await getDb()).collection<ProgressDoc>('progress');
}

export async function guild(): Promise<Collection<GuildDoc>> {
  return (await getDb()).collection<GuildDoc>('guild');
}

export async function catalogCollection(): Promise<Collection<CatalogDoc>> {
  return (await getDb()).collection<CatalogDoc>('catalog');
}

/**
 * Crea los índices. Se llama una vez al arrancar; `createIndex` es idempotente,
 * así que no pasa nada si se ejecuta en cada deploy.
 */
let indexesReady: Promise<void> | null = null;

export function ensureIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const [u, s, i, r, sets] = await Promise.all([
        users(), sessions(), invites(), resetTokens(), savedSets(),
      ]);
      await Promise.all([
        u.createIndex({ email: 1 }, { unique: true }),
        // Parcial y no sparse: `sparse` excluye los documentos que NO tienen el
        // campo, pero `googleId: null` sí lo tiene, así que todas las cuentas
        // creadas con contraseña chocarían entre sí y solo podría existir una.
        u.createIndex(
          { googleId: 1 },
          { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
        ),
        // Mongo borra solo las sesiones vencidas; no hace falta un cron.
        s.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        s.createIndex({ userId: 1 }),
        i.createIndex({ usedBy: 1 }),
        r.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        sets.createIndex({ slug: 1 }, { unique: true }),
        sets.createIndex({ ownerId: 1, updatedAt: -1 }),
      ]);
    })().catch((err) => {
      // Si falla, que el siguiente intento lo reintente en vez de quedar pegado.
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
