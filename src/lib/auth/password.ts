import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

// promisify resuelve la sobrecarga de 3 argumentos y pierde la que acepta
// opciones, que es justo la que hace falta para fijar N, r y p.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * scrypt viene en Node, así que no hay que compilar nada nativo en la imagen de
 * Docker (que es donde argon2 y bcrypt suelen dar lata en Alpine).
 */
const COST = 16384; // N
const BLOCK_SIZE = 8; // r
const PARALLELIZATION = 1; // p
const KEY_LENGTH = 64;
// scrypt necesita ~128 * N * r bytes; el default de Node se queda corto para N=16384.
const MAX_MEM = 128 * COST * BLOCK_SIZE * 2;

const PREFIX = 'scrypt';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEM,
  });
  return [
    PREFIX,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }

  const actual = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
    N, r, p,
    maxmem: 128 * N * r * 2,
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Reglas mínimas. No pido símbolos raros: largo es lo que sirve. */
export function validatePassword(password: string): string | null {
  if (password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (password.length > 200) return 'La contraseña es demasiado larga.';
  return null;
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return 'Correo inválido.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Correo inválido.';
  return null;
}
