import type { APIRoute } from 'astro';
import { getCatalogSlice, isCatalogPart, type CatalogPart } from '../../lib/catalog/store.ts';

export const prerender = false;

/**
 * El catálogo para el navegador.
 *
 * Dos cosas que antes no hacía y costaban caro en la primera visita:
 *
 * 1. Se comprime. Es un megabyte de JSON muy repetitivo y gzip lo deja en una
 *    fracción. El recorte comprimido se guarda hecho en memoria, así que esto
 *    no cuesta CPU por petición.
 * 2. Se puede pedir por partes con `?parts=`. La pantalla de coronas solo mira
 *    `monsters`; bajarse además armaduras, armas y adornos era esperar por
 *    datos que nadie iba a leer.
 *
 * Sin `parts` devuelve el catálogo entero, que es lo que necesita el armador.
 */
export const GET: APIRoute = async ({ request, locals, url }) => {
  const raw = url.searchParams.get('parts');
  // Un `parts` con basura cae al catálogo entero en vez de dar 400: es
  // preferible una respuesta grande que una pantalla vacía.
  const asked: CatalogPart[] | null = raw
    ? raw.split(',').map((p) => p.trim()).filter(isCatalogPart)
    : null;
  const parts = asked && asked.length > 0 ? asked : null;

  const { json, gzip, version } = await getCatalogSlice(locals.locale, parts);

  // El ETag lleva idioma y recorte: si no, cambiar de idioma —o pedir otras
  // partes— devolvería un 304 y el navegador seguiría con lo anterior.
  const etag = `"${locals.locale}-${parts ? [...parts].sort().join('.') : 'all'}-${version}"`;

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  const acceptsGzip = (request.headers.get('accept-encoding') ?? '').includes('gzip');

  return new Response(acceptsGzip ? new Uint8Array(gzip) : json, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(acceptsGzip ? { 'content-encoding': 'gzip' } : {}),
      etag,
      'cache-control': 'public, max-age=0, must-revalidate',
      'x-catalog-version': version,
      'x-catalog-locale': locals.locale,
      // La respuesta depende del idioma (cookie) y de si el cliente acepta gzip.
      vary: 'cookie, accept-encoding',
    },
  });
};
