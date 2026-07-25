import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export const OAUTH_STATE_COOKIE = 'mhw_oauth_state';
export const OAUTH_INVITE_COOKIE = 'mhw_oauth_invite';

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function siteUrl(): string {
  return (process.env.PUBLIC_SITE_URL || 'http://localhost:4321').replace(/\/$/, '');
}

export function redirectUri(): string {
  return `${siteUrl()}/api/auth/google/callback`;
}

/** Guarda el state en una cookie corta y devuelve la URL a la que mandar al usuario. */
export function beginGoogleAuth(cookies: AstroCookies, inviteCode: string | null): string {
  const state = randomBytes(24).toString('base64url');

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: 10 * 60,
  };
  cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  if (inviteCode) {
    cookies.set(OAUTH_INVITE_COOKIE, inviteCode, cookieOptions);
  } else {
    cookies.delete(OAUTH_INVITE_COOKIE, { path: '/' });
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export function verifyState(cookies: AstroCookies, received: string | null): boolean {
  const expected = cookies.get(OAUTH_STATE_COOKIE)?.value;
  cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });
  if (!expected || !received) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

/**
 * Intercambia el código por tokens y lee el perfil del id_token.
 *
 * No se verifica la firma del id_token a propósito: viene directo del endpoint
 * de Google por HTTPS en una petición servidor-a-servidor, que es el caso en
 * que la propia documentación de Google permite saltarse la validación.
 */
export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    throw new Error(`Google rechazó el intercambio de código: ${res.status}`);
  }

  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error('Google no devolvió id_token.');

  const payloadSegment = tokens.id_token.split('.')[1];
  if (!payloadSegment) throw new Error('id_token con formato inesperado.');
  const claims = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!claims.sub || !claims.email) {
    throw new Error('El perfil de Google no trae sub o email.');
  }

  return {
    googleId: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified !== false,
    name: claims.name || claims.email.split('@')[0],
    picture: claims.picture ?? null,
  };
}
