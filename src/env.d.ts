/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import('./lib/auth/session.ts').PublicUser | null;
    locale: import('./lib/i18n/index.ts').Locale;
    /** Traductor ya atado al idioma de la petición. */
    t: import('./lib/i18n/index.ts').Translator;
  }
}
