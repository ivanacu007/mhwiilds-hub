/**
 * Paginación compartida por las listas del cliente y las del servidor.
 *
 * Todo lo que decide qué se muestra vive aquí para que ambas se comporten igual:
 * el mismo recorte, los mismos límites y los mismos números en los botones.
 */

export interface PageInfo {
  /** Página actual, empezando en 1 y ya recortada a un valor válido. */
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Índices para `slice`. */
  start: number;
  end: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** Posición del primer y último elemento mostrados, en base 1. */
  from: number;
  to: number;
}

export const PAGE_SIZES = [40, 80, 160];

/**
 * Por debajo de esto no se pagina: partir una lista corta esconde información
 * sin ahorrar nada. Los 34 monstruos y los 64 talismanes caen aquí.
 */
export const PAGINATION_THRESHOLD = 120;

export function paginate(total: number, rawPage: number, pageSize: number): PageInfo {
  const size = Math.max(1, Math.floor(pageSize) || PAGE_SIZES[0]);
  // Una lista vacía sigue siendo una página, o "página 1 de 0" quedaría raro.
  const totalPages = Math.max(1, Math.ceil(total / size));

  // Si se pide una página que ya no existe (por filtrar o por una URL vieja),
  // se cae a la última en vez de mostrar el vacío.
  const page = Math.min(Math.max(1, Math.floor(rawPage) || 1), totalPages);

  const start = (page - 1) * size;
  const end = Math.min(start + size, total);

  return {
    page,
    pageSize: size,
    total,
    totalPages,
    start,
    end,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    from: total === 0 ? 0 : start + 1,
    to: end,
  };
}

/**
 * Números a dibujar, con elipsis cuando hay muchas páginas: siempre la primera
 * y la última, más una ventana alrededor de la actual.
 */
export function pageNumbers(page: number, totalPages: number, window = 1): (number | '…')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages]);
  for (let p = page - window; p <= page + window; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let previous = 0;

  for (const p of sorted) {
    // Un solo hueco se rellena con el número, no con puntos: "1 … 3" es peor que "1 2 3".
    if (previous && p - previous === 2) out.push(previous + 1);
    else if (previous && p - previous > 2) out.push('…');
    out.push(p);
    previous = p;
  }

  return out;
}
