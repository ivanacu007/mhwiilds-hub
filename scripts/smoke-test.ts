/**
 * Prueba de humo de extremo a extremo contra un Mongo en memoria.
 *
 *   npm run test:smoke
 *
 * Levanta el servidor ya compilado y recorre el flujo real: invitación →
 * registro → inventario → guardar set → enlace público → clonar. No sustituye a
 * probar con el Mongo del VPS, pero atrapa todo lo que se rompe sin base.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

let failures = 0;
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

const mongo = await MongoMemoryServer.create();
const uri = mongo.getUri();
console.log(`Mongo en memoria: ${uri}\n`);

// Este mismo proceso importa src/lib/db.ts más abajo para crear invitaciones,
// y ese módulo exige la variable al cargarse.
process.env.MONGODB_URI = uri;
process.env.MONGODB_DB = 'smoke';

const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;

// Astro rechaza con 403 las peticiones que mutan si el header Origin no cuadra
// con el sitio (protección CSRF, activa por defecto). El navegador lo manda
// solo en cada form y cada fetch; desde Node hay que ponerlo a mano.
const rawFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init: any = {}) => {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    init.headers = { ...(init.headers ?? {}), origin: BASE };
  }
  return rawFetch(input, init);
}) as typeof fetch;

const env = {
  ...process.env,
  MONGODB_URI: uri,
  MONGODB_DB: 'smoke',
  PORT: String(PORT),
  HOST: '127.0.0.1',
  PUBLIC_SITE_URL: BASE,
  CATALOG_LOCALE: 'es',
  NODE_ENV: 'production',
};

let server: ChildProcess | null = null;

async function shutdown(code: number): Promise<never> {
  server?.kill('SIGTERM');
  await mongo.stop();
  process.exit(code);
}

try {
  server = spawn('node', ['dist/server/entry.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout?.on('data', (b) => process.stdout.write(`  [srv] ${b}`));
  server.stderr?.on('data', (b) => process.stderr.write(`  [srv!] ${b}`));

  // El primer arranque descarga el catálogo entero de la API; hay que esperarlo.
  let up = false;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const res = await fetch(`${BASE}/`, { redirect: 'manual' });
      if (res.status < 500) { up = true; break; }
    } catch { /* todavía no escucha */ }
  }
  if (!up) throw new Error('El servidor no respondió a tiempo.');

  console.log('\n--- Catálogo ---');
  const catalogRes = await fetch(`${BASE}/api/catalog.json`);
  const catalog = await catalogRes.json();
  check('sirve el catálogo', catalogRes.ok);
  check('trae armaduras', catalog.armor?.length > 100, `${catalog.armor?.length}`);
  check('trae adornos', catalog.decorations?.length > 100, `${catalog.decorations?.length}`);
  const etag = catalogRes.headers.get('etag');
  const notModified = await fetch(`${BASE}/api/catalog.json`, { headers: { 'if-none-match': etag! } });
  check('responde 304 con ETag', notModified.status === 304, `dio ${notModified.status}`);

  console.log('\n--- Registro sin invitación ---');
  const noInvite = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      email: 'nadie@example.com', name: 'Nadie', password: 'contrasenalarga1', invite: 'NO-EXISTE',
    }),
  });
  const noInviteLocation = noInvite.headers.get('location') ?? '';
  check(
    'rechaza código inválido',
    noInviteLocation.includes('error='),
    `status ${noInvite.status}, location "${noInviteLocation}"`,
  );

  console.log('\n--- Invitación + registro ---');
  const { createInvite } = await import('../src/lib/auth/invites.ts');
  const code = await createInvite('smoke test');
  check('genera código', /^[A-Z0-9-]+$/.test(code), code);

  const register = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      email: 'cazador@example.com', name: 'Cazador', password: 'contrasenalarga1', invite: code,
    }),
  });
  const cookie = (register.headers.get('set-cookie') ?? '').split(';')[0];
  check('registra con invitación', register.headers.get('location') === '/inventario', register.headers.get('location') ?? '');
  check('entrega cookie de sesión', cookie.startsWith('mhw_session='));

  const reuse = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      email: 'otro@example.com', name: 'Otro', password: 'contrasenalarga1', invite: code,
    }),
  });
  check('el código no se puede reusar', (reuse.headers.get('location') ?? '').includes('error='));

  const auth = { cookie };

  console.log('\n--- Sesión ---');
  const anon = await fetch(`${BASE}/inventario`, { redirect: 'manual' });
  check('sin sesión redirige a /entrar', (anon.headers.get('location') ?? '').startsWith('/entrar'));
  // redirect manual: siguiendo el redirect, un fallo de sesión daría 200 en
  // /entrar y la prueba pasaría en falso.
  const withSession = await fetch(`${BASE}/inventario`, { headers: auth, redirect: 'manual' });
  check('con sesión sirve el inventario', withSession.status === 200, `${withSession.status}`);

  console.log('\n--- Inventario ---');
  const deco = catalog.decorations.find((d: any) => d.kind === 'armor');
  const put = await fetch(`${BASE}/api/inventory`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      decorations: { [deco.id]: 3, '-5': 2, 'basura': 9 },
      charms: {}, armor: [catalog.armor[0].id], weapons: [], materials: {},
    }),
  });
  check('guarda inventario', put.ok);
  const got = await (await fetch(`${BASE}/api/inventory`, { headers: auth })).json();
  check('devuelve la cantidad guardada', got.decorations[String(deco.id)] === 3);
  check('descarta ids inválidos', !('-5' in got.decorations) && !('basura' in got.decorations));

  console.log('\n--- Sets y enlace público ---');
  const created = await fetch(`${BASE}/api/sets`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Set de prueba',
      head: { armorId: catalog.armor.find((a: any) => a.kind === 'head').id, decorations: [] },
      chest: { armorId: catalog.armor.find((a: any) => a.kind === 'chest').id, decorations: [] },
      arms: null, waist: null, legs: null,
      weaponId: null, weaponDecorations: [], charmId: null, charmLevel: null, isPublic: true,
    }),
  });
  const setData = await created.json();
  check('crea el set', created.status === 201 && Boolean(setData.slug), JSON.stringify(setData));

  const empty = await fetch(`${BASE}/api/sets`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Vacío', head: null, chest: null, arms: null, waist: null, legs: null }),
  });
  check('rechaza set sin piezas', empty.status === 400);

  const publicPage = await fetch(`${BASE}/set/${setData.slug}`);
  const html = await publicPage.text();
  check('el enlace público abre sin sesión', publicPage.ok, `${publicPage.status}`);
  check('trae og:title para el preview', html.includes('property="og:title"'));
  check('muestra el nombre del set', html.includes('Set de prueba'));

  const missing = await fetch(`${BASE}/set/noexiste123`);
  check('slug inexistente da 404', missing.status === 404, `${missing.status}`);

  console.log('\n--- Aislamiento entre usuarios ---');
  const code2 = await createInvite(null);
  const otherReg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      email: 'rival@example.com', name: 'Rival', password: 'contrasenalarga1', invite: code2,
    }),
  });
  const otherCookie = (otherReg.headers.get('set-cookie') ?? '').split(';')[0];
  check(
    'registra al segundo usuario',
    otherCookie.startsWith('mhw_session='),
    `location "${otherReg.headers.get('location')}" cookie "${otherCookie}"`,
  );

  const stealDelete = await fetch(`${BASE}/api/sets/${setData.id}`, {
    method: 'DELETE',
    headers: { cookie: otherCookie },
  });
  check('otro usuario no puede borrar tu set', stealDelete.status === 404, `${stealDelete.status}`);

  const otherSets = await (await fetch(`${BASE}/api/sets`, { headers: { cookie: otherCookie } })).json();
  check('no ve los sets ajenos', Array.isArray(otherSets) && otherSets.length === 0, JSON.stringify(otherSets));

  const cloned = await fetch(`${BASE}/api/sets/clone`, {
    method: 'POST',
    headers: { cookie: otherCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ slug: setData.slug }),
  });
  const clonedData = await cloned.json();
  check('sí puede clonar el set público', cloned.status === 201 && clonedData.slug !== setData.slug);

  console.log('\n--- Login ---');
  const badLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({ email: 'cazador@example.com', password: 'incorrecta!!' }),
  });
  check('rechaza contraseña incorrecta', (badLogin.headers.get('location') ?? '').includes('error='));

  const goodLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({ email: 'cazador@example.com', password: 'contrasenalarga1' }),
  });
  check('acepta la correcta', (goodLogin.headers.get('set-cookie') ?? '').includes('mhw_session='));

  console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} FALLOS`}`);
  await shutdown(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('\nLa prueba reventó:', err);
  await shutdown(1);
}
