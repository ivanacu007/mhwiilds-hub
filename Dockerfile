FROM node:24-alpine AS deps
WORKDIR /srv
COPY package.json package-lock.json* ./
# `npm install` y no `npm ci`: el candado se resuelve distinto en macOS que en
# linux/musl para los fallbacks wasm de tailwind-oxide y rolldown, que declaran
# rangos flotantes. Con `npm ci` la imagen se negaba a construirse cada vez que
# el candado se generaba en el portátil, que es siempre. Se sigue respetando el
# candado para todo lo que sí cuadra; solo se deja de exigir sincronía exacta.
RUN npm install --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /srv
COPY --from=deps /srv/node_modules ./node_modules
COPY . .
# El dominio se hornea en el build: Astro lo necesita para confiar en los
# headers del proxy y no rechazar los formularios con 403. En Dokploy se pasa
# como Build Arg con el mismo valor que la variable de entorno.
ARG PUBLIC_SITE_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /srv
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /srv/dist ./dist
# scripts/ viaja a la imagen para poder correr `npm run sync:catalog`
# desde la terminal de Dokploy cuando salga un title update.
COPY scripts ./scripts
COPY src/lib ./src/lib

EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
