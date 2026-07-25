import type { APIRoute } from 'astro';
import { destroySession } from '../../../lib/auth/session.ts';

export const POST: APIRoute = async ({ cookies }) => {
  await destroySession(cookies);
  return new Response(null, { status: 303, headers: { location: '/' } });
};
