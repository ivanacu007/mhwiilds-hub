import type { APIRoute } from 'astro';
import { savedSets } from '../../../lib/db.ts';

export const DELETE: APIRoute = async ({ locals, params }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  const collection = await savedSets();
  // El filtro incluye ownerId: nadie puede borrar el set de otro aunque
  // adivine el id.
  const result = await collection.deleteOne({ _id: params.id!, ownerId: locals.user.id });

  if (result.deletedCount === 0) return new Response('No encontrado', { status: 404 });
  return Response.json({ ok: true });
};

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === 'string') updates.name = body.name.trim().slice(0, 60) || 'Set sin nombre';
  if (typeof body.notes === 'string') updates.notes = body.notes.trim().slice(0, 500);
  if (typeof body.isPublic === 'boolean') updates.isPublic = body.isPublic;

  const collection = await savedSets();
  const result = await collection.updateOne(
    { _id: params.id!, ownerId: locals.user.id },
    { $set: updates },
  );

  if (result.matchedCount === 0) return new Response('No encontrado', { status: 404 });
  return Response.json({ ok: true });
};
