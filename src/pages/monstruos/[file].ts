import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { APIRoute } from 'astro';

/**
 * Sirve los iconos de monstruo desde una carpeta fuera del build.
 *
 * Existe porque `public/monstruos/` está en .gitignore: si el VPS construye
 * desde el repo, esos archivos no viajan en la imagen. Apuntando
 * MONSTER_ICONS_DIR a un volumen de Dokploy se suben una vez y sobreviven a
 * cada deploy, sin meter los binarios en git.
 *
 * Sin la variable, esta ruta no se usa: Astro sirve `public/` directamente.
 */
const iconsDir = process.env.MONSTER_ICONS_DIR;

const MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
};

export const GET: APIRoute = async ({ params }) => {
  if (!iconsDir) return new Response('No configurado', { status: 404 });

  const file = params.file ?? '';
  // Solo "<número>.<ext>": corta cualquier intento de salir de la carpeta.
  if (!/^\d+\.(webp|png|jpe?g|avif)$/i.test(file)) {
    return new Response('No encontrado', { status: 404 });
  }

  const base = resolve(iconsDir);
  const path = join(base, file);
  if (!path.startsWith(base + '/')) return new Response('No encontrado', { status: 404 });

  let info;
  try {
    info = await stat(path);
  } catch {
    return new Response('No encontrado', { status: 404 });
  }
  if (!info.isFile()) return new Response('No encontrado', { status: 404 });

  return new Response(createReadStream(path) as any, {
    headers: {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(info.size),
      // Los iconos no cambian; que el navegador no los vuelva a pedir.
      'cache-control': 'public, max-age=604800, immutable',
    },
  });
};
