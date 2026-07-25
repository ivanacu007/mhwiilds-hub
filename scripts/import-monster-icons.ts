/**
 * Coloca en `public/monstruos/` los iconos que ya descargaste, renombrándolos al
 * id que usa la app.
 *
 *   npm run iconos:importar -- ~/Descargas/iconos
 *
 * No descarga nada: solo lee archivos que ya están en tu disco. Acepta los
 * nombres tal cual vienen del wiki ("MHWA-Arkveld Icon.webp"), o simplemente el
 * nombre del monstruo ("Arkveld.webp", "rey dau.png").
 */
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { MONSTER_ICONS } from '../src/lib/catalog/monster-icons.ts';

// Sin argumento se usa assets/, que es donde se dejan los originales.
const source = process.argv[2] ?? 'assets';
const sourceDir = resolve(source.replace(/^~/, process.env.HOME ?? '~'));
const targetDir = resolve('public/monstruos');

/** Compara ignorando mayúsculas, acentos y todo lo que no sea letra o número. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * De "120px-MHWA-Rey_Dau_Icon.webp" saca "reydau".
 *
 * Los templados devuelven además una marca: la API no los trata como monstruos
 * aparte (son el mismo bicho en dificultad alta), así que comparten id y hay que
 * guardarlos con sufijo propio para no pisar el icono normal.
 */
function keyOf(filename: string): { key: string; tempered: boolean } {
  let stem = basename(filename, extname(filename))
    // Las miniaturas del wiki vienen con el ancho por delante.
    .replace(/^\d+px-/i, '')
    .replace(/^MHWA[-_]?/i, '')
    // Algunas se descargan como "…Icon.png.webp": la doble extensión sobra.
    .replace(/\.(png|jpe?g|webp)$/i, '')
    .replace(/[-_ ]?icon$/i, '');

  const tempered = /^tempered[-_ ]/i.test(stem);
  if (tempered) stem = stem.replace(/^tempered[-_ ]/i, '');

  return { key: normalize(stem), tempered };
}

const wanted = new Map<string, number>();
for (const entry of MONSTER_ICONS) {
  wanted.set(keyOf(entry.wikiFile).key, entry.id);
  wanted.set(normalize(entry.en), entry.id);
  wanted.set(normalize(entry.es), entry.id);
}

let files: string[];
try {
  files = await readdir(sourceDir);
} catch {
  console.error(`No pude leer la carpeta: ${sourceDir}`);
  console.error('Uso: npm run iconos:importar -- <carpeta>   (por defecto: assets/)');
  process.exit(1);
}

await mkdir(targetDir, { recursive: true });

const found = new Set<number>();
const foundTempered = new Set<number>();
const unmatched: string[] = [];

for (const file of files) {
  const ext = extname(file).toLowerCase();
  if (!['.webp', '.png', '.jpg', '.jpeg', '.avif'].includes(ext)) continue;

  const { key, tempered } = keyOf(file);
  const id = wanted.get(key);
  if (id === undefined) {
    unmatched.push(file);
    continue;
  }

  // Se conserva la extensión original; el componente prueba varias.
  const name = tempered ? `${id}-tempered${ext}` : `${id}${ext}`;
  await copyFile(join(sourceDir, file), join(targetDir, name));
  (tempered ? foundTempered : found).add(id);
}

console.log(`\nCopiados ${found.size} de ${MONSTER_ICONS.length} iconos a public/monstruos/`);
if (foundTempered.size) {
  console.log(`Y ${foundTempered.size} versiones templadas, como <id>-tempered.`);
}

const missing = MONSTER_ICONS.filter((m) => !found.has(m.id));
if (missing.length) {
  console.log('\nFaltan (se verá el icono generado en su lugar):');
  for (const m of missing) console.log(`  ${m.es}  →  ${m.wikiFile}`);
}

if (unmatched.length) {
  console.log('\nArchivos que no reconocí (probablemente monstruos pequeños o variantes):');
  for (const f of unmatched.slice(0, 30)) console.log(`  ${f}`);
  if (unmatched.length > 30) console.log(`  … y ${unmatched.length - 30} más`);
}
