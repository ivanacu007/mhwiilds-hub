import type { APIRoute } from 'astro';
import { savedSets, users } from '../../../lib/db.ts';
import { redirectWithFlash } from '../../../lib/flash.ts';
import type { FlashKey } from '../../../lib/flash.ts';

const back = (kind: 'error' | 'aviso', key: FlashKey) => redirectWithFlash('/cuenta', kind, key);

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim();
  const hunterName = String(form.get('hunterName') ?? '').trim();
  const hunterId = String(form.get('hunterId') ?? '').trim();
  const hrRaw = String(form.get('hr') ?? '').trim();

  if (name.length < 2 || name.length > 40) return back('error', 'msg.nameLength');
  if (hunterName.length > 40) return back('error', 'msg.hunterNameLong');
  if (hunterId.length > 30) return back('error', 'msg.hunterIdLong');

  let hr: number | null = null;
  if (hrRaw) {
    const parsed = Number(hrRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) return back('error', 'msg.badHr');
    hr = parsed;
  }

  const collection = await users();
  await collection.updateOne(
    { _id: locals.user.id },
    { $set: { name, hunterName: hunterName || null, hunterId: hunterId || null, hr } },
  );

  // Los sets guardan una copia del nombre del autor para que el enlace público
  // no dependa de leer al usuario. Al renombrarse hay que refrescar esa copia,
  // o los sets viejos seguirían firmados con el nombre anterior.
  const sets = await savedSets();
  await sets.updateMany(
    { ownerId: locals.user.id },
    { $set: { ownerName: name, ownerHunterName: hunterName || null } },
  );

  return back('aviso', 'msg.saved');
};
