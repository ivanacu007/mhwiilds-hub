// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

const siteUrl = process.env.PUBLIC_SITE_URL;

/**
 * Astro solo confía en los headers `Host` y `X-Forwarded-*` si el dominio está
 * en esta lista. Sin ella arma la URL de cada petición como `http://localhost`,
 * y entonces su comprobación CSRF (origin === url.origin) rechaza con 403 todo
 * formulario enviado desde el dominio real. Detrás del Traefik de Dokploy eso
 * deja la app inservible: no se podría ni entrar ni guardar nada.
 *
 * Por eso PUBLIC_SITE_URL tiene que estar disponible EN EL BUILD, no solo en
 * ejecución (el Dockerfile la recibe como ARG).
 */
/** Solo desarrollo. Astro no acepta un comodín "cualquier host": sus patrones
 *  con `*` exigen un punto (`*.dominio.com`), así que hay que listarlos. */
const LOCAL_HOSTS = [{ hostname: 'localhost' }, { hostname: '127.0.0.1' }];

function allowedDomains() {
  if (!siteUrl) {
    console.warn(
      '[config] PUBLIC_SITE_URL no está definida en el build.\n' +
        '         Solo se aceptarán peticiones desde localhost. En producción hay\n' +
        '         que pasarla como Build Arg de Docker o los formularios darán 403.',
    );
    return LOCAL_HOSTS;
  }
  try {
    const url = new URL(siteUrl);
    return [
      { hostname: url.hostname, protocol: url.protocol.replace(':', '') },
      // El healthcheck de Docker pega a localhost, no al dominio público.
      ...LOCAL_HOSTS,
    ];
  } catch {
    console.warn(`[config] PUBLIC_SITE_URL no es una URL válida: "${siteUrl}"`);
    return LOCAL_HOSTS;
  }
}

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  site: siteUrl || 'http://localhost:4321',
  security: {
    checkOrigin: true,
    allowedDomains: allowedDomains(),
  },
  vite: {
    plugins: [tailwindcss()],
    build: { sourcemap: false },
  },
});
