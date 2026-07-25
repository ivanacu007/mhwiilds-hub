import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { savedSets } from '../../../lib/db.ts';
import { uniqueSlug } from '../../../lib/sets.ts';

/** Copia a tu cuenta un set que te compartieron. */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  let body: { slug?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }

  const collection = await savedSets();
  const original = await collection.findOne({ slug: String(body.slug ?? '') });

  // Un set privado no se puede clonar aunque alguien tenga el enlace.
  if (!original || (!original.isPublic && original.ownerId !== locals.user.id)) {
    return new Response('No encontrado', { status: 404 });
  }

  const now = new Date();
  const copy = {
    ...original,
    _id: randomUUID(),
    slug: await uniqueSlug(),
    ownerId: locals.user.id,
    ownerName: locals.user.name,
    ownerHunterName: locals.user.hunterName,
    name: `${original.name} (copia)`,
    clonedFrom: original.slug,
    // La copia nace privada: compartirla es decisión de quien la copió.
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  };

  await collection.insertOne(copy);
  return Response.json({ ok: true, slug: copy.slug, id: copy._id }, { status: 201 });
};
