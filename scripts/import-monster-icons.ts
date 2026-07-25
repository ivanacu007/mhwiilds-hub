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

/** De "MHWA-Rey Dau Icon.webp" saca "reydau". */
function keyOf(filename: string): string {
  const stem = basename(filename, extname(filename))
    .replace(/^MHWA[-_]?/i, '')
    .replace(/[-_ ]?icon$/i, '');
  return normalize(stem);
}

const wanted = new Map<string, number>();
for (const entry of MONSTER_ICONS) {
  wanted.set(keyOf(entry.wikiFile), entry.id);
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
const unmatched: string[] = [];

for (const file of files) {
  const ext = extname(file).toLowerCase();
  if (!['.webp', '.png', '.jpg', '.jpeg', '.avif'].includes(ext)) continue;

  const id = wanted.get(keyOf(file));
  if (id === undefined) {
    unmatched.push(file);
    continue;
  }

  // Se conserva la extensión original; el componente prueba varias.
  await copyFile(join(sourceDir, file), join(targetDir, `${id}${ext}`));
  found.add(id);
}

console.log(`\nCopiados ${found.size} de ${MONSTER_ICONS.length} iconos a public/monstruos/`);

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
