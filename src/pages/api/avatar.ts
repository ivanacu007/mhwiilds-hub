import type { APIRoute } from 'astro';
import { users } from '../../lib/db.ts';
import { getCatalogIndex } from '../../lib/catalog/store.ts';
import { isMonsterVariant } from '../../lib/catalog/monster-icons.ts';

/** Elegir un monstruo (normal o templado) como foto de perfil. */
export const PUT: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }

  const collection = await users();

  // null quita el avatar y vuelve a la inicial o a la foto de Google.
  if (body?.monsterId == null) {
    await collection.updateOne(
      { _id: locals.user.id },
      { $set: { avatarMonsterId: null, avatarVariant: 'normal' } },
    );
    return Response.json({ ok: true, monsterId: null, variant: 'normal' });
  }

  const monsterId = Number(body.monsterId);
  if (!Number.isInteger(monsterId) || monsterId <= 0) {
    return Response.json({ error: 'Monstruo inválido.' }, { status: 400 });
  }

  // Solo monstruos que existen: si no, el perfil quedaría con un icono roto.
  const index = await getCatalogIndex();
  if (!index.monsterById.has(monsterId)) {
    return Response.json({ error: 'Ese monstruo no existe.' }, { status: 400 });
  }

  const variant = isMonsterVariant(body.variant) ? body.variant : 'normal';
  await collection.updateOne(
    { _id: locals.user.id },
    { $set: { avatarMonsterId: monsterId, avatarVariant: variant } },
  );

  return Response.json({ ok: true, monsterId, variant });
};
