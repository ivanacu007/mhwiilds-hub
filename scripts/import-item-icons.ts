/**
 * Coloca en `public/iconos/materiales/` los iconos de material que descargaste.
 *
 *   npm run iconos:materiales                    # usa assets/materiales
 *   npm run iconos:materiales -- ~/Descargas/mat
 *
 * Espera los archivos "Base" del wiki, que son monocromos: la app los usa como
 * máscara y les pone el color que da la API, así basta uno por tipo.
 */
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { iconSlug, requiredIconSlugs } from '../src/lib/catalog/item-icons.ts';

const source = process.argv[2] ?? 'assets/materiales';
const sourceDir = resolve(source.replace(/^~/, process.env.HOME ?? '~'));
const targetDir = resolve('public/iconos/materiales');

/** De "MHWilds-Armor Sphere Icon Base.webp" saca "armor-sphere". */
function keyOf(filename: string): string {
  const stem = basename(filename, extname(filename))
    .replace(/^\d+px-/i, '')
    .replace(/^MHWilds[-_]?/i, '')
    .replace(/\.(png|jpe?g|webp)$/i, '')
    .replace(/[-_ ]?icon([-_ ]?base)?$/i, '');
  return iconSlug(stem);
}

const wanted = new Map(requiredIconSlugs().map((r) => [r.slug, r.wikiKind]));

let files: string[];
try {
  files = await readdir(sourceDir);
} catch {
  console.error(`No pude leer la carpeta: ${sourceDir}`);
  process.exit(1);
}

await mkdir(targetDir, { recursive: true });

const found = new Set<string>();
const unmatched: string[] = [];

for (const file of files) {
  const ext = extname(file).toLowerCase();
  if (!['.webp', '.png', '.jpg', '.jpeg', '.avif'].includes(ext)) continue;

  const slug = keyOf(file);
  if (!wanted.has(slug)) {
    unmatched.push(file);
    continue;
  }
  await copyFile(join(sourceDir, file), join(targetDir, `${slug}${ext}`));
  found.add(slug);
}

console.log(`\nCopiados ${found.size} de ${wanted.size} iconos de material.`);

const missing = [...wanted].filter(([slug]) => !found.has(slug));
if (missing.length) {
  console.log('\nFaltan (se verá un punto de color en su lugar):');
  for (const [slug, wikiKind] of missing) {
    console.log(`  ${slug.padEnd(22)} MHWilds-${wikiKind} Icon Base.webp`);
  }
}

if (unmatched.length) {
  console.log(`\nNo reconocí ${unmatched.length} archivos:`);
  for (const f of unmatched.slice(0, 20)) console.log(`  ${f}`);
}
