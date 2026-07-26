import { catalogCollection } from '../db.ts';
import { buildCatalog } from './build.ts';
import { indexCatalog, type Catalog, type CatalogIndex } from './types.ts';

/**
 * El catálogo cambia una vez cada title update, así que se guarda en memoria y
 * se sirve desde ahí. Solo se relee de Mongo cuando el proceso arranca o cuando
 * alguien corre la sincronización y reinicia.
 */
let cached: { catalog: Catalog; json: string; index: CatalogIndex } | null = null;
let loading: Promise<void> | null = null;

async function loadFromMongo(): Promise<Catalog | null> {
  const collection = await catalogCollection();
  const doc = await collection.findOne({ _id: 'current' });
  return doc?.data ?? null;
}

/**
 * Primer arranque contra una base vacía: en vez de servir una app rota, baja el
 * catálogo solo. Es lo que hace que el deploy en Dokploy no necesite un paso
 * manual antes de poder usarse.
 */
async function bootstrap(): Promise<Catalog> {
  console.log('[catalog] base vacía; descargando de wilds.mhdb.io…');
  const locale = process.env.CATALOG_LOCALE || 'es-419';
  const catalog = await buildCatalog(locale);

  const collection = await catalogCollection();
  // El _id lo aporta el filtro; el driver no lo acepta en el reemplazo.
  await collection.replaceOne(
    { _id: 'current' },
    { version: catalog.version, locale: catalog.locale, data: catalog },
    { upsert: true },
  );
  console.log(`[catalog] listo — versión ${catalog.version}`);
  return catalog;
}

async function ensureLoaded(): Promise<void> {
  if (cached) return;
  if (!loading) {
    loading = (async () => {
      const catalog = (await loadFromMongo()) ?? (await bootstrap());
      cached = {
        catalog,
        json: JSON.stringify(catalog),
        index: indexCatalog(catalog),
      };
    })().catch((err) => {
      loading = null;
      throw err;
    });
  }
  await loading;
}

export async function getCatalog(): Promise<Catalog> {
  await ensureLoaded();
  return cached!.catalog;
}

/** JSON ya serializado, para no volver a stringificar en cada petición. */
export async function getCatalogJson(): Promise<{ json: string; version: string }> {
  await ensureLoaded();
  return { json: cached!.json, version: cached!.catalog.version };
}

/** Índices por id; los usa el renderizado en servidor de /set/<slug>. */
export async function getCatalogIndex(): Promise<CatalogIndex> {
  await ensureLoaded();
  return cached!.index;
}

/** Tira la caché para releer de Mongo sin reiniciar el contenedor. */
export function invalidateCatalogCache(): void {
  cached = null;
  loading = null;
}
