import type { Catalog } from '../catalog/types.ts';

/**
 * Caché del catálogo en el navegador.
 *
 * Son ~670 KB que no cambian hasta el siguiente title update, así que se
 * guardan en IndexedDB (localStorage no da para tanto) y en visitas siguientes
 * la petición se resuelve con un 304 vacío gracias al ETag.
 */
const DB_NAME = 'mhwilds-sets';
const STORE = 'catalogo';
const KEY = 'current';

interface CachedCatalog {
  version: string;
  catalog: Catalog;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCache(): Promise<CachedCatalog | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as CachedCatalog) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Modo incógnito o IndexedDB bloqueado: se sigue sin caché.
    return null;
  }
}

async function writeCache(value: CachedCatalog): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // No poder cachear no es motivo para romper la app.
  }
}

export async function loadCatalog(): Promise<Catalog> {
  const cached = await readCache();

  const res = await fetch('/api/catalog.json', {
    headers: cached ? { 'if-none-match': `"${cached.version}"` } : {},
  });

  if (res.status === 304 && cached) return cached.catalog;

  if (!res.ok) {
    // El servidor falló pero tenemos una copia: mejor una versión vieja que nada.
    if (cached) return cached.catalog;
    throw new Error(`No se pudo cargar el catálogo (${res.status}).`);
  }

  const catalog = (await res.json()) as Catalog;
  await writeCache({ version: catalog.version, catalog });
  return catalog;
}
