import type { APIRoute } from 'astro';
import { progress } from '../../../lib/db.ts';
import { cleanProgress } from '../../../lib/crowns.ts';
import type { MonsterProgress } from '../../../lib/models.ts';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  const collection = await progress();
  const doc = await collection.findOne({ _id: locals.user.id });

  return Response.json({ monsters: doc?.monsters ?? {} });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }

  const monsters: Record<string, MonsterProgress> = {};
  for (const [key, value] of Object.entries(body?.monsters ?? {})) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) continue;
    const cleaned = cleanProgress(value);
    if (cleaned) monsters[String(id)] = cleaned;
  }

  const collection = await progress();
  await collection.replaceOne(
    { _id: locals.user.id },
    { monsters, updatedAt: new Date() },
    { upsert: true },
  );

  return Response.json({ ok: true });
};
