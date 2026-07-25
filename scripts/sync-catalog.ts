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

const dryRun = process.argv.includes('--dry-run');
const locale = process.env.CATALOG_LOCALE || 'es';

function mb(value: unknown): string {
  return `${(Buffer.byteLength(JSON.stringify(value)) / 1024 / 1024).toFixed(2)} MB`;
}

const catalog = await buildCatalog(locale);

console.log(`Catálogo (${locale}) descargado — versión ${catalog.version}`);
console.table({
  habilidades: catalog.skills.length,
  armaduras: catalog.armor.length,
  series: catalog.armorSets.length,
  adornos: catalog.decorations.length,
  talismanes: catalog.charms.length,
  armas: catalog.weapons.length,
  materiales: catalog.items.length,
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

if (problems.length) {
  console.error('\nEl catálogo descargado no pasa la validación:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

if (dryRun) {
  console.log('\n--dry-run: no se escribió nada en Mongo.');
  process.exit(0);
}

const { catalogCollection } = await import('../src/lib/db.ts');
const collection = await catalogCollection();
await collection.replaceOne(
  { _id: 'current' },
  { version: catalog.version, locale: catalog.locale, data: catalog },
  { upsert: true },
);

console.log('\nGuardado en Mongo como catalog/current.');
process.exit(0);
