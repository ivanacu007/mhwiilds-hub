/**
 * Levanta la app contra un Mongo en memoria y deja lista una invitación.
 *
 *   npm run sandbox
 *
 * Sirve para probar la interfaz a mano sin tocar la base del VPS. Todo lo que
 * se cree aquí desaparece al cortar el proceso.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.PORT ?? 4390);
const BASE = `http://127.0.0.1:${PORT}`;

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri();
process.env.MONGODB_DB = 'sandbox';

const server = spawn('node', ['dist/server/entry.mjs'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    PUBLIC_SITE_URL: BASE,
    NODE_ENV: 'production',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

for (let i = 0; i < 90; i++) {
  await sleep(1000);
  try {
    const res = await fetch(`${BASE}/`, { redirect: 'manual' });
    if (res.status < 500) break;
  } catch { /* aún no escucha */ }
}

const { createInvite } = await import('../src/lib/auth/invites.ts');
const code = await createInvite('sandbox');

console.log(`\n  Listo → ${BASE}`);
console.log(`  Registro: ${BASE}/registro?invite=${code}`);
console.log(`  Código:   ${code}\n`);

const stop = async () => {
  server.kill('SIGTERM');
  await mongo.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
