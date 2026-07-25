# Sets de Wilds

Armador de sets de Monster Hunter Wilds que solo propone lo que **de verdad tienes**.
Multiusuario, con cuentas, y cada set guardado tiene un enlace público para compartir.

Astro 5 (SSR, adaptador Node) · Preact · Tailwind 4 · MongoDB · Docker/Dokploy.

## Cómo funciona

- **El catálogo** (714 armaduras, 361 adornos, 179 habilidades, 64 talismanes, 1188 armas)
  se descarga de [wilds.mhdb.io](https://docs.wilds.mhdb.io/) y se guarda en Mongo. Son unos
  670 KB que se sirven al navegador y se cachean en IndexedDB con ETag.
- **El solver corre en el navegador**, en un Web Worker. El servidor no gasta CPU aunque
  varias personas busquen a la vez, y la respuesta es instantánea.
- **El inventario y los sets** viven en Mongo, uno por usuario.

## Poner en marcha (local)

```bash
npm install
cp .env.example .env      # llena MONGODB_URI y SESSION_SECRET
npm run dev
```

Para probar la interfaz sin ninguna base de datos, con un Mongo en memoria y una
invitación ya creada:

```bash
npm run build
npm run sandbox
```

## Deploy en Dokploy

1. Sube el repo a GitHub/GitLab.
2. En Dokploy: **Create Application → Git provider → repo**. Build type: **Dockerfile**.
3. **Build Arg** (pestaña Build): `PUBLIC_SITE_URL=https://tudominio.com`

   > Esto no es opcional. Astro solo confía en los headers del proxy si el dominio
   > está horneado en el build; sin esto, detrás de Traefik toda petición POST se
   > rechaza con 403 y no se puede ni entrar.

4. **Variables de entorno** (las mismas que `.env.example`), incluida otra vez
   `PUBLIC_SITE_URL` con el mismo valor.
5. Conecta el Mongo que ya corre en el VPS por su nombre de servicio en la red de Docker.
6. Asigna el dominio y deja que Dokploy pida el certificado.

En el primer arranque, si la base está vacía, la app descarga el catálogo sola: no
hace falta ningún paso manual antes de poder usarla.

### Variables

| Variable | Obligatoria | Para qué |
|---|---|---|
| `MONGODB_URI` | sí | Conexión a Mongo |
| `MONGODB_DB` | no | Base de datos (por defecto `mhwilds_sets`) |
| `SESSION_SECRET` | sí | Reservada para firmar; genera una con `openssl rand -hex 32` |
| `PUBLIC_SITE_URL` | sí | Dominio público. **También como Build Arg** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Acceso con Google |
| `RESEND_API_KEY` / `RESEND_FROM` | no | Reset de contraseña por correo |
| `CATALOG_LOCALE` | no | Idioma del catálogo (por defecto `es`) |

Para Google OAuth, la redirect URI autorizada es `{PUBLIC_SITE_URL}/api/auth/google/callback`.

Si no configuras Resend, el "olvidé mi contraseña" queda oculto y la app manda a entrar
con Google. Todo lo demás funciona igual.

## Invitaciones

El registro es cerrado. Desde la terminal del contenedor en Dokploy:

```bash
npm run invite -- 5 "amigos"
```

## Title updates

Cuando Capcom saque contenido nuevo:

```bash
npm run sync:catalog
```

Es idempotente. Con `-- --dry-run` descarga y valida sin escribir en Mongo. La app
relee el catálogo al reiniciarse, y los navegadores lo notan por el ETag.

## Pruebas

```bash
npm run test:smoke   # levanta Mongo en memoria y recorre el flujo completo
npx tsc --noEmit
npx astro check
```

La prueba de humo cubre: catálogo y ETag, invitaciones (incluido que no se reusen),
registro, login, sesiones, saneo del inventario, creación de sets, enlaces públicos,
404 de slugs inexistentes, clonado y aislamiento entre usuarios.

## Estructura

```
src/lib/catalog/     descarga, tipado y caché del catálogo
src/lib/solver/      solver (solve.ts) y su Web Worker
src/lib/auth/        sesiones, contraseñas, Google OAuth, invitaciones
src/components/      InventoryEditor y SetBuilder (islas Preact)
src/pages/api/       endpoints
scripts/             sincronización, invitaciones, pruebas, sandbox
```

## Detalles del juego que el solver respeta

- Las **habilidades de arma** solo salen del arma y de sus adornos; ninguna pieza de
  armadura las da. Si pides una sin arma equipada, la app lo dice en vez de buscar en vano.
- Los **adornos de arma y de armadura** no son intercambiables.
- El **bonus de grupo** suma piezas de series distintas (hay grupos con 14 series), no
  solo de la misma serie.
- Ninguna habilidad supera su nivel máximo aunque se apilen fuentes.
