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
import { sumCounts } from '../src/lib/crowns.ts';

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
  // Un texto idéntico en ambos suele ser una traducción olvidada; algunos son
  // legítimos (Normal, HR, Google), así que solo se acota el total.
  const iguales = esKeys.filter((k) => (es as any)[k] === (en as any)[k]);
  check('casi todo está realmente traducido', iguales.length < 20,
    `${iguales.length} iguales: ${iguales.slice(0, 8).join(', ')}`);

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

  const gremio = await fetch(`${BASE}/api/guild`, {
    method: 'POST', headers: auth, redirect: 'manual',
    body: new URLSearchParams({ name: 'Los Cazadores del Sur', motto: 'Sin miedo al Rey Dau' }),
  });
  check('nombra el gremio', (gremio.headers.get('location') ?? '').includes('aviso=msg.guildUpdated'));

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
  check('la lista pagina', listPage.includes('?p=2'));

  // Mezclar debilidades y ordenar por nivel escondía el elemento en 32 de 34
  // monstruos: los estados son nivel 2-3 y los elementos nivel 1.
  const { splitAffinities } = await import('../src/lib/monster-info.ts');
  const conElemento = catalog.monsters.filter(
    (m: any) => splitAffinities(m.weaknesses).elements.length > 0,
  );
  check('casi todos tienen debilidad elemental', conElemento.length >= 33,
    `${conElemento.length} de ${catalog.monsters.length}`);

  const primeraPagina = catalog.monsters.slice(0, 24);
  const elementosVisibles = primeraPagina.filter((m: any) => {
    const els = splitAffinities(m.weaknesses).elements;
    return els.length === 0 || els.some((e: any) => listPage.includes(`${'★'.repeat(e.level ?? 0)}`));
  });
  check('la lista enseña el elemento de cada uno',
    elementosVisibles.length === primeraPagina.length,
    `${elementosVisibles.length} de ${primeraPagina.length}`);

  // Los estados también llevan nivel: sin él no se sabe cuál conviene llevar.
  const conEstados = catalog.monsters.slice(0, 24).filter(
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
