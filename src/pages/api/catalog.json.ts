import type { APIRoute } from 'astro';
import { getCatalogJson } from '../../lib/catalog/store.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const { json, version } = await getCatalogJson();
  const etag = `"${version}"`;

  // El cliente lo guarda en IndexedDB; el ETag hace que en visitas siguientes
  // la respuesta sea un 304 vacío en vez de 670 KB.
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  return new Response(json, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      etag,
      'cache-control': 'public, max-age=0, must-revalidate',
      'x-catalog-version': version,
    },
  });
};
