import type { APIRoute } from 'astro';
import { inventories } from '../../../lib/db.ts';
import type { InventoryDoc } from '../../../lib/models.ts';

function emptyInventory(userId: string): InventoryDoc {
  return {
    _id: userId,
    decorations: {},
    charms: {},
    armor: [],
    weapons: [],
    materials: {},
    updatedAt: new Date(),
  };
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  const collection = await inventories();
  const doc = (await collection.findOne({ _id: locals.user.id })) ?? emptyInventory(locals.user.id);

  return Response.json(doc);
};

/** Mapa de id -> cantidad, saneado: sin negativos, sin ceros, sin basura. */
function cleanCountMap(raw: unknown, maxValue: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    const count = Number(value);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!Number.isFinite(count) || count <= 0) continue;
    // Guardar los ceros solo engordaría el documento sin aportar nada.
    out[String(id)] = Math.min(Math.floor(count), maxValue);
  }
  return out;
}

function cleanIdList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const value of raw) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) seen.add(id);
  }
  return [...seen];
}

export const PUT: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }

  const doc: InventoryDoc = {
    _id: locals.user.id,
    decorations: cleanCountMap(body.decorations, 99),
    // El "nivel" de un talismán es su rango forjado; en Wilds no pasan de 5.
    charms: cleanCountMap(body.charms, 5),
    armor: cleanIdList(body.armor),
    weapons: cleanIdList(body.weapons),
    materials: cleanCountMap(body.materials, 9999),
    updatedAt: new Date(),
  };

  const collection = await inventories();
  await collection.replaceOne({ _id: locals.user.id }, doc, { upsert: true });

  return Response.json({ ok: true, updatedAt: doc.updatedAt });
};
