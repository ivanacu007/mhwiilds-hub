import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import type { Catalog, Item, Monster } from '../lib/catalog/types.ts';
import { itemIconColor, itemIconPath } from '../lib/catalog/item-icons.ts';
import { translatorFor, type Locale } from '../lib/i18n/index.ts';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Busca de dónde sale un material: primero el monstruo, luego el material.
 *
 * Se resuelve entero en el cliente con el catálogo que ya está en IndexedDB, así
 * que no hay ida y vuelta al servidor entre una elección y la otra.
 */
export default function MaterialFinder({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [monster, setMonster] = useState<Monster | null>(null);
  const [item, setItem] = useState<Item | null>(null);

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => {});
  }, []);

  /** Materiales que suelta el monstruo elegido, sin repetir. */
  const materials = useMemo(() => {
    if (!catalog || !monster) return [];
    const seen = new Map<number, Item>();
    for (const reward of monster.rewards) {
      const found = catalog.items.find((i) => i.id === reward.itemId);
      if (found) seen.set(found.id, found);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, monster]);

  const sources = useMemo(() => {
    if (!monster || !item) return [];
    const reward = monster.rewards.find((r) => r.itemId === item.id);
    return [...(reward?.conditions ?? [])].sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0));
  }, [monster, item]);

  if (!catalog) return <p class="py-4 text-sm text-base-500">{t('common.loading')}</p>;

  return (
    <div>
      <div class="grid gap-2 sm:grid-cols-2">
        <Combo
          label={t('finder.monster')}
          placeholder={t('finder.pickMonster')}
          options={catalog.monsters}
          value={monster}
          onPick={(m) => { setMonster(m); setItem(null); }}
          render={(m) => m.name}
        />
        <Combo
          label={t('finder.material')}
          placeholder={monster ? t('finder.pickMaterial') : t('finder.monsterFirst')}
          options={materials}
          value={item}
          onPick={setItem}
          render={(i) => i.name}
          disabled={!monster}
        />
      </div>

      {monster && item && (
        <div class="mt-3 rounded border border-base-800 bg-base-950 p-3">
          <h3 class="mb-2 flex items-center gap-2 text-sm font-medium">
            <Icon item={item} />
            {item.name}
            <span class="text-base-500">· {monster.name}</span>
          </h3>

          {sources.length === 0 ? (
            <p class="text-sm text-base-500">{t('finder.noResults')}</p>
          ) : (
            <ul class="space-y-1">
              {sources.map((c, i) => (
                <li key={i} class="flex items-baseline gap-2 text-sm">
                  <span class="min-w-0 flex-1">
                    {t(`cd.${c.kind}` as never)}
                    {c.rank && <span class="text-base-500"> · {t(`rk.${c.rank}` as never)}</span>}
                    {c.quantity > 1 && <span class="text-base-500"> · ×{c.quantity}</span>}
                  </span>
                  <span
                    class={`shrink-0 tabular-nums ${
                      (c.chance ?? 0) >= 50 ? 'text-jade-400' : 'text-base-300'
                    }`}
                  >
                    {c.chance != null ? `${c.chance}%` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <a
            href={`/monstruos/${monster.id}`}
            class="mt-2 inline-block text-xs text-ember-400 underline"
          >
            {t('finder.seeMonster')}
          </a>
        </div>
      )}

      {monster && !item && (
        <a
          href={`/monstruos/${monster.id}`}
          class="mt-3 inline-block text-sm text-ember-400 underline"
        >
          {t('finder.anyMaterial')} · {monster.name}
        </a>
      )}
    </div>
  );
}

function Icon({ item }: { item: Item }) {
  const path = itemIconPath(item.iconKind ?? undefined);
  const color = itemIconColor(item.iconColor ?? undefined);
  const style = path
    ? {
        width: 18, height: 18, backgroundColor: color,
        WebkitMask: `url("${path}") center/contain no-repeat`,
        mask: `url("${path}") center/contain no-repeat`,
      }
    : { width: 18, height: 18, borderRadius: 9, background: color, opacity: 0.45 };
  return <span style={{ display: 'inline-block', flexShrink: 0, ...style }} />;
}

/**
 * Selector con texto: no es un `<select>` porque con 34 monstruos y hasta 20
 * materiales lo que se quiere es escribir dos letras, no desplegar y buscar.
 */
function Combo<T extends { id: number }>({
  label, placeholder, options, value, onPick, render, disabled,
}: {
  label: string;
  placeholder: string;
  options: T[];
  value: T | null;
  onPick: (value: T) => void;
  render: (value: T) => string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Al elegir desde fuera (o al reiniciar el material) el texto debe seguirlo.
  useEffect(() => { setQuery(value ? render(value) : ''); }, [value]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const needle = normalize(query.trim());
  const matches = useMemo(() => {
    const list = value && normalize(render(value)) === needle ? options : options.filter(
      (o) => !needle || normalize(render(o)).includes(needle),
    );
    return list.slice(0, 40);
  }, [options, needle, value]);

  return (
    <div ref={box} class="relative">
      <label class="mb-1 block text-xs text-base-500">{label}</label>
      <input
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setOpen(true); }}
        class="w-full rounded border border-base-700 bg-base-900 px-3 py-2 text-sm outline-none focus:border-ember-500 disabled:opacity-40"
      />

      {open && !disabled && matches.length > 0 && (
        <ul class="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded border border-base-700 bg-base-950 shadow-lg">
          {matches.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => { onPick(option); setOpen(false); }}
                class="block w-full px-3 py-1.5 text-left text-sm hover:bg-base-850"
              >
                {render(option)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
