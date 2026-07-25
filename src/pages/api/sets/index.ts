import type { APIRoute } from 'astro';
import { savedSets } from '../../../lib/db.ts';
import { buildSetDoc, uniqueSlug, type SetInput } from '../../../lib/sets.ts';

const MAX_SETS_PER_USER = 300;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  const collection = await savedSets();
  const list = await collection
    .find({ ownerId: locals.user.id })
    .sort({ updatedAt: -1 })
    .limit(MAX_SETS_PER_USER)
    .toArray();

  return Response.json(list);
};

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  let body: SetInput;
  try {
    body = await request.json();
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }

  const collection = await savedSets();
  const count = await collection.countDocuments({ ownerId: locals.user.id });
  if (count >= MAX_SETS_PER_USER) {
    return Response.json(
      { error: `Llegaste al límite de ${MAX_SETS_PER_USER} sets guardados.` },
      { status: 409 },
    );
  }

  const doc = buildSetDoc(
    body,
    { id: locals.user.id, name: locals.user.name, hunterName: locals.user.hunterName },
    await uniqueSlug(),
  );

  // Un set sin ninguna pieza no sirve de nada y ensucia la lista.
  const hasAnyPiece = doc.head || doc.chest || doc.arms || doc.waist || doc.legs;
  if (!hasAnyPiece) {
    return Response.json({ error: 'El set no tiene ninguna pieza.' }, { status: 400 });
  }

  await collection.insertOne(doc);
  return Response.json({ ok: true, slug: doc.slug, id: doc._id }, { status: 201 });
};
