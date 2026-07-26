import { catalogCollection } from '../db.ts';
import { buildCatalog } from './build.ts';
import { indexCatalog, type Catalog, type CatalogIndex } from './types.ts';
import { API_LOCALE, DEFAULT_LOCALE, type Locale } from '../i18n/index.ts';

/**
 * El catálogo cambia una vez cada title update, así que se guarda en memoria y
 * se sirve desde ahí. Hay uno por idioma: los nombres de armaduras, adornos y
 * habilidades vienen traducidos de la API, no de nuestros diccionarios.
 */
interface Entry {
  catalog: Catalog;
  json: string;
  index: CatalogIndex;
}

const cached = new Map<Locale, Entry>();
const loading = new Map<Locale, Promise<void>>();

async function loadFromMongo(apiLocale: string): Promise<Catalog | null> {
  const collection = await catalogCollection();
  const doc = await collection.findOne({ _id: apiLocale });
  return doc?.data ?? null;
}

/**
 * Primer arranque contra una base vacía: en vez de servir una app rota, baja el
 * catálogo solo. Es lo que hace que el deploy en Dokploy no necesite un paso
 * manual antes de poder usarse.
 */
async function bootstrap(apiLocale: string): Promise<Catalog> {
  console.log(`[catalog] falta el catálogo ${apiLocale}; descargando de wilds.mhdb.io…`);
  const catalog = await buildCatalog(apiLocale);

  const collection = await catalogCollection();
  // El _id lo aporta el filtro; el driver no lo acepta en el reemplazo.
  await collection.replaceOne(
    { _id: apiLocale },
    { version: catalog.version, locale: catalog.locale, data: catalog },
    { upsert: true },
  );
  console.log(`[catalog] ${apiLocale} listo — versión ${catalog.version}`);
  return catalog;
}

async function ensureLoaded(locale: Locale): Promise<void> {
  if (cached.has(locale)) return;

  let pending = loading.get(locale);
  if (!pending) {
    const apiLocale = API_LOCALE[locale];
    pending = (async () => {
      const catalog = (await loadFromMongo(apiLocale)) ?? (await bootstrap(apiLocale));
      cached.set(locale, {
        catalog,
        json: JSON.stringify(catalog),
        index: indexCatalog(catalog),
      });
    })().catch((err) => {
      loading.delete(locale);
      throw err;
    });
    loading.set(locale, pending);
  }
  await pending;
}

/** JSON ya serializado, para no volver a stringificar en cada petición. */
export async function getCatalogJson(
  locale: Locale = DEFAULT_LOCALE,
): Promise<{ json: string; version: string }> {
  await ensureLoaded(locale);
  const entry = cached.get(locale)!;
  return { json: entry.json, version: entry.catalog.version };
}

/** Índices por id; los usa el renderizado en servidor. */
export async function getCatalogIndex(locale: Locale = DEFAULT_LOCALE): Promise<CatalogIndex> {
  await ensureLoaded(locale);
  return cached.get(locale)!.index;
}
