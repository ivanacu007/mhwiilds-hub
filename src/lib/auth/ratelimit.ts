/**
 * Limitador por ventana fija, en memoria.
 *
 * Basta porque la app corre en un solo contenedor. Si algún día se escala a
 * varias réplicas hay que moverlo a Mongo o Redis, porque cada réplica llevaría
 * su propia cuenta.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Barrido perezoso: evita que el Map crezca sin control con IPs de una sola visita.
let lastSweep = Date.now();
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/**
 * IP del cliente. Detrás del Traefik de Dokploy la conexión siempre viene de la
 * red interna, así que el valor útil está en X-Forwarded-For.
 */
export function clientIp(request: Request, fallback: string | null): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || fallback || 'desconocida';
}
