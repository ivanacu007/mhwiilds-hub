/**
 * Sincroniza el catálogo del juego a Mongo.
 *
 *   npm run sync:catalog              # descarga y guarda
 *   npm run sync:catalog -- --dry-run # solo descarga y reporta, sin tocar Mongo
 *
 * Correrlo de nuevo cuando salga un title update: es idempotente, reemplaza el
 * documento `current` y los adornos/armaduras nuevos aparecen solos en la app.
 */
import { buildCatalog } from '../src/lib/catalog/build.ts';
import { API_LOCALE } from '../src/lib/i18n/index.ts';

const dryRun = process.argv.includes('--dry-run');
// Un catálogo por idioma de la interfaz. CATALOG_LOCALE fuerza uno solo.
const forced = process.env.CATALOG_LOCALE;
const locales = forced ? [forced] : Object.values(API_LOCALE);

function mb(value: unknown): string {
  return `${(Buffer.byteLength(JSON.stringify(value)) / 1024 / 1024).toFixed(2)} MB`;
}

let failed = false;

for (const locale of locales) {
  const catalog = await buildCatalog(locale);

  console.log(`\nCatálogo (${locale}) descargado — versión ${catalog.version}`);
  console.table({
    habilidades: catalog.skills.length,
    armaduras: catalog.armor.length,
    series: catalog.armorSets.length,
    adornos: catalog.decorations.length,
    talismanes: catalog.charms.length,
    armas: catalog.weapons.length,
    materiales: catalog.items.length,
    monstruos: catalog.monsters.length,
  });
  console.log(`Tamaño serializado: ${mb(catalog)}`);

  // Chequeos baratos que atrapan una API que cambió de forma sin avisar.
  const problems: string[] = [];
  if (catalog.armor.length < 100) problems.push('muy pocas armaduras');
  if (catalog.decorations.length < 100) problems.push('muy pocos adornos');
  if (catalog.skills.length < 50) problems.push('muy pocas habilidades');
  if (!catalog.armor.some((a) => a.skills.length > 0)) problems.push('ninguna armadura trae habilidades');
  if (!catalog.armor.some((a) => a.slots.length > 0)) problems.push('ninguna armadura trae slots');
  if (!catalog.armorSets.some((s) => s.setBonus.length > 0)) problems.push('ningún set trae bonus de serie');
  if (!catalog.charms.some((c) => c.ranks.length > 0)) problems.push('ningún talismán trae rangos');
  if (catalog.monsters.length < 20) problems.push('muy pocos monstruos grandes');
  if (catalog.monsters.some((m) => !m.name?.trim())) problems.push('hay monstruos sin nombre traducido');

  if (problems.length) {
    console.error(`\nEl catálogo ${locale} no pasa la validación:`);
    for (const p of problems) console.error(`  - ${p}`);
    failed = true;
    continue;
  }

  if (dryRun) continue;

  const { catalogCollection } = await import('../src/lib/db.ts');
  const collection = await catalogCollection();
  await collection.replaceOne(
    { _id: locale },
    { version: catalog.version, locale: catalog.locale, data: catalog },
    { upsert: true },
  );
  console.log(`Guardado en Mongo como catalog/${locale}.`);
}

if (dryRun) console.log('\n--dry-run: no se escribió nada en Mongo.');
process.exit(failed ? 1 : 0);
