import { Resend } from 'resend';

/**
 * El correo es opcional a propósito: sin RESEND_API_KEY la app funciona
 * completa, solo que el "olvidé mi contraseña" queda apagado y manda a entrar
 * con Google. Así el primer deploy no depende de tener dominio verificado.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY!);
  return client;
}

export async function sendPasswordReset(to: string, name: string, link: string): Promise<void> {
  if (!emailConfigured()) throw new Error('Resend no está configurado.');

  await getClient().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: 'Restablecer tu contraseña',
    text: [
      `Hola ${name},`,
      '',
      'Para poner una contraseña nueva, abre este enlace:',
      link,
      '',
      'El enlace vence en 1 hora y solo sirve una vez.',
      'Si no pediste esto, ignora el correo: tu cuenta sigue igual.',
    ].join('\n'),
  });
}
