/**
 * Genera códigos de invitación para repartir.
 *
 *   npm run invite                    # uno, sin nota
 *   npm run invite -- 5               # cinco
 *   npm run invite -- 3 "grupo de caza"
 *
 * Se corre desde la terminal de Dokploy contra el contenedor en marcha.
 */
import { createInvite } from '../src/lib/auth/invites.ts';
import { invites } from '../src/lib/db.ts';

const args = process.argv.slice(2);
const count = Number.parseInt(args[0] ?? '1', 10);
const note = args[1] ?? null;

if (!Number.isInteger(count) || count < 1 || count > 100) {
  console.error('Uso: npm run invite -- [cantidad 1-100] ["nota"]');
  process.exit(1);
}

for (let i = 0; i < count; i++) {
  console.log(await createInvite(note));
}

const collection = await invites();
const [total, used] = await Promise.all([
  collection.countDocuments({}),
  collection.countDocuments({ usedBy: { $ne: null } }),
]);
console.log(`\n${used} de ${total} invitaciones usadas.`);
process.exit(0);
