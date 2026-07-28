import { gzipSync } from 'node:zlib';
import { catalogCollection } from '../db.ts';
import { buildCatalog } from './build.ts';
import { applyMonsterAttribution } from './monster-armor.ts';
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
      // Aquí y no en `buildCatalog`: así los catálogos que ya están en Mongo
      // ganan la atribución sin volver a sincronizar. Son 194 series contra sus
      // materiales, una vez por idioma y arranque.
      applyMonsterAttribution(catalog);
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

/** Las listas que se pueden pedir sueltas. `version` y `locale` van siempre. */
export const CATALOG_PARTS = [
  'skills', 'armor', 'armorSets', 'decorations',
  'charms', 'weapons', 'items', 'monsters',
] as const;
export type CatalogPart = (typeof CATALOG_PARTS)[number];

export function isCatalogPart(value: string): value is CatalogPart {
  return (CATALOG_PARTS as readonly string[]).includes(value);
}

interface Slice {
  version: string;
  json: string;
  gzip: Buffer;
}

/**
 * Recortes del catálogo, serializados y comprimidos una sola vez.
 *
 * El catálogo entero son ~1 MB de JSON y hasta ahora viajaba completo a las
 * cinco pantallas que se pintan en cliente, aunque la de coronas solo mire
 * `monsters` —el 27 %— y la portada `items` y `monsters`. Aquí se arma el
 * recorte que pida cada una y se guarda ya gzipeado: stringificar y comprimir
 * un megabyte en cada petición saldría más caro que mandarlo entero.
 *
 * La caché se rehace sola cuando cambia la versión del catálogo.
 */
const slices = new Map<string, Slice>();

export async function getCatalogSlice(
  locale: Locale = DEFAULT_LOCALE,
  parts: CatalogPart[] | null,
): Promise<Slice> {
  await ensureLoaded(locale);
  const entry = cached.get(locale)!;
  const version = entry.catalog.version;

  // Orden fijo: pedir "items,monsters" y "monsters,items" es el mismo recorte.
  const key = `${locale}|${parts ? [...parts].sort().join(',') : 'all'}`;
  const hit = slices.get(key);
  if (hit && hit.version === version) return hit;

  let json: string;
  if (!parts) {
    json = entry.json;
  } else {
    const slice: Record<string, unknown> = {
      version,
      locale: entry.catalog.locale,
    };
    for (const part of parts) slice[part] = entry.catalog[part];
    json = JSON.stringify(slice);
  }

  const fresh: Slice = { version, json, gzip: gzipSync(json) };
  slices.set(key, fresh);
  return fresh;
}

/** Índices por id; los usa el renderizado en servidor. */
export async function getCatalogIndex(locale: Locale = DEFAULT_LOCALE): Promise<CatalogIndex> {
  await ensureLoaded(locale);
  return cached.get(locale)!.index;
}

/**
 * Tira la copia en memoria para que la siguiente petición vuelva a leer Mongo.
 *
 * Hace falta después de sincronizar: el catálogo se guarda una vez y se sirve
 * desde memoria para siempre, así que sin esto una sincronización desde el panel
 * escribiría en Mongo y la app seguiría sirviendo el catálogo viejo hasta el
 * siguiente reinicio, que es justo el fallo que parece que no pasa nada.
 *
 * Los recortes ya se rehacían solos al cambiar la versión, pero se limpian
 * igual: no tiene sentido guardar el gzip de un catálogo que ya no está.
 */
export function invalidateCatalogCache(): void {
  cached.clear();
  loading.clear();
  slices.clear();
}
