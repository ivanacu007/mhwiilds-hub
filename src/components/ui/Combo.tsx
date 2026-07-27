import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

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
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function Combo<T>({
  label, placeholder, groups, value, onPick, render, meta, keyOf, disabled, countLabel,
}: Props<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  const needle = normalize(query.trim());
  const filtered = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: g.items.filter((i) => !needle || normalize(render(i)).includes(needle)) }))
        .filter((g) => g.items.length > 0),
    [groups, needle],
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

      <div class="flex items-center gap-2">
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
          class="h-8 min-w-0 flex-1 rounded-[2px] border border-line bg-bg-1 px-2 text-[13px] outline-none focus:border-accent disabled:opacity-40"
        />
        {countLabel && open && (
          <span class="num shrink-0 text-[11px] text-text-3">{countLabel(flat.length, total)}</span>
        )}
      </div>

      {open && !disabled && (
        <div
          id="combo-list"
          ref={listBox}
          role="listbox"
          class="panel absolute z-30 mt-1 max-h-80 w-full overflow-y-auto"
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
        </div>
      )}
    </div>
  );
}
