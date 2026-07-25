import type { APIRoute } from 'astro';
import { savedSets, users } from '../../../lib/db.ts';

function back(message: string, key: 'error' | 'aviso'): Response {
  return new Response(null, {
    status: 303,
    headers: { location: `/cuenta?${key}=${encodeURIComponent(message)}` },
  });
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim();
  const hunterName = String(form.get('hunterName') ?? '').trim();
  const hunterId = String(form.get('hunterId') ?? '').trim();
  const hrRaw = String(form.get('hr') ?? '').trim();

  if (name.length < 2 || name.length > 40) {
    return back('El nombre debe tener entre 2 y 40 caracteres.', 'error');
  }
  if (hunterName.length > 40) {
    return back('El Hunter Name no puede pasar de 40 caracteres.', 'error');
  }
  if (hunterId.length > 30) {
    return back('El Hunter ID no puede pasar de 30 caracteres.', 'error');
  }

  let hr: number | null = null;
  if (hrRaw) {
    const parsed = Number(hrRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
      return back('El HR debe ser un número entre 1 y 999.', 'error');
    }
    hr = parsed;
  }

  const collection = await users();
  await collection.updateOne(
    { _id: locals.user.id },
    {
      $set: {
        name,
        hunterName: hunterName || null,
        hunterId: hunterId || null,
        hr,
      },
    },
  );

  // Los sets guardan una copia del nombre del autor para que el enlace público
  // no dependa de leer al usuario. Al renombrarse hay que refrescar esa copia,
  // o los sets viejos seguirían firmados con el nombre anterior.
  const sets = await savedSets();
  await sets.updateMany(
    { ownerId: locals.user.id },
    { $set: { ownerName: name, ownerHunterName: hunterName || null } },
  );

  return back('Guardado.', 'aviso');
};
