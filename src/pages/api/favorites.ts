import type { APIRoute } from 'astro';
import { users } from '../../lib/db.ts';

const MAX_FAVORITES = 12;

export const PUT: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }

  const seen = new Set<number>();
  for (const value of Array.isArray(body?.monsters) ? body.monsters : []) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) seen.add(id);
    if (seen.size >= MAX_FAVORITES) break;
  }

  const collection = await users();
  await collection.updateOne({ _id: locals.user.id }, { $set: { favoriteMonsters: [...seen] } });

  return Response.json({ ok: true, monsters: [...seen] });
};
