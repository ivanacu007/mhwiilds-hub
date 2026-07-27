import type { Catalog } from '../catalog/types.ts';
import type { CatalogPart } from '../catalog/store.ts';

/**
 * Caché del catálogo en el navegador.
 *
 * Se guarda en IndexedDB (localStorage no da para tanto) y hay una entrada por
 * recorte: la pantalla de coronas solo pide `monsters`, así que no tiene por
 * qué compartir caché —ni espera— con el armador, que los pide todos.
 *
 * Con copia guardada se devuelve **de inmediato** y la revalidación va por
 * detrás. Antes se esperaba siempre a la red aunque el servidor fuese a
 * contestar un 304 vacío, y eso eran 200-300 ms de pantalla en blanco en cada
 * visita. El precio es que si justo hubo un title update se ve el catálogo
 * anterior durante esa visita; a la siguiente ya está el nuevo.
 */
const DB_NAME = 'mhwilds-sets';
const STORE = 'catalogo';

interface CachedCatalog {
  version: string;
  catalog: Catalog;
}

/** Una clave por recorte. La vieja, `current`, era el catálogo entero. */
function cacheKey(parts: CatalogPart[] | undefined): string {
  return parts && parts.length > 0 ? [...parts].sort().join(',') : 'current';
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

async function readCache(key: string): Promise<CachedCatalog | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as CachedCatalog) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Modo incógnito o IndexedDB bloqueado: se sigue sin caché.
    return null;
  }
}

async function writeCache(key: string, value: CachedCatalog): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // No poder cachear no es motivo para romper la app.
  }
}

/**
 * Un catálogo siempre tiene las ocho listas, aunque se hayan pedido dos: las
 * que falten quedan vacías para que nadie tenga que comprobar `undefined`.
 */
function complete(partial: Partial<Catalog>): Catalog {
  return {
    version: partial.version ?? '',
    locale: partial.locale ?? '',
    skills: partial.skills ?? [],
    armor: partial.armor ?? [],
    armorSets: partial.armorSets ?? [],
    decorations: partial.decorations ?? [],
    charms: partial.charms ?? [],
    weapons: partial.weapons ?? [],
    items: partial.items ?? [],
    monsters: partial.monsters ?? [],
  };
}

async function fetchCatalog(
  key: string,
  parts: CatalogPart[] | undefined,
  cached: CachedCatalog | null,
): Promise<Catalog | null> {
  const query = parts && parts.length > 0 ? `?parts=${[...parts].sort().join(',')}` : '';
  const res = await fetch(`/api/catalog.json${query}`, {
    headers: cached ? { 'if-none-match': `"${cached.version}"` } : {},
  });

  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`No se pudo cargar el catálogo (${res.status}).`);

  const catalog = complete((await res.json()) as Partial<Catalog>);
  await writeCache(key, { version: catalog.version, catalog });
  return catalog;
}

export async function loadCatalog(parts?: CatalogPart[]): Promise<Catalog> {
  const key = cacheKey(parts);
  const cached = await readCache(key);

  if (cached) {
    // Revalidación en segundo plano: la pantalla ya puede pintarse.
    void fetchCatalog(key, parts, cached).catch(() => {});
    return cached.catalog;
  }

  const fresh = await fetchCatalog(key, parts, null);
  // Sin copia previa, un 304 no debería llegar; si llega, algo va muy mal.
  if (!fresh) throw new Error('El catálogo respondió 304 sin haber copia guardada.');
  return fresh;
}
