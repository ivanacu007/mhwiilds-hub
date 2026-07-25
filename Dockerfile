FROM node:24-alpine AS deps
WORKDIR /srv
COPY package.json package-lock.json* ./
RUN npm ci

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
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /srv/dist ./dist
# scripts/ viaja a la imagen para poder correr `npm run sync:catalog`
# desde la terminal de Dokploy cuando salga un title update.
COPY scripts ./scripts
COPY src/lib ./src/lib

EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
