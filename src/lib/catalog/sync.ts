/**
 * Descargar el catálogo de wilds.mhdb.io y guardarlo, desde el panel.
 *
 * Es lo mismo que hace `npm run sync:catalog`, pero sin entrar por SSH al
 * contenedor. Cuando salga un title update con habilidades o armaduras nuevas,
 * esto es lo que las trae.
 *
 * Corre en la petición y no en segundo plano a propósito: bajar los dos idiomas
 * tarda decenas de segundos y quien lo lanza tiene que ver si salió bien. Un
 * trabajo en segundo plano necesitaría dónde apuntar el resultado, y para una
 * acción que se usa cada varios meses no compensa.
 */
import { catalogCollection } from '../db.ts';
import { buildCatalog } from './build.ts';
import { invalidateCatalogCache } from './store.ts';
import { API_LOCALE } from '../i18n/index.ts';

export interface SyncLocaleReport {
  locale: string;
  ok: boolean;
  version?: string;
  skills?: number;
  armor?: number;
  weapons?: number;
  monsters?: number;
  error?: string;
}

export interface SyncReport {
  ok: boolean;
  locales: SyncLocaleReport[];
  elapsedMs: number;
}

/**
 * Una sincronización a la vez. Dos a la vez no romperían nada —cada una
 * reemplaza su documento— pero sí duplicarían el tráfico a una API que ya nos
 * ha devuelto 504 alguna vez, y la segunda no aportaría nada.
 */
let running: Promise<SyncReport> | null = null;

export function syncInProgress(): boolean {
  return running !== null;
}

export async function syncCatalog(): Promise<SyncReport> {
  if (running) return running;
  running = run().finally(() => { running = null; });
  return running;
}

async function run(): Promise<SyncReport> {
  const startedAt = Date.now();
  const locales = [...new Set(Object.values(API_LOCALE))];
  const reports: SyncLocaleReport[] = [];

  for (const locale of locales) {
    try {
      const catalog = await buildCatalog(locale);
      const collection = await catalogCollection();
      // El _id lo pone el filtro; el driver no lo acepta dentro del reemplazo.
      await collection.replaceOne(
        { _id: locale },
        { version: catalog.version, locale: catalog.locale, data: catalog },
        { upsert: true },
      );
      reports.push({
        locale,
        ok: true,
        version: catalog.version,
        skills: catalog.skills.length,
        armor: catalog.armor.length,
        weapons: catalog.weapons.length,
        monsters: catalog.monsters.length,
      });
    } catch (err) {
      // Un idioma que falla no cancela el otro: la API devuelve 504 de vez en
      // cuando y es mejor quedarse con uno actualizado que con ninguno.
      reports.push({
        locale,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Aunque haya fallado uno: el que sí entró tiene que empezar a servirse.
  if (reports.some((r) => r.ok)) invalidateCatalogCache();

  return {
    ok: reports.every((r) => r.ok),
    locales: reports,
    elapsedMs: Date.now() - startedAt,
  };
}

export interface StoredCatalog {
  locale: string;
  version: string | null;
}

/** Qué hay guardado ahora mismo, para poder comparar antes de tocar nada. */
export async function storedCatalogs(): Promise<StoredCatalog[]> {
  const collection = await catalogCollection();
  const docs = await collection
    .find({}, { projection: { _id: 1, version: 1 } })
    .toArray();
  const byId = new Map(docs.map((d) => [d._id, d.version ?? null]));
  return [...new Set(Object.values(API_LOCALE))].map((locale) => ({
    locale,
    version: byId.get(locale) ?? null,
  }));
}
