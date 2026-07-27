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
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { sumCounts } from '../src/lib/crowns.ts';
import { GEAR_SLUGS } from '../src/lib/ui/gear-icons.ts';

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
  // El panel de admin se decide por esta variable; la cuenta de prueba es
  // la primera que registra el recorrido.
  ADMIN_EMAILS: 'cazador@example.com',
};

let server: ChildProcess | null = null;

async function shutdown(code: number): Promise<never> {
  server?.kill('SIGTERM');
  await mongo.stop();
  process.exit(code);
}

try {
  console.log('--- Integridad del proyecto ---');
  // Aquí vivía un `npm ci --dry-run`. No servía: el candado se resuelve distinto
  // en macOS que en linux/musl para los fallbacks wasm, así que daba verde con
  // el mismo candado que la imagen rechazaba, y en cuanto el candado se generó
  // en linux empezó a dar rojo en el portátil. La imagen usa `npm install` por
  // eso mismo. Lo que sí se puede comprobar desde cualquier sistema es que el
  // candado esté y cubra lo que package.json declara.
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const directas = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const sinCandado = directas.filter((name) => !(`node_modules/${name}` in lock.packages));
  check('el candado cubre todas las dependencias directas', sinCandado.length === 0,
    sinCandado.join(', '));

  // La imagen no puede volver a `npm ci`: rompía el despliegue cada vez que el
  // candado se generaba fuera de linux, que es siempre.
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  check('la imagen no exige sincronía exacta del candado',
    !/^\s*RUN npm ci/m.test(dockerfile),
    'con `npm ci` el build del VPS falla si el candado se generó en macOS');

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

  console.log('\n--- Idiomas ---');
  const { es } = await import('../src/lib/i18n/es.ts');
  const { en } = await import('../src/lib/i18n/en.ts');
  const esKeys = Object.keys(es).sort();
  const enKeys = Object.keys(en).sort();
  const soloEs = esKeys.filter((k) => !enKeys.includes(k));
  const soloEn = enKeys.filter((k) => !esKeys.includes(k));
  check('los diccionarios cubren las mismas claves',
    soloEs.length === 0 && soloEn.length === 0,
    `solo es: ${soloEs.join(', ')} | solo en: ${soloEn.join(', ')}`);
  check('ningún texto quedó vacío',
    esKeys.every((k) => (es as any)[k].trim()) && enKeys.every((k) => (en as any)[k].trim()));
  // Un texto idéntico en ambos suele ser una traducción olvidada. Los que
  // coinciden a propósito —nombres propios, siglas, préstamos que el español
  // usa tal cual— van listados uno por uno: antes esto era un tope numérico y
  // cada clave nueva legítima obligaba a subirlo, que es como se acaba
  // colando una olvidada de verdad.
  const IDENTICAS_A_PROPOSITO = new Set([
    'account.accessGoogle', 'account.hr', 'account.hunterId', 'account.hunterName',
    'admin.authGoogle', 'admin.setsCount', 'admin.title', 'app.name',
    'builder.res', 'builder.seriesCount', 'builder.setNumber', 'common.error', 'crowns.total',
    'finder.material', 'hunters.sets', 'hunters.setsOne', 'inventory.no',
    'monsters.elemental', 'monsters.material', 'pagination.only',
    'profile.hunterRank', 'sets.sets', 'species.temnoceran', 'variant.normal',
  ]);
  const iguales = esKeys.filter(
    (k) => (es as any)[k] === (en as any)[k] && !IDENTICAS_A_PROPOSITO.has(k),
  );
  check('no hay traducciones olvidadas', iguales.length === 0, iguales.join(', '));
  // Y al revés: una clave que se traduzca después no debe quedarse en la lista.
  const yaTraducidas = [...IDENTICAS_A_PROPOSITO].filter(
    (k) => k in es && (es as any)[k] !== (en as any)[k],
  );
  check('la lista de excepciones no tiene sobras', yaTraducidas.length === 0,
    yaTraducidas.join(', '));

  const esPage = await (await fetch(`${BASE}/entrar`, { headers: { 'accept-language': 'es-MX' } })).text();
  check('sirve español por Accept-Language', esPage.includes('lang="es"') && esPage.includes('Entrar'));

  const enPage = await (await fetch(`${BASE}/entrar`, { headers: { 'accept-language': 'en-US' } })).text();
  check('sirve inglés por Accept-Language', enPage.includes('lang="en"') && enPage.includes('Sign in'));

  const switched = await fetch(`${BASE}/api/language`, {
    method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ lang: 'en', back: '/entrar' }),
  });
  const langCookie = (switched.headers.get('set-cookie') ?? '').split(';')[0];
  check('el cambio de idioma deja cookie', langCookie.startsWith('mhw_lang=en'));
  check('y devuelve a donde estabas', switched.headers.get('location') === '/entrar');

  const withCookie = await (await fetch(`${BASE}/entrar`, {
    headers: { cookie: langCookie, 'accept-language': 'es-MX' },
  })).text();
  check('la cookie manda sobre el navegador', withCookie.includes('Sign in'));

  const evil = await fetch(`${BASE}/api/language`, {
    method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ lang: 'en', back: 'https://malo.example.com' }),
  });
  check('un destino externo no te saca del sitio', evil.headers.get('location') === '/');

  const bogusLang = await fetch(`${BASE}/api/language`, {
    method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ lang: 'klingon', back: '/entrar' }),
  });
  check('un idioma inventado se ignora', !(bogusLang.headers.get('set-cookie') ?? '').includes('klingon'));

  console.log('\n--- Catálogo ---');
  const catalogRes = await fetch(`${BASE}/api/catalog.json`, { headers: { cookie: 'mhw_lang=es' } });
  const catalog = await catalogRes.json();
  check('sirve el catálogo', catalogRes.ok);
  check('trae armaduras', catalog.armor?.length > 100, `${catalog.armor?.length}`);
  check('trae adornos', catalog.decorations?.length > 100, `${catalog.decorations?.length}`);
  const etag = catalogRes.headers.get('etag');
  const notModified = await fetch(`${BASE}/api/catalog.json`, {
    headers: { 'if-none-match': etag!, cookie: 'mhw_lang=es' },
  });
  check('responde 304 con ETag', notModified.status === 304, `dio ${notModified.status}`);

  // El ETag lleva el idioma: en inglés no debe devolver 304 con el ETag español.
  const enCatalogRes = await fetch(`${BASE}/api/catalog.json`, {
    headers: { 'if-none-match': etag!, cookie: 'mhw_lang=en' },
  });
  check('el catálogo inglés no reusa el ETag español', enCatalogRes.status === 200, `${enCatalogRes.status}`);
  const enCatalog = await enCatalogRes.json();
  check('los nombres vienen en inglés',
    enCatalog.monsters.length === catalog.monsters.length &&
    enCatalog.decorations[0].name !== catalog.decorations[0].name,
    `${enCatalog.decorations[0].name} vs ${catalog.decorations[0].name}`);

  // El catálogo entero es ~1 MB de JSON y viajaba sin comprimir a las cinco
  // pantallas que se pintan en cliente, aunque la de coronas solo mire
  // `monsters`. Estas dos cosas son las que hacían lenta la primera carga.
  const gz = await fetch(`${BASE}/api/catalog.json`, {
    headers: { cookie: 'mhw_lang=es', 'accept-encoding': 'gzip' },
  });
  check('el catálogo viaja comprimido',
    gz.headers.get('content-encoding') === 'gzip',
    'sin gzip son ~1 MB por primera visita');

  const solo = await fetch(`${BASE}/api/catalog.json?parts=monsters`, {
    headers: { cookie: 'mhw_lang=es' },
  });
  const recorte = await solo.json();
  check('se puede pedir el catálogo por partes',
    Array.isArray(recorte.monsters) && recorte.monsters.length === catalog.monsters.length &&
    recorte.armor === undefined && recorte.weapons === undefined,
    JSON.stringify(Object.keys(recorte)));
  check('el recorte pesa una fracción del entero',
    JSON.stringify(recorte).length < JSON.stringify(catalog).length / 3,
    `${Math.round(JSON.stringify(recorte).length / 1024)} KB de ${Math.round(JSON.stringify(catalog).length / 1024)} KB`);

  // Si el ETag no distinguiera el recorte, pedir `monsters` después del entero
  // devolvería 304 y la pantalla se quedaría con el catálogo anterior.
  const etagRecorte = solo.headers.get('etag');
  const cruzado = await fetch(`${BASE}/api/catalog.json`, {
    headers: { cookie: 'mhw_lang=es', 'if-none-match': etagRecorte! },
  });
  check('el ETag distingue un recorte del catálogo entero', cruzado.status === 200,
    `dio ${cruzado.status}`);

  const mismo = await fetch(`${BASE}/api/catalog.json?parts=monsters`, {
    headers: { cookie: 'mhw_lang=es', 'if-none-match': etagRecorte! },
  });
  check('y el mismo recorte sí responde 304', mismo.status === 304, `dio ${mismo.status}`);

  // Un `parts` con basura no puede dejar una pantalla vacía.
  const basura = await (await fetch(`${BASE}/api/catalog.json?parts=inventado`, {
    headers: { cookie: 'mhw_lang=es' },
  })).json();
  check('un recorte inventado cae al catálogo entero', Array.isArray(basura.armor));

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
    noInviteLocation.includes('error=msg.inviteInvalid'),
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
  check('el código no se puede reusar',
    (reuse.headers.get('location') ?? '').includes('error=msg.inviteInvalid'));

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
  check('permite cambiarlo', (rename.headers.get('location') ?? '').includes('aviso=msg.saved'));

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
  check('rechaza un nombre demasiado largo',
    (tooLong.headers.get('location') ?? '').includes('error=msg.hunterNameLong'));

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
          crowns: { smallSilver: true, smallGold: true, largeSilver: true, largeGold: true },
          hunted: { normal: 12, tempered: 4, 'arch-tempered': 1 },
          captured: { normal: 3 },
        },
        // Entrada vacía: no debe guardarse.
        999999: { smallest: null, largest: null, hunted: 0, captured: 0 },
      },
    }),
  });
  check('guarda el progreso', putProgress.ok);

  const savedProgress = (await (await fetch(`${BASE}/api/progress`, { headers: auth })).json()).monsters;
  check('descarta las entradas vacías', !('999999' in savedProgress));
  const counts = savedProgress[String(monster.id)];
  check('guarda cacerías por variante',
    counts?.hunted?.normal === 12 && counts?.hunted?.tempered === 4 && counts?.hunted?.['arch-tempered'] === 1,
    JSON.stringify(counts?.hunted));
  check('suma el total de cacerías', sumCounts(counts?.hunted) === 17, `${sumCounts(counts?.hunted)}`);

  const { crownsOf, CROWN_KEYS, countCrowns } = await import('../src/lib/crowns.ts');
  const saved = crownsOf(savedProgress[String(monster.id)]);
  check('guarda las cuatro coronas marcadas', CROWN_KEYS.every((k) => saved[k]),
    JSON.stringify(saved));
  check('las cuenta bien', countCrowns(saved) === 4);

  // Marcar solo una y comprobar que las otras no se activan solas.
  await fetch(`${BASE}/api/progress`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ monsters: { [monster.id]: { crowns: { largeGold: true } } } }),
  });
  const onlyOne = crownsOf(
    (await (await fetch(`${BASE}/api/progress`, { headers: auth })).json()).monsters[String(monster.id)],
  );
  check('marcar una no activa las demás',
    onlyOne.largeGold && !onlyOne.smallGold && !onlyOne.largeSilver && !onlyOne.smallSilver);

  // Orden por defecto del juego: Chatacabra primero, Gogmazios último.
  const { MONSTER_SORT_ORDER } = await import('../src/lib/catalog/monster-icons.ts');
  check('el catálogo viene en el orden del juego',
    catalog.monsters[0].name === 'Chatacabra' &&
    catalog.monsters.at(-1).name === 'Gogmazios',
    `${catalog.monsters[0].name} … ${catalog.monsters.at(-1).name}`);
  check('los 34 tienen posición asignada',
    catalog.monsters.every((m: any) => MONSTER_SORT_ORDER.has(m.id)));

  // Los documentos anteriores a las variantes guardaban un número suelto.
  // Se escribe uno a mano en Mongo para comprobar que no se pierde al leerlo.
  const { progress: progressCol } = await import('../src/lib/db.ts');
  await (await progressCol()).updateOne(
    { _id: userId },
    { $set: { [`monsters.${monster.id}.hunted`]: 7, [`monsters.${monster.id}.captured`]: 2 } },
  );
  const legacyRead = await (await fetch(`${BASE}/api/progress`, { headers: auth })).json();
  const legacy = legacyRead.monsters[String(monster.id)];
  const { cleanProgress } = await import('../src/lib/crowns.ts');
  const migrated = cleanProgress(legacy);
  // El modelo anterior tenía tres coronas planas marcadas a mano.
  const { cleanProgress: cp } = await import('../src/lib/crowns.ts');
  const oldManual = cp({ manualMini: true, manualSilver: true, manualGold: true });
  check('traduce las coronas manuales del modelo viejo',
    oldManual?.crowns.smallGold === true &&
    oldManual?.crowns.largeSilver === true &&
    oldManual?.crowns.largeGold === true &&
    oldManual?.crowns.smallSilver === false,
    JSON.stringify(oldManual?.crowns));

  check('migra un contador viejo a la variante normal',
    migrated?.hunted.normal === 7 && migrated?.captured.normal === 2,
    JSON.stringify(migrated?.hunted));

  console.log('\n--- Perfil, gremio y favoritos ---');
  const perfil = await fetch(`${BASE}/api/auth/profile`, {
    method: 'POST', headers: auth, redirect: 'manual',
    body: new URLSearchParams({ name: 'Cazador', hunterName: 'Ivanhunter', hunterId: 'ABC-123', hr: '145' }),
  });
  check('guarda Hunter ID y HR', (perfil.headers.get('location') ?? '').includes('aviso=msg.saved'));

  const badHr = await fetch(`${BASE}/api/auth/profile`, {
    method: 'POST', headers: auth, redirect: 'manual',
    body: new URLSearchParams({ name: 'Cazador', hr: '0' }),
  });
  check('rechaza un HR inválido', (badHr.headers.get('location') ?? '').includes('error=msg.badHr'));

  const favs = await fetch(`${BASE}/api/favorites`, {
    method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ monsters: [monster.id, monster.id, -3, 'x'] }),
  });
  const favData = await favs.json();
  check('guarda favoritos sin duplicados ni basura', favData.monsters.length === 1);

  // Antes de nombrarlo: el hueco es `null` en el dato y el rótulo lo pone la
  // vista, así que tiene que salir en el idioma de la sesión y no en español
  // siempre, que es como estaba.
  const sinNombreEs = await (await fetch(`${BASE}/gremio`, {
    headers: { ...auth, cookie: `${cookie}; mhw_lang=es` },
  })).text();
  const sinNombreEn = await (await fetch(`${BASE}/gremio`, {
    headers: { ...auth, cookie: `${cookie}; mhw_lang=en` },
  })).text();
  check('el gremio sin nombre se rotula en el idioma de la sesión',
    sinNombreEs.includes(es['guild.unnamed']) &&
    sinNombreEn.includes(en['guild.unnamed']) && !sinNombreEn.includes(es['guild.unnamed']),
    'el rótulo no puede vivir en el documento de Mongo');

  const gremio = await fetch(`${BASE}/api/guild`, {
    method: 'POST', headers: auth, redirect: 'manual',
    body: new URLSearchParams({ name: 'Los Cazadores del Sur', motto: 'Sin miedo al Rey Dau' }),
  });
  check('nombra el gremio', (gremio.headers.get('location') ?? '').includes('aviso=msg.guildUpdated'));

  const gremioHtml = await (await fetch(`${BASE}/gremio`, { headers: auth })).text();
  check('el gremio muestra su nombre', gremioHtml.includes('Los Cazadores del Sur'));

  console.log('\n--- Panel de admin ---');
  const adminHtml = await (await fetch(`${BASE}/admin`, { headers: auth })).text();
  check('el admin ve su panel',
    adminHtml.includes(es['admin.invites']) && adminHtml.includes(es['admin.members']));

  // Quien no está en ADMIN_EMAILS no debe siquiera enterarse de que existe.
  const ajeno = await fetch(`${BASE}/admin`, { headers: { cookie: otherCookie } });
  check('quien no es admin recibe 404, no un 403', ajeno.status === 404, `${ajeno.status}`);

  const anonAdmin = await fetch(`${BASE}/admin`, { redirect: 'manual' });
  check('sin sesión ni siquiera llega', (anonAdmin.headers.get('location') ?? '').startsWith('/entrar'));

  const generadas = await (await fetch(`${BASE}/admin`, {
    method: 'POST', headers: auth,
    body: new URLSearchParams({ accion: 'invitar', cuantas: '2', nota: 'prueba de humo' }),
  })).text();
  const codigos = [...generadas.matchAll(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/g)].map((m) => m[0]);
  check('genera invitaciones desde el panel',
    generadas.includes('prueba de humo') && codigos.length >= 2, `${codigos.length} códigos`);

  // El código recién generado tiene que servir de verdad para registrarse.
  const { inviteIsAvailable } = await import('../src/lib/auth/invites.ts');
  check('y el código generado es canjeable', await inviteIsAvailable(codigos[0]), codigos[0]);

  // Sin Resend ni Google configurados, este enlace es la única recuperación.
  const conEnlace = await (await fetch(`${BASE}/admin`, {
    method: 'POST', headers: auth,
    body: new URLSearchParams({ accion: 'restablecer', correo: 'cazador@example.com' }),
  })).text();
  const enlace = conEnlace.match(/https?:\/\/[^<\s]+\/restablecer\?token=[\w-]+/)?.[0];
  check('genera enlace de restablecimiento', Boolean(enlace), 'sin él, un olvido deja a alguien fuera');
  check('y el enlace abre la pantalla de contraseña nueva',
    enlace != null && (await (await fetch(enlace)).text()).includes('type="password"'));

  const inexistente = await (await fetch(`${BASE}/admin`, {
    method: 'POST', headers: auth,
    body: new URLSearchParams({ accion: 'restablecer', correo: 'nadie@example.com' }),
  })).text();
  check('un correo sin cuenta no inventa enlace',
    inexistente.includes(es['admin.noUser']) && !inexistente.includes('/restablecer?token='));

  const lista = await (await fetch(`${BASE}/cazadores`, { headers: auth })).text();
  check('la lista muestra al cazador', lista.includes('Ivanhunter'));

  const perfilHtml = await (await fetch(`${BASE}/cazador/${userId}`, { headers: auth })).text();
  check('el perfil muestra HR y Hunter ID', perfilHtml.includes('145') && perfilHtml.includes('ABC-123'));
  check('el perfil muestra el monstruo favorito', perfilHtml.includes(monster.name));

  const anonProfile = await fetch(`${BASE}/cazadores`, { redirect: 'manual' });
  check('los perfiles exigen sesión', (anonProfile.headers.get('location') ?? '').startsWith('/entrar'));

  const noSuchHunter = await fetch(`${BASE}/cazador/no-existe`, { headers: auth });
  check('cazador inexistente da 404', noSuchHunter.status === 404, `${noSuchHunter.status}`);

  console.log('\n--- Monstruos ---');
  const first = catalog.monsters[0];
  check('el catálogo trae debilidades con nivel',
    catalog.monsters.every((m: any) => Array.isArray(m.weaknesses)) &&
    catalog.monsters.some((m: any) => m.weaknesses.some((w: any) => w.level > 0)));
  check('trae zonas de impacto con multiplicadores',
    catalog.monsters.every((m: any) => m.parts.length > 0) &&
    catalog.monsters.every((m: any) => m.parts.every((p: any) => Object.keys(p.multipliers).length > 0)));
  check('los nombres de parte están traducidos',
    catalog.monsters.every((m: any) => m.parts.every((p: any) => p.name !== p.kind)),
    catalog.monsters.flatMap((m: any) => m.parts).filter((p: any) => p.name === p.kind).slice(0, 3)
      .map((p: any) => p.kind).join(', '));
  check('trae recompensas y salud base',
    catalog.monsters.every((m: any) => m.rewards.length > 0 && m.baseHealth > 0));
  check('trae las variantes que declara la API',
    catalog.monsters.some((m: any) => m.variants.includes('tempered')));

  const listPage = await (await fetch(`${BASE}/monstruos`, { headers: auth })).text();
  check('la lista muestra monstruos', listPage.includes(first.name));
  check('la lista no pagina: salen los 34',
    !listPage.includes('?p=2') &&
    catalog.monsters.every((m: any) => listPage.includes(m.name)),
    `${catalog.monsters.filter((m: any) => !listPage.includes(m.name)).length} sin aparecer`);
  check('conserva el conteo al pie', listPage.includes(`${catalog.monsters.length} monstruos`));

  // Mezclar debilidades y ordenar por nivel escondía el elemento en 32 de 34
  // monstruos: los estados son nivel 2-3 y los elementos nivel 1.
  const { splitAffinities, affinityLabel } = await import('../src/lib/monster-info.ts');
  const { translatorFor } = await import('../src/lib/i18n/index.ts');
  const tEs = translatorFor('es');
  const affinityLabelEs = (w: any) => affinityLabel(tEs, w);
  const conElemento = catalog.monsters.filter(
    (m: any) => splitAffinities(m.weaknesses).elements.length > 0,
  );
  check('casi todos tienen debilidad elemental', conElemento.length >= 33,
    `${conElemento.length} de ${catalog.monsters.length}`);

  // La lista debe traer TODAS las debilidades, agrupadas igual que el detalle:
  // antes iban en una línea con truncate y con 7.5 de media se cortaba casi todo.
  // Se compara sobre el texto plano: atar la prueba al marcado exacto la rompe
  // en cada retoque de la maqueta sin que nada esté realmente mal.
  const listText = listPage.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const faltantes: string[] = [];
  for (const m of catalog.monsters) {
    const s = splitAffinities(m.weaknesses);
    for (const w of [...s.elements, ...s.statuses, ...s.effects]) {
      const label = affinityLabelEs(w);
      if (!listText.includes(label)) faltantes.push(`${m.name}: ${label}`);
    }
  }
  check('la lista trae todas las debilidades', faltantes.length === 0,
    faltantes.slice(0, 4).join(' | '));

  // Las resistencias también, que antes solo estaban en el detalle.
  const sinResistencias = catalog.monsters.filter((m: any) => {
    const r = splitAffinities(m.resistances);
    return [...r.elements, ...r.statuses, ...r.effects]
      .some((x: any) => !listText.includes(affinityLabelEs(x)));
  });
  check('la lista trae las resistencias', sinResistencias.length === 0,
    sinResistencias.slice(0, 3).map((m: any) => m.name).join(', '));

  check('la lista agrupa como el detalle',
    listPage.includes('Elemental') && listPage.includes('Estados') && listPage.includes('Efectos'));

  // stun llegaba como efecto sin traducir y salía en minúscula.
  check('los efectos están traducidos',
    !listPage.includes('>stun<') && !listPage.includes('>flash<') && !listPage.includes('>exhaust<'));

  const elementosVisibles = catalog.monsters.filter((m: any) => {
    const els = splitAffinities(m.weaknesses).elements;
    return els.length === 0 || els.some((e: any) => listPage.includes(`${'★'.repeat(e.level ?? 0)}`));
  });
  check('la lista enseña el elemento de cada uno',
    elementosVisibles.length === catalog.monsters.length,
    `${elementosVisibles.length} de ${catalog.monsters.length}`);

  // Los estados también llevan nivel: sin él no se sabe cuál conviene llevar.
  const conEstados = catalog.monsters.filter(
    (m: any) => splitAffinities(m.weaknesses).statuses.length > 0,
  );
  const estadosConEstrellas = conEstados.filter((m: any) =>
    splitAffinities(m.weaknesses).statuses.every((st: any) => (st.level ?? 0) > 0),
  );
  check('los estados traen nivel en los datos',
    conEstados.length > 0 && estadosConEstrellas.length === conEstados.length);

  // El nombre del elemento traducido tiene que aparecer, no solo las estrellas.
  const reyDau = catalog.monsters.find((m: any) => m.name.includes('Rey Dau'));
  const hielo = splitAffinities(reyDau.weaknesses).elements[0];
  const detalleRey = await (await fetch(`${BASE}/monstruos/${reyDau.id}`, { headers: auth })).text();
  check('el detalle separa elemental de estados',
    detalleRey.includes('Elemental') && detalleRey.includes('Estados'));
  check('y nombra el elemento concreto', hielo != null && detalleRey.includes('Hielo'),
    JSON.stringify(hielo));

  const searched = await (await fetch(`${BASE}/monstruos?q=${encodeURIComponent(first.name)}`, {
    headers: auth,
  })).text();
  check('la búsqueda filtra', searched.includes(first.name));

  const detail = await (await fetch(`${BASE}/monstruos/${first.id}`, { headers: auth })).text();
  check('el detalle abre', detail.includes(first.name));
  check('muestra la tabla de zonas', detail.includes(first.parts[0].name));
  check('muestra recompensas', detail.includes('%'));

  const missingMonster = await fetch(`${BASE}/monstruos/999999`, { headers: auth });
  check('un monstruo inexistente da 404', missingMonster.status === 404, `${missingMonster.status}`);

  const anonList = await fetch(`${BASE}/monstruos`, { redirect: 'manual' });
  check('la lista exige sesión', (anonList.headers.get('location') ?? '').startsWith('/entrar'));

  const iconRes = await fetch(`${BASE}/iconos/${first.id}.webp`);
  check('los iconos siguen sirviéndose', iconRes.ok, `${iconRes.status}`);

  console.log('\n--- Armador: habilidades ---');
  const porTipo = catalog.skills.reduce((acc: any, sk: any) => {
    acc[sk.kind] = (acc[sk.kind] ?? 0) + 1; return acc;
  }, {});
  check('el catálogo trae habilidades de ambos tipos',
    porTipo.armor > 50 && porTipo.weapon > 50, JSON.stringify(porTipo));

  const armador = await (await fetch(`${BASE}/armador`, { headers: auth })).text();
  check('el armador carga', armador.includes('SetBuilder') || armador.includes('astro-island'));
  check('explica para qué sirve el arma',
    armador.includes('Equipa un arma') || armador.includes('builder.weaponHelp') ||
    armador.includes('astro-island'));

  const tipos = new Set(catalog.weapons.map((w: any) => w.kind));
  check('el catálogo trae los 14 tipos de arma', tipos.size === 14, `${tipos.size}`);
  const { es: dic } = await import('../src/lib/i18n/es.ts');
  const sinNombre = [...tipos].filter((k: any) => !(`wk.${k}` in dic));
  check('todos los tipos de arma tienen nombre', sinNombre.length === 0, sinNombre.join(', '));

  console.log('\n--- Recompensas y buscador ---');
  const conRecompensas = catalog.monsters.find((m: any) => m.rewards.length > 3);
  const detalleRec = await (await fetch(`${BASE}/monstruos/${conRecompensas.id}`, { headers: auth })).text();

  // Cada material una tarjeta con sus orígenes dentro: en tabla, las filas de
  // origen quedaban despegadas del nombre y no se sabía a cuál pertenecían.
  const tarjetas = (detalleRec.match(/data-nombre="/g) ?? []).length;
  const materialesDistintos = new Set(conRecompensas.rewards.map((r: any) => r.itemId)).size;
  check('una tarjeta por material', tarjetas === materialesDistintos,
    `${tarjetas} tarjetas para ${materialesDistintos} materiales`);
  check('el detalle trae filtro de materiales', detalleRec.includes('filtro-materiales'));

  // El origen más probable primero: es la vía que se busca al farmear.
  const primero = conRecompensas.rewards.find((r: any) => r.conditions.length > 1);
  if (primero) {
    const orden = [...primero.conditions].sort((a: any, b: any) => (b.chance ?? 0) - (a.chance ?? 0));
    check('los orígenes van de más a menos probable',
      orden[0].chance >= orden[orden.length - 1].chance);
  }

  const home = await (await fetch(`${BASE}/`, { headers: auth, redirect: 'manual' })).text();
  check('la home ya no redirige y trae el buscador',
    home.includes('finder') || home.includes('Buscar un material'));

  const homeAnon = await fetch(`${BASE}/`, { redirect: 'manual' });
  check('sin sesión la home sigue siendo la portada', homeAnon.status === 200);

  console.log('\n--- Sistema de diseño ---');
  const css = (await (await fetch(`${BASE}/entrar`)).text())
    .match(/\/_astro\/[^"]+\.css/)?.[0];
  const hoja = css ? await (await fetch(`${BASE}${css}`)).text() : '';

  check('el CSS trae los dos temas',
    hoja.includes('#0b0a09') && hoja.includes('#f2e9d8'),
    css ?? 'sin hoja');
  check('el tema se conmuta por data-theme', hoja.includes('data-theme'));
  check('respeta prefers-color-scheme', hoja.includes('prefers-color-scheme'));
  check('define las escalas semánticas',
    ['--crown-gold', '--slot-2', '--hz-good-bg', '--rarity-6', '--el-fire', '--st-poison']
      .every((v) => hoja.includes(v)));

  // La maqueta es la referencia y ya se desvió una vez: estas medidas son las
  // del HTML entregado, no una aproximación a ojo.
  check('el degradado del botón principal tiene su tono bajo y su color de texto',
    ['--accent-deep', '--on-accent', '--panel-head', '--line-soft'].every((v) => hoja.includes(v)));
  check('el bisel de cabecera corta solo la esquina superior derecha',
    hoja.includes('.bevel-head') && hoja.includes('calc(100% - var(--bevel-lg)) 0'));

  const entrarHtml = await (await fetch(`${BASE}/entrar`)).text();
  check('el script de tema va antes del CSS',
    entrarHtml.indexOf('localStorage.getItem(\'theme\')') < entrarHtml.indexOf('.css'),
    'si va después, la página parpadea');
  check('la barra trae el selector de tema', entrarHtml.includes('theme-toggle'));
  check('carga las tipografías del sistema',
    entrarHtml.includes('Barlow') && entrarHtml.includes('Spectral') && entrarHtml.includes('IBM+Plex+Mono'));

  // El dato de la API se llama «blastblight»; mientras el token se llamó
  // «--st-blast» la nitroplaga salía gris entre estados de colores.
  check('el tono de cada estado se llama como el dato de la API',
    ['--st-poison', '--st-paralysis', '--st-sleep', '--st-blastblight']
      .every((v) => hoja.includes(v)),
    'si no coinciden, affinityTint cae al gris de texto');

  // Elegir «oscuro» a mano con el sistema en claro dejaba los tonos que solo
  // define el bloque de prefers-color-scheme con su valor de tema claro.
  const oscuroExplicito = hoja.match(/\[data-theme=.?dark.?\]\{[^}]*\}/)?.[0] ?? '';
  check('el tema oscuro explícito define la paleta entera',
    ['--line-soft', '--table-bg', '--table-head', '--chip-bg']
      .every((v) => oscuroExplicito.includes(v)),
    oscuroExplicito ? 'faltan tonos en [data-theme=dark]' : 'no se encontró el bloque');

  check('define las utilidades de tabla densa',
    hoja.includes('.table-dense') && hoja.includes('.col-sticky'));
  check('la matriz de zonas lleva cabecera y retícula propias',
    ['--table-head', '--table-grid', '--table-bg'].every((v) => hoja.includes(v)),
    'sin ellos la cabecera se confunde con el cuerpo en claro');
  check('define los tramos de zona de impacto',
    ['hz-0', 'hz-bad', 'hz-low', 'hz-mid', 'hz-good'].every((c) => hoja.includes(c)));
  check('define el remate angular', hoja.includes('clip-path'));

  const { hitzoneTone, hitzoneDots, formatMultiplier } =
    await import('../src/lib/monster-info.ts');
  check('el cero de una zona se marca con guion, no con 0',
    formatMultiplier(0) === '—' && hitzoneTone(0) === 'hz-0' && hitzoneDots(0) === '');
  check('cada tramo tiene su clase y sus puntos',
    hitzoneTone(0.15) === 'hz-bad' && hitzoneTone(0.72) === 'hz-good' && hitzoneDots(0.72) === '···');

  const detalleTabla = await (await fetch(`${BASE}/monstruos/${first.id}`, { headers: auth })).text();
  check('la tabla de zonas fija cabecera y primera columna',
    detalleTabla.includes('table-dense') && detalleTabla.includes('col-sticky'));

  const { PAGINATION_THRESHOLD, PAGE_SIZES } = await import('../src/lib/paginate.ts');
  check('el tamaño de página es 40', PAGE_SIZES[0] === 40);
  check('los monstruos quedan por debajo del umbral',
    catalog.monsters.length < PAGINATION_THRESHOLD && catalog.charms.length < PAGINATION_THRESHOLD);
  check('los adornos y materiales lo superan',
    catalog.decorations.length > PAGINATION_THRESHOLD && catalog.items.length > PAGINATION_THRESHOLD);

  console.log('\n--- Iconos de material ---');
  const { ICON_KIND_MAP, itemIconPath, itemIconColor, requiredIconSlugs } =
    await import('../src/lib/catalog/item-icons.ts');

  check('el catálogo trae el descriptor de icono',
    catalog.items.every((i: any) => i.iconKind) ,
    `${catalog.items.filter((i: any) => !i.iconKind).length} sin tipo`);

  // Todo material debe resolver a un archivo: si aparece un tipo nuevo en un
  // title update, la prueba lo caza en vez de dejar el hueco en silencio.
  const sinRuta = catalog.items.filter((i: any) => !itemIconPath(i.iconKind));
  check('todos los materiales resuelven a un icono', sinRuta.length === 0,
    [...new Set(sinRuta.map((i: any) => i.iconKind))].slice(0, 5).join(', '));

  const sinColor = catalog.items.filter(
    (i: any) => itemIconColor(i.iconColor) === '#9aa3b0' && i.iconColor !== 'gray' && i.iconColor !== 'none',
  );
  check('todos los colores están mapeados', sinColor.length === 0,
    [...new Set(sinColor.map((i: any) => i.iconColor))].slice(0, 5).join(', '));

  check('la lista de archivos no tiene duplicados',
    new Set(requiredIconSlugs().map((r: any) => r.slug)).size === requiredIconSlugs().length);
  check('hacen falta menos archivos que combinaciones',
    requiredIconSlugs().length < Object.keys(ICON_KIND_MAP).length + 5,
    `${requiredIconSlugs().length} archivos para ${Object.keys(ICON_KIND_MAP).length} tipos`);

  console.log('\n--- Paginación ---');
  // 60 sets para que la lista tenga que partirse en varias páginas.
  for (let i = 0; i < 59; i++) {
    await fetch(`${BASE}/api/sets`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `Set ${String(i).padStart(2, '0')}`,
        head: { armorId: catalog.armor.find((a: any) => a.kind === 'head').id, decorations: [] },
        chest: null, arms: null, waist: null, legs: null,
        weaponId: null, weaponDecorations: [], charmId: null, charmLevel: null, isPublic: true,
      }),
    });
  }

  const p1 = await (await fetch(`${BASE}/mis-sets`, { headers: auth })).text();
  const countRows = (html: string) => (html.match(/class="borrar/g) ?? []).length;
  check('la primera página trae 25 sets', countRows(p1) === 25, `${countRows(p1)}`);
  check('muestra el total real', p1.includes('60 sets guardados'));
  check('dibuja el enlace a la página 2', p1.includes('?p=2'));

  const p3 = await (await fetch(`${BASE}/mis-sets?p=3`, { headers: auth })).text();
  check('la última página trae el resto', countRows(p3) === 10, `${countRows(p3)}`);
  check('las páginas muestran sets distintos',
    p1.includes('Set 58') !== p3.includes('Set 58'));

  // Una página fuera de rango debe caer a la última, no quedarse en blanco.
  const far = await (await fetch(`${BASE}/mis-sets?p=999`, { headers: auth })).text();
  check('una página inexistente cae a la última', countRows(far) === 10, `${countRows(far)}`);

  const bogus = await (await fetch(`${BASE}/mis-sets?p=abc`, { headers: auth })).text();
  check('una página no numérica cae a la primera', countRows(bogus) === 25, `${countRows(bogus)}`);

  const negative = await (await fetch(`${BASE}/mis-sets?p=-5`, { headers: auth })).text();
  check('una página negativa cae a la primera', countRows(negative) === 25, `${countRows(negative)}`);

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
  check('el perfil pinta el avatar elegido', perfilConAvatar.includes(`/iconos/${monster.id}`));

  const quitar = await fetch(`${BASE}/api/avatar`, {
    method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ monsterId: null }),
  });
  check('permite quitarlo', (await quitar.json()).monsterId === null);

  console.log('\n--- Fidelidad a la maqueta ---');
  const armadorHtml = await (await fetch(`${BASE}/armador`, {
    headers: { cookie },
  })).text();

  check('la barra lleva el filete ámbar superior',
    armadorHtml.includes('class="topbar') && hoja.includes('inset 0 2px 0 var(--accent)'),
    'es el remate del registro de menú en la maqueta');
  // El minificador reescribe el rgb() a hex, así que se comprueba la regla.
  check('en claro la barra usa sombra en vez de brillo',
    /\[data-theme=.?light.?\] \.topbar\{box-shadow:inset 0 2px 0 var\(--accent\),0 1px 3px/.test(hoja));
  check('la sección activa se marca con filete inferior, no con caja',
    armadorHtml.includes('border-bottom: 2px solid var(--accent)'));
  check('los enlaces de la barra miden 34 px', armadorHtml.includes('h-[34px]'));

  // La fila entera pide 972 px en inglés y 1014 en español. Sin plegarse, por
  // debajo de eso empujaba la página entera a scroll horizontal en móvil.
  check('la barra pliega la navegación en un desplegable cuando no cabe',
    armadorHtml.includes('id="nav-menu"') && armadorHtml.includes('xl:hidden') &&
    armadorHtml.includes('hidden items-center xl:flex'),
    'sin plegado la barra desborda por debajo de 1014 px');
  check('el desplegable abre sin JavaScript',
    /<details[^>]*id="nav-menu"/.test(armadorHtml) && armadorHtml.includes('<summary'));
  check('y deja Salir a mano cuando la fila va estrecha',
    (armadorHtml.match(/action="\/api\/auth\/logout"/g) ?? []).length === 2,
    'uno en la barra ancha y otro dentro del desplegable');
  check('el Hunter Name no puede estirar la barra',
    armadorHtml.includes('max-w-[22ch] truncate'), 'admite 40 caracteres');
  check('la fila de cabecera va a sangre bajo la barra',
    armadorHtml.includes('min-h-[42px]') && !armadorHtml.includes('flex-1 px-4 py-6'));
  check('el contexto de la cabecera va en monoespaciada',
    /class="num text-\[11\.5px\]/.test(armadorHtml));
  // El armador es una isla `client:only`: no está en el HTML del servidor, así
  // que sus medidas se comprueban en la fuente.
  const builderSrc = readFileSync(new URL('../src/components/SetBuilder.tsx', import.meta.url), 'utf8');
  check('la retícula del armador es 380 px + resto',
    builderSrc.includes('lg:grid-cols-[380px_minmax(0,1fr)]'));
  check('el panel de objetivos lleva bisel de cabecera',
    builderSrc.includes('panel bevel-head'));
  check('las filas de objetivo miden 38 px con botones de 24',
    builderSrc.includes('min-h-[38px]') && builderSrc.includes('h-6 w-6'));
  check('las piezas del set van en columnas fijas',
    builderSrc.includes('grid-cols-[64px_26px_minmax(0,1fr)_56px_auto]'),
    'sin columnas, la defensa baila de renglón en renglón');
  check('el cuerpo de la tarjeta reparte 1.55 / 1',
    builderSrc.includes('lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]'));
  check('un objetivo servido a medias se marca en ámbar de aviso',
    builderSrc.includes('var(--warn)'));

  const comboSrc = readFileSync(new URL('../src/components/ui/Combo.tsx', import.meta.url), 'utf8');
  check('el campo de búsqueda va sobre el fondo hondo y sin redondeo',
    comboSrc.includes('border bg-bg-0 px-2.5') && !comboSrc.includes('rounded-[2px]'));
  check('el campo anuncia que abre la lista completa',
    comboSrc.includes('⌕') && comboSrc.includes('seeAllLabel'),
    'sin la pista nadie descubre que se abre al enfocar');
  check('la casilla de solo forjadas está dibujada, no es la nativa',
    builderSrc.includes('peer sr-only') && builderSrc.includes('border-ok bg-ok text-bg-0'));
  check('las pestañas usan rótulo corto para caber en 380 px',
    builderSrc.includes("t('builder.tabArmor')") && !builderSrc.includes('num ml-1.5 opacity-70'));
  check('el ✕ del objetivo comparte fondo con los ±',
    /border-line bg-bg-2 text-\[12px\] text-text-3/.test(builderSrc));

  check('la lista de habilidades se dibuja fuera del panel biselado',
    comboSrc.includes('createPortal') && comboSrc.includes('document.body'),
    'el clip-path del bisel recorta a sus descendientes y la cortaba');
  check('la lista se abre hacia arriba si abajo no cabe',
    comboSrc.includes('rect.up'));
  check('los tipos de arma usan el icono del juego, no abreviaturas',
    builderSrc.includes('gearIconStyle(kind') && !builderSrc.includes('.slice(0, 2)'));
  check('las piezas del set llevan el icono de su ranura',
    builderSrc.includes("gearIconStyle('charm'") && builderSrc.includes("gearIconStyle(kind, 14"));

  const iconos = readdirSync(new URL('../public/iconos/equipo/', import.meta.url));
  check('están las 20 máscaras de equipo',
    GEAR_SLUGS.every((s) => iconos.includes(`${s}.webp`)),
    GEAR_SLUGS.filter((s) => !iconos.includes(`${s}.webp`)).join(', ') || 'todas');

  const detalle = await (await fetch(`${BASE}/monstruos/${catalog.monsters[0].id}`, {
    headers: { cookie },
  })).text();

  // Se ancla en la clase, que sale literal en el HTML compilado; el separador
  // viaja como entidad y no sirve para comprobar.
  check('la ficha lleva miga de pan con la posición en el bestiario',
    detalle.includes('<nav class="num flex items-center gap-2 text-[11.5px] text-text-3">'),
    'sin ella no se sabe por dónde se va en el bestiario');
  check('el nombre va en la serif de guía a 40 px',
    detalle.includes('font-guide text-[40px]'));
  check('las cabeceras de bloque llevan el filete ámbar',
    detalle.includes('border-b border-accent bg-panel-head'));
  check('las debilidades salen en tres bloques, no en lista',
    detalle.includes('lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]'));

  // La API solo enumera aquello a lo que el monstruo reacciona, y 30 de los 34
  // tienen una única debilidad elemental: sin el repertorio completo la columna
  // ancha quedaba con una fila suelta y «no le entra» había que deducirlo.
  const { AFFINITY_VOCABULARY } = await import('../src/lib/monster-info.ts');
  const unSoloElemento = catalog.monsters.find(
    (m: any) =>
      splitAffinities(m.weaknesses).elements.length === 1 &&
      splitAffinities(m.resistances).elements.length > 0,
  );
  const detalleElem = await (await fetch(`${BASE}/monstruos/${unSoloElemento.id}`, {
    headers: auth,
  })).text();
  // Se cuentan las filas por su clase, que sale literal en el HTML compilado.
  const filasElem = (detalleElem.match(/h-\[30px\] items-center gap-2 bg-bg-2 px-2/g) ?? []).length;
  check('el bloque elemental enseña los cinco elementos, no solo la debilidad',
    filasElem === AFFINITY_VOCABULARY.element.length,
    `${filasElem} filas en ${unSoloElemento.name}, se esperaban ${AFFINITY_VOCABULARY.element.length}`);
  check('y marca lo que le rebota en vez de callarlo',
    detalleElem.includes(dic['monsters.resists']),
    `${unSoloElemento.name} resiste algo y no lo dice`);

  // La ficha no repite «Monstruos» sobre la miga de pan: el título es el nombre
  // del monstruo, y dos <h1> en la misma página no es solo cuestión de estética.
  check('la ficha tiene un único título',
    (detalle.match(/<h1/g) ?? []).length === 1,
    `${(detalle.match(/<h1/g) ?? []).length} <h1>`);

  // Dos roturas distintas del mismo material daban dos filas gemelas al 100 %.
  const conParte = catalog.monsters.find((m: any) =>
    m.rewards.some((r: any) => r.conditions.filter((c: any) => c.part).length > 1),
  );
  if (conParte) {
    const detalleParte = await (await fetch(`${BASE}/monstruos/${conParte.id}`, {
      headers: auth,
    })).text();
    const parte = conParte.rewards
      .flatMap((r: any) => r.conditions).find((c: any) => c.part).part;
    const nombreParte = conParte.parts.find((p: any) => p.kind === parte)?.name;
    check('el origen por rotura dice qué parte se rompe',
      nombreParte != null && detalleParte.includes(nombreParte), `${parte}`);
    check('y las partes rompibles se resumen en las notas de campo',
      detalleParte.includes(dic['monsters.breakable']));
  }
  check('la ficha reserva 300 px para el registro de campo',
    detalle.includes('xl:grid-cols-[minmax(0,1fr)_300px]'));
  check('las recompensas se filtran por vía sin JavaScript',
    detalle.includes('name="via"') && detalle.includes('peer-checked:border-accent'));

  check('el armador se pliega en hoja inferior en móvil',
    builderSrc.includes('max-lg:fixed') && builderSrc.includes('max-lg:bottom-0'));
  check('la barra fija de móvil deja hueco bajo los resultados',
    builderSrc.includes('max-lg:pb-16'),
    'sin el hueco, la barra tapa la última tarjeta');

  // Los alias de la paleta vieja ya se retiraron: que no vuelvan por copiar y pegar.
  const fuentes = await Promise.all(
    ['src/pages', 'src/components', 'src/layouts'].map(async (dir) =>
      execSync(`grep -rno "base-[0-9]\\{3\\}\\|ember-[0-9]\\{3\\}\\|jade-[0-9]\\{3\\}" ${dir} || true`)
        .toString()),
  );
  check('no quedan nombres de la paleta anterior', fuentes.every((out) => out.trim() === ''),
    fuentes.join('').slice(0, 200));

  console.log('\n--- Mensajes traducidos ---');
  const savedEs = await (await fetch(`${BASE}/cuenta?aviso=msg.saved`, {
    headers: { ...auth, cookie: `${cookie}; mhw_lang=es` },
  })).text();
  check('el aviso sale en español', savedEs.includes('Guardado.'));

  const savedEn = await (await fetch(`${BASE}/cuenta?aviso=msg.saved`, {
    headers: { ...auth, cookie: `${cookie}; mhw_lang=en` },
  })).text();
  check('el mismo aviso sale en inglés', savedEn.includes('Saved.') && !savedEn.includes('Guardado.'));

  // Antes el mensaje viajaba como texto y se pintaba tal cual: cualquiera podía
  // fabricar un enlace que mostrara lo que quisiera.
  const injected = await (await fetch(`${BASE}/cuenta?error=Tu%20cuenta%20fue%20bloqueada`, {
    headers: auth,
  })).text();
  check('un mensaje inventado en la URL no se pinta', !injected.includes('Tu cuenta fue bloqueada'));

  const injectedHtml = await (await fetch(`${BASE}/entrar?error=%3Cimg%20src%3Dx%3E`)).text();
  check('tampoco se cuela marcado', !injectedHtml.includes('<img src=x>'));

  console.log('\n--- Login ---');
  const badLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({ email: 'cazador@example.com', password: 'incorrecta!!' }),
  });
  check('rechaza contraseña incorrecta',
    (badLogin.headers.get('location') ?? '').includes('error=msg.badCredentials'));

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
