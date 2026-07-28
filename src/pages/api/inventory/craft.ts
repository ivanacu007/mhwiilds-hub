import type { APIRoute } from 'astro';
import { inventories } from '../../../lib/db.ts';
import { getCatalogIndex } from '../../../lib/catalog/store.ts';
import type { Material } from '../../../lib/catalog/types.ts';

/**
 * «Ya la forjé»: marca una pieza o un arma como poseída y descuenta lo que
 * costó.
 *
 * Endpoint aparte y no el `PUT` del inventario porque ese reemplaza el
 * documento entero: mandar las 700 armaduras y los 773 materiales para apuntar
 * una pieza es tirar ancho de banda, y dos pestañas abiertas se pisarían.
 *
 * La receta se lee del catálogo en el servidor, no del cuerpo de la petición:
 * si viniera de fuera, cualquiera podría decir que forjar algo no cuesta nada.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }

  const id = Number(body?.id);
  const kind = body?.kind === 'weapon' ? 'weapon' : 'armor';
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Id inválido.' }, { status: 400 });
  }

  const index = await getCatalogIndex(locals.locale);

  let materials: Material[] = [];
  if (kind === 'armor') {
    const piece = index.armorById.get(id);
    if (!piece) return Response.json({ error: 'Esa pieza no existe.' }, { status: 400 });
    materials = piece.materials;
  } else {
    const weapon = index.weaponById.get(id);
    if (!weapon) return Response.json({ error: 'Esa arma no existe.' }, { status: 400 });
    // Si sale de otra, lo que se paga es la mejora, no forjarla de cero.
    const crafting = weapon.crafting;
    materials = crafting?.previousId != null && crafting.upgradeMaterials.length > 0
      ? crafting.upgradeMaterials
      : crafting?.craftMaterials ?? [];
  }

  const collection = await inventories();
  const doc = await collection.findOne({ _id: locals.user.id });

  const owned = new Set(doc?.[kind === 'armor' ? 'armor' : 'weapons'] ?? []);
  owned.add(id);

  /**
   * Se descuenta lo gastado. Al fin y al cabo se marca *después* de forjar en el
   * juego, así que esos materiales ya no están en la caja; dejarlos haría que el
   * siguiente paso del plan contara con material que no existe.
   *
   * Nunca por debajo de cero: el inventario de aquí puede ir desfasado, y un
   * negativo sería más confuso que un cero.
   */
  const stock = { ...(doc?.materials ?? {}) };
  const spent: { itemId: number; quantity: number }[] = [];
  for (const material of materials) {
    const key = String(material.itemId);
    const have = stock[key] ?? 0;
    const take = Math.min(have, material.quantity);
    if (take > 0) spent.push({ itemId: material.itemId, quantity: take });
    if (have - take > 0) stock[key] = have - take;
    else delete stock[key];
  }

  await collection.updateOne(
    { _id: locals.user.id },
    {
      $set: {
        [kind === 'armor' ? 'armor' : 'weapons']: [...owned],
        materials: stock,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        decorations: doc?.decorations ?? {},
        charms: doc?.charms ?? {},
        [kind === 'armor' ? 'weapons' : 'armor']: doc?.[kind === 'armor' ? 'weapons' : 'armor'] ?? [],
      },
    },
    { upsert: true },
  );

  return Response.json({ ok: true, spent });
};
