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
      email: 'cazador@example.com', name: 'Cazador', hunterName: 'Ivanhunter',
      password: 'contrasenalarga1', invite: code,
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

  // Se necesita el id para visitar el perfil público más adelante.
  const { users } = await import('../src/lib/db.ts');
  const userDoc = await (await users()).findOne({ email: 'cazador@example.com' });
  const userId = userDoc!._id;

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

  console.log('\n--- Nombre de cazador ---');
  check('el set se firma con el nombre de cazador', html.includes('Ivanhunter'));

  const cuenta = await (await fetch(`${BASE}/cuenta`, { headers: auth })).text();
  check('la página de cuenta lo muestra', cuenta.includes('Ivanhunter'));

  const rename = await fetch(`${BASE}/api/auth/profile`, {
    method: 'POST',
    headers: auth,
    redirect: 'manual',
    body: new URLSearchParams({ name: 'Cazador', hunterName: 'NuevoNombre' }),
  });
  check('permite cambiarlo', (rename.headers.get('location') ?? '').includes('aviso='));

  // Los sets guardan copia del nombre; al renombrarse deben actualizarse.
  const afterRename = await (await fetch(`${BASE}/set/${setData.slug}`)).text();
  check('los sets ya guardados reflejan el nombre nuevo', afterRename.includes('NuevoNombre'));
  check('y ya no muestran el viejo', !afterRename.includes('Ivanhunter'));

  const tooLong = await fetch(`${BASE}/api/auth/profile`, {
    method: 'POST',
    headers: auth,
    redirect: 'manual',
    body: new URLSearchParams({ name: 'Cazador', hunterName: 'x'.repeat(41) }),
  });
  check('rechaza un nombre demasiado largo', (tooLong.headers.get('location') ?? '').includes('error='));

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

  console.log('\n--- Coronas ---');
  const monster = catalog.monsters.find((m: any) => m.size);
  check('el catálogo trae monstruos con umbrales', Boolean(monster), `${catalog.monsters?.length}`);

  // Un ejemplar por debajo del umbral mini y otro por encima del de oro:
  // deben salir las tres coronas sin marcar nada a mano.
  const putProgress = await fetch(`${BASE}/api/progress`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      monsters: {
        [monster.id]: {
          smallest: monster.size.mini - 1,
          largest: monster.size.gold + 1,
          hunted: 12, captured: 3,
        },
        // Entrada vacía: no debe guardarse.
        999999: { smallest: null, largest: null, hunted: 0, captured: 0 },
      },
    }),
  });
  check('guarda el progreso', putProgress.ok);

  const savedProgress = (await (await fetch(`${BASE}/api/progress`, { headers: auth })).json()).monsters;
  check('descarta las entradas vacías', !('999999' in savedProgress));
  check('conserva cazados y capturados', savedProgress[String(monster.id)]?.hunted === 12);

  const { deriveCrowns } = await import('../src/lib/crowns.ts');
  const derived = deriveCrowns(monster, savedProgress[String(monster.id)]);
  check('deduce la corona pequeña por tamaño', derived.mini.earned && derived.mini.fromSize);
  check('deduce la de oro por tamaño', derived.gold.earned && derived.gold.fromSize);

  // Al revés: un ejemplar dentro del rango normal no debe dar ninguna corona.
  const none = deriveCrowns(monster, {
    smallest: monster.size.base, largest: monster.size.base,
    hunted: 1, captured: 0, manualMini: false, manualSilver: false, manualGold: false,
  });
  check('no regala coronas con tamaño normal', !none.mini.earned && !none.gold.earned);
  check('dice cuánto falta para la siguiente', none.nextGoal != null && none.nextGoal.needed > 0);

  // Si llegan invertidos, se ordenan en vez de perder el dato.
  await fetch(`${BASE}/api/progress`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ monsters: { [monster.id]: { smallest: 900, largest: 100 } } }),
  });
  const swapped = (await (await fetch(`${BASE}/api/progress`, { headers: auth })).json())
    .monsters[String(monster.id)];
  check('ordena un rango invertido', swapped.smallest === 100 && swapped.largest === 900);

  console.log('\n--- Perfil, gremio y favoritos ---');
  const perfil = await fetch(`${BASE}/api/auth/profile`, {
    method: 'POST', headers: auth, redirect: 'manual',
    body: new URLSearchParams({ name: 'Cazador', hunterName: 'Ivanhunter', hunterId: 'ABC-123', hr: '145' }),
  });
  check('guarda Hunter ID y HR', (perfil.headers.get('location') ?? '').includes('aviso='));

  const badHr = await fetch(`${BASE}/api/auth/profile`, {
    method: 'POST', headers: auth, redirect: 'manual',
    body: new URLSearchParams({ name: 'Cazador', hr: '0' }),
  });
  check('rechaza un HR inválido', (badHr.headers.get('location') ?? '').includes('error='));

  const favs = await fetch(`${BASE}/api/favorites`, {
    method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ monsters: [monster.id, monster.id, -3, 'x'] }),
  });
  const favData = await favs.json();
  check('guarda favoritos sin duplicados ni basura', favData.monsters.length === 1);

  const gremio = await fetch(`${BASE}/api/guild`, {
    method: 'POST', headers: auth, redirect: 'manual',
    body: new URLSearchParams({ name: 'Los Cazadores del Sur', motto: 'Sin miedo al Rey Dau' }),
  });
  check('nombra el gremio', (gremio.headers.get('location') ?? '').includes('aviso='));

  const gremioHtml = await (await fetch(`${BASE}/gremio`, { headers: auth })).text();
  check('el gremio muestra su nombre', gremioHtml.includes('Los Cazadores del Sur'));

  const lista = await (await fetch(`${BASE}/cazadores`, { headers: auth })).text();
  check('la lista muestra al cazador', lista.includes('Ivanhunter'));

  const perfilHtml = await (await fetch(`${BASE}/cazador/${userId}`, { headers: auth })).text();
  check('el perfil muestra HR y Hunter ID', perfilHtml.includes('145') && perfilHtml.includes('ABC-123'));
  check('el perfil muestra el monstruo favorito', perfilHtml.includes(monster.name));

  const anonProfile = await fetch(`${BASE}/cazadores`, { redirect: 'manual' });
  check('los perfiles exigen sesión', (anonProfile.headers.get('location') ?? '').startsWith('/entrar'));

  const noSuchHunter = await fetch(`${BASE}/cazador/no-existe`, { headers: auth });
  check('cazador inexistente da 404', noSuchHunter.status === 404, `${noSuchHunter.status}`);

  console.log('\n--- Avatar de monstruo ---');
  const setAvatar = await fetch(`${BASE}/api/avatar`, {
    method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ monsterId: monster.id, variant: 'arch-tempered' }),
  });
  const avatarData = await setAvatar.json();
  check('acepta un monstruo como avatar', setAvatar.ok && avatarData.variant === 'arch-tempered');

  const badMonster = await fetch(`${BASE}/api/avatar`, {
    method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ monsterId: 999999 }),
  });
  check('rechaza un monstruo inexistente', badMonster.status === 400, `${badMonster.status}`);

  const badVariant = await fetch(`${BASE}/api/avatar`, {
    method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ monsterId: monster.id, variant: 'inventada' }),
  });
  // Una variante desconocida cae a normal en vez de romper el perfil.
  check('una variante inválida cae a normal', (await badVariant.json()).variant === 'normal');

  const perfilConAvatar = await (await fetch(`${BASE}/cazador/${userId}`, { headers: auth })).text();
  check('el perfil pinta el avatar elegido', perfilConAvatar.includes(`/monstruos/${monster.id}`));

  const quitar = await fetch(`${BASE}/api/avatar`, {
    method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ monsterId: null }),
  });
  check('permite quitarlo', (await quitar.json()).monsterId === null);

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
