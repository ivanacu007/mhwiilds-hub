import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';

/**
 * Selector navegable.
 *
 * Resuelve el problema 3 del sistema: **nunca es un campo ciego**. Al enfocar
 * abre la lista completa sin escribir nada; escribir filtra; las flechas
 * navegan y Enter elige. Antes había que adivinar el nombre para que apareciera
 * algo, y quien escribía y pulsaba Enter se quedaba sin poder continuar.
 *
 * Los grupos existen porque las habilidades se leen por familia (armadura /
 * arma) y mezclarlas escondía las que importan.
 */
export interface ComboGroup<T> {
  label: string;
  items: T[];
}

interface Props<T> {
  label?: string;
  placeholder: string;
  groups: ComboGroup<T>[];
  value: T | null;
  onPick: (value: T) => void;
  render: (value: T) => string;
  /** Texto a la derecha de cada fila: nivel máximo, ranuras, lo que aplique. */
  meta?: (value: T) => string | null;
  keyOf: (value: T) => number | string;
  disabled?: boolean;
  /** «12 / 179» junto al campo, para saber cuánto se está filtrando. */
  countLabel?: (shown: number, total: number) => string;
  /** Pista de que el campo abre la lista completa; se muestra cerrado. */
  seeAllLabel?: string;
  /**
   * Grupo que se muestra al hojear sin escribir. Al buscar se miran todos.
   *
   * Sin esto, filtrar por pestaña también recortaba la búsqueda: «Attack Boost»
   * está clasificada como habilidad de arma, así que buscarla desde la pestaña
   * de armadura devolvía «—» sin decir que existe al lado.
   */
  browseGroup?: string;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function Combo<T>({
  label, placeholder, groups, value, onPick, render, meta, keyOf, disabled, countLabel, seeAllLabel,
  browseGroup,
}: Props<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<
    { left: number; width: number; below: number; above: number; up: boolean } | null
  >(null);

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      const target = e.target as Node;
      // La lista vive fuera del componente (ver abajo), así que hay que
      // preguntarle también a ella antes de cerrar.
      if (box.current?.contains(target) || listBox.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  /**
   * La lista se dibuja en el `body`, no dentro del componente.
   *
   * El panel que la contiene lleva `clip-path` para el bisel, y un `clip-path`
   * recorta a todos sus descendientes: con el panel corto (que es como está
   * antes de elegir nada) la lista salía cortada por abajo y no se veía. Ni
   * `absolute` ni `fixed` escapan de ahí, así que se saca del árbol y se
   * coloca a mano sobre el campo.
   */
  useEffect(() => {
    if (!open) return;

    const place = () => {
      const node = field.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      // Si abajo no caben las 320 px de lista, se abre hacia arriba.
      const room = window.innerHeight - r.bottom;
      setRect({
        left: r.left,
        width: r.width,
        below: r.bottom,
        above: window.innerHeight - r.top,
        up: room < 340 && r.top > room,
      });
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const needle = normalize(query.trim());
  const filtered = useMemo(
    () =>
      groups
        // Al hojear se respeta el grupo elegido; al buscar se miran todos, y
        // el encabezado de cada grupo dice de dónde salió cada resultado.
        .filter((g) => !!needle || !browseGroup || g.label === browseGroup)
        .map((g) => ({ ...g, items: g.items.filter((i) => !needle || normalize(render(i)).includes(needle)) }))
        .filter((g) => g.items.length > 0),
    [groups, needle, browseGroup],
  );

  const flat = useMemo(() => filtered.flatMap((g) => g.items), [filtered]);
  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  // Al cambiar el filtro, el cursor podría apuntar fuera de la lista.
  useEffect(() => { setCursor(0); }, [needle, groups]);

  const choose = (item: T) => {
    onPick(item);
    setQuery('');
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => {
        const next = e.key === 'ArrowDown' ? c + 1 : c - 1;
        return Math.max(0, Math.min(flat.length - 1, next));
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[cursor];
      if (item) choose(item);
      return;
    }
    if (e.key === 'Escape') setOpen(false);
  };

  // Mantener a la vista la fila del cursor al navegar con el teclado.
  useEffect(() => {
    if (!open) return;
    listBox.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  let index = -1;

  return (
    <div ref={box} class="relative">
      {label && <label class="mb-1 block font-ui text-xs uppercase tracking-wide text-text-3">{label}</label>}

      {/* La lupa y el «ver todas» no son adorno: el campo abre la lista entera
          al enfocarlo, y sin decirlo nadie lo intenta. Al abrirse, ese hueco
          pasa a mostrar cuánto se está filtrando. */}
      <div
        ref={field}
        class={`flex h-8 items-center gap-2 border bg-bg-0 px-2.5 ${
          open ? 'border-accent' : 'border-line-strong'
        } ${disabled ? 'opacity-40' : ''}`}
      >
        <span class="num shrink-0 text-[12px] text-text-3" aria-hidden="true">⌕</span>
        <input
          value={query}
          disabled={disabled}
          placeholder={value ? render(value) : placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls="combo-list"
          onFocus={() => setOpen(true)}
          onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setOpen(true); }}
          onKeyDown={onKey}
          class="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-text-3"
        />
        <span class="num shrink-0 text-[11px] text-text-3">
          {open && countLabel ? countLabel(flat.length, total) : seeAllLabel}
        </span>
      </div>

      {open && !disabled && rect && createPortal(
        <div
          id="combo-list"
          ref={listBox}
          role="listbox"
          class="fixed z-50 max-h-80 overflow-y-auto border border-line-strong bg-bg-2"
          style={{
            boxShadow: 'var(--shadow-2)',
            left: rect.left,
            width: rect.width,
            ...(rect.up ? { bottom: rect.above + 4 } : { top: rect.below + 4 }),
          }}
        >
          {filtered.length === 0 && (
            <p class="px-2 py-3 text-center text-xs text-text-3">—</p>
          )}
          {filtered.map((group) => (
            <div key={group.label}>
              <p class="sticky top-0 bg-bg-2 px-2 py-1 font-ui text-[11px] uppercase tracking-wide text-text-3">
                {group.label} <span class="num opacity-70">{group.items.length}</span>
              </p>
              {group.items.map((item) => {
                index += 1;
                const active = index === cursor;
                return (
                  <button
                    key={keyOf(item)}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-cursor={active}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => choose(item)}
                    class={`flex h-[30px] w-full items-center gap-2 px-2 text-left text-[13px] ${
                      active ? 'row-active' : 'hover:bg-bg-3'
                    }`}
                  >
                    <span class="min-w-0 flex-1 truncate">{render(item)}</span>
                    {meta?.(item) && <span class="num shrink-0 text-[11px] text-text-3">{meta(item)}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
