/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import('./lib/auth/session.ts').PublicUser | null;
  }
}
