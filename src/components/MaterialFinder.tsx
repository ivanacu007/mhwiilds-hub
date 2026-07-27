import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import type { Catalog, Item, Monster } from '../lib/catalog/types.ts';
import { itemIconColor, itemIconPath } from '../lib/catalog/item-icons.ts';
import { translatorFor, type Locale } from '../lib/i18n/index.ts';
import Combo from './ui/Combo.tsx';

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
    loadCatalog(['items', 'monsters']).then(setCatalog).catch(() => {});
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

  if (!catalog) return <p class="py-4 text-sm text-text-3">{t('common.loading')}</p>;

  return (
    <div>
      <div class="grid gap-2 sm:grid-cols-2">
        <Combo
          label={t('finder.monster')}
          placeholder={t('finder.pickMonster')}
          groups={[{ label: t('monsters.title'), items: catalog.monsters }]}
          value={monster}
          onPick={(m) => { setMonster(m); setItem(null); }}
          render={(m) => m.name}
          keyOf={(m) => m.id}
        />
        <Combo
          label={t('finder.material')}
          placeholder={monster ? t('finder.pickMaterial') : t('finder.monsterFirst')}
          groups={[{ label: t('finder.material'), items: materials }]}
          value={item}
          onPick={setItem}
          render={(i) => i.name}
          keyOf={(i) => i.id}
          disabled={!monster}
        />
      </div>

      {monster && item && (
        <div class="mt-3 rounded border border-bg-3 bg-bg-0 p-3">
          <h3 class="mb-2 flex items-center gap-2 text-sm font-medium">
            <Icon item={item} />
            {item.name}
            <span class="text-text-3">· {monster.name}</span>
          </h3>

          {sources.length === 0 ? (
            <p class="text-sm text-text-3">{t('finder.noResults')}</p>
          ) : (
            <ul class="space-y-1">
              {sources.map((c, i) => (
                <li key={i} class="flex items-baseline gap-2 text-sm">
                  <span class="min-w-0 flex-1">
                    {t(`cd.${c.kind}` as never)}
                    {c.rank && <span class="text-text-3"> · {t(`rk.${c.rank}` as never)}</span>}
                    {c.quantity > 1 && <span class="text-text-3"> · ×{c.quantity}</span>}
                  </span>
                  <span
                    class={`shrink-0 tabular-nums ${
                      (c.chance ?? 0) >= 50 ? 'text-ok' : 'text-text-2'
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
            class="mt-2 inline-block text-xs text-accent-hi underline"
          >
            {t('finder.seeMonster')}
          </a>
        </div>
      )}

      {monster && !item && (
        <a
          href={`/monstruos/${monster.id}`}
          class="mt-3 inline-block text-sm text-accent-hi underline"
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
