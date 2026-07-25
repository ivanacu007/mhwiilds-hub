import type { APIRoute } from 'astro';
import { setGuild } from '../../lib/guild.ts';

/**
 * Cualquier miembro puede renombrar el gremio. Son amigos con invitación: meter
 * roles y permisos sería burocracia para un grupo que cabe en un chat. Queda
 * registrado quién fue el último en cambiarlo.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('No autorizado', { status: 401 });

  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim();
  const motto = String(form.get('motto') ?? '').trim();

  if (name.length < 2 || name.length > 50) {
    return new Response(null, {
      status: 303,
      headers: {
        location: `/gremio?error=${encodeURIComponent('El nombre debe tener entre 2 y 50 caracteres.')}`,
      },
    });
  }

  await setGuild(name, motto || null, locals.user.id);

  return new Response(null, {
    status: 303,
    headers: { location: `/gremio?aviso=${encodeURIComponent('Gremio actualizado.')}` },
  });
};
