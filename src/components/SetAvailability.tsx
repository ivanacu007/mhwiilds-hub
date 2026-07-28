import { useState } from 'preact/hooks';
import type { CatalogIndex } from '../lib/catalog/types.ts';
import { setAvailability, type OwnedForCrafting } from '../lib/catalog/availability.ts';
import type { ArmorKind } from '../lib/catalog/types.ts';
import { itemIconColor, itemIconPath } from '../lib/catalog/item-icons.ts';
import { MONSTER_ICONS, monsterIconPath } from '../lib/catalog/monster-icons.ts';
import type { Locale, Translator } from '../lib/i18n/index.ts';

/**
 * Franja de «¿puedo forjarlo?» al pie de un set.
 *
 * Cerrada dice lo justo —lo tienes, te falta forjar, o te falta material— y
 * abierta enseña qué pieza falta, qué material le falta y de qué monstruo sale,
 * que es lo que decide a qué cazar esta noche.
 */
const KIND_KEY = {
  head: 'piece.head', chest: 'piece.chest', arms: 'piece.arms',
  waist: 'piece.waist', legs: 'piece.legs',
} as const;

interface Props {
  index: CatalogIndex;
  owned: OwnedForCrafting;
  armorIds: Partial<Record<ArmorKind, number | undefined>>;
  locale: Locale;
  t: Translator;
}

export default function SetAvailability({ index, owned, armorIds, locale, t }: Props) {
  const [open, setOpen] = useState(false);
  const availability = setAvailability(index, owned, armorIds);
  if (availability.total === 0) return null;

  const pending = availability.pieces.filter((p) => !p.owned);
  const monsterName = new Map(MONSTER_ICONS.map((m) => [m.id, m[locale]]));

  // Tres estados y tres colores: lo tienes, te alcanza para forjarlo, o te
  // falta material. El del medio es el que más se consulta.
  const tone = availability.complete
    ? { color: 'var(--ok)', label: t('avail.complete') }
    : availability.craftable
      ? { color: 'var(--accent-hi)', label: t('avail.craftable', { count: pending.length }) }
      : { color: 'var(--warn)', label: t('avail.missingMaterials', { count: pending.length }) };

  return (
    <div class="border-t border-line">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        class="flex w-full items-center gap-2 px-3.5 py-1.5 text-left hover:bg-bg-2"
      >
        <span
          class="h-2 w-2 shrink-0"
          style={`background: ${tone.color}; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%)`}
          aria-hidden="true"
        />
        <span class="font-ui text-[12.5px] uppercase tracking-[0.06em]" style={`color: ${tone.color}`}>
          {tone.label}
        </span>
        <span class="num ml-auto text-[11px] text-text-3">
          {t('avail.ownedOf', { owned: availability.ownedCount, total: availability.total })}
        </span>
        {!availability.complete && <span class="text-[11px] text-text-3">{open ? '▾' : '▸'}</span>}
      </button>

      {open && !availability.complete && (
        <ul class="border-t border-line-soft">
          {pending.map((piece) => {
            const armor = index.armorById.get(piece.armorId);
            return (
              <li key={piece.armorId} class="border-b border-line-soft px-3.5 py-1.5 last:border-b-0">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span class="font-ui text-[11.5px] uppercase tracking-[0.1em] text-text-3">
                    {t(KIND_KEY[piece.kind])}
                  </span>
                  <span class="text-[13px]">{armor?.name}</span>
                  {piece.monsterId != null && (
                    <span class="ml-auto flex items-center gap-1.5 text-[11.5px] text-text-3">
                      <img
                        src={monsterIconPath(piece.monsterId)}
                        alt=""
                        width={16}
                        height={16}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => (e.currentTarget as HTMLImageElement).remove()}
                      />
                      {monsterName.get(piece.monsterId)}
                    </span>
                  )}
                </div>

                {piece.missing.length === 0 ? (
                  <p class="mt-0.5 text-[12px]" style="color: var(--accent-hi)">{t('avail.canForge')}</p>
                ) : (
                  <ul class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {piece.missing.map((material) => {
                      const item = index.itemById.get(material.itemId);
                      const path = itemIconPath(item?.iconKind ?? undefined);
                      const color = itemIconColor(item?.iconColor ?? undefined);
                      return (
                        <li key={material.itemId} class="flex items-center gap-1.5 text-[12px] text-text-2">
                          <span
                            style={path
                              ? `display:inline-block;width:14px;height:14px;background-color:${color};-webkit-mask:url("${path}") center/contain no-repeat;mask:url("${path}") center/contain no-repeat`
                              : `display:inline-block;width:14px;height:14px;border-radius:7px;background:${color};opacity:.45`}
                            aria-hidden="true"
                          />
                          {item?.name ?? `#${material.itemId}`}
                          {/* Lo que ya tienes va delante del total: «1/3» se lee
                              como progreso, «faltan 2» hay que restarlo. */}
                          <span class="num" style="color: var(--warn)">
                            {material.have}/{material.need}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
