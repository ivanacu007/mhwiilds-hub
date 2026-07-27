import { useMemo, useState } from 'preact/hooks';
import { ARMOR_KINDS, type ArmorKind, type ArmorPiece, type ArmorSet, type CatalogIndex } from '../lib/catalog/types.ts';
import { MONSTER_ICONS, MONSTER_SORT_ORDER, monsterIconPath } from '../lib/catalog/monster-icons.ts';
import type { Locale, Translator } from '../lib/i18n/index.ts';
import { slotSvg } from '../lib/ui/glyphs.ts';
import { gearIconStyle } from '../lib/ui/gear-icons.ts';

/**
 * Las series de armadura del juego, agrupadas por el monstruo del que salen.
 *
 * Es la mitad «caja de equipo» del armador: aquí se hojea y se toman piezas
 * sueltas, en vez de describir un objetivo y dejar que el solver decida. De qué
 * monstruo es cada serie no lo dice la API; se deduce al cargar el catálogo (ver
 * src/lib/catalog/monster-armor.ts) y llega en `armorSet.monsterId`.
 *
 * Los grupos nacen plegados: son 194 series de cinco piezas y pintarlas todas de
 * golpe son mil filas que nadie pidió.
 */
interface Props {
  index: CatalogIndex;
  locale: Locale;
  t: Translator;
  pinned: Partial<Record<ArmorKind, number>>;
  onPin: (kind: ArmorKind, armorId: number) => void;
  /** Ids de armadura forjada, o null si da igual. */
  ownedArmor: Set<number> | null;
}

const KIND_KEY = {
  head: 'piece.head', chest: 'piece.chest', arms: 'piece.arms',
  waist: 'piece.waist', legs: 'piece.legs',
} as const;

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface Series {
  set: ArmorSet;
  pieces: ArmorPiece[];
  /** Nombre de la serie y de sus piezas, ya normalizado, para filtrar. */
  haystack: string;
}

interface Group {
  monsterId: number | null;
  name: string;
  series: Series[];
}

export default function SeriesBrowser({ index, locale, t, pinned, onPin, ownedArmor }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<number | null>>(new Set());

  const groups = useMemo(() => {
    const monsterName = new Map(MONSTER_ICONS.map((entry) => [entry.id, entry[locale]]));
    const byMonster = new Map<number | null, Series[]>();

    for (const set of index.armorSetById.values()) {
      const pieces = set.pieceIds
        .map((id) => index.armorById.get(id))
        .filter((piece): piece is ArmorPiece => piece != null)
        .filter((piece) => !ownedArmor || ownedArmor.has(piece.id))
        .sort((a, b) => ARMOR_KINDS.indexOf(a.kind) - ARMOR_KINDS.indexOf(b.kind));
      if (pieces.length === 0) continue;

      // El monstruo sin icono ni nombre conocido cuenta como serie genérica: es
      // preferible a una cabecera vacía.
      const monsterId = set.monsterId != null && monsterName.has(set.monsterId) ? set.monsterId : null;
      const entry: Series = {
        set,
        pieces,
        haystack: normalize([set.name, ...pieces.map((p) => p.name)].join(' ')),
      };
      const list = byMonster.get(monsterId);
      if (list) list.push(entry);
      else byMonster.set(monsterId, [entry]);
    }

    const out: Group[] = [];
    for (const [monsterId, series] of byMonster) {
      if (monsterId == null) continue;
      out.push({
        monsterId,
        name: monsterName.get(monsterId)!,
        series: series.sort((a, b) => a.set.name.localeCompare(b.set.name)),
      });
    }
    // Orden de la guía de campo, como en el resto de la app; las genéricas al
    // final porque son el cajón de sastre, no una entrada más.
    out.sort((a, b) =>
      (MONSTER_SORT_ORDER.get(a.monsterId!) ?? 99) - (MONSTER_SORT_ORDER.get(b.monsterId!) ?? 99));

    const generic = byMonster.get(null);
    if (generic) {
      out.push({
        monsterId: null,
        name: '',
        series: generic.sort((a, b) => a.set.name.localeCompare(b.set.name)),
      });
    }
    return out;
    // `t` se queda fuera a propósito: se rehace en cada render del padre, y con
    // ella en la lista este `useMemo` volvía a agrupar las 194 series con cada
    // tecla del filtro. `locale`, que es de lo que depende de verdad, sí está.
  }, [index, locale, ownedArmor]);

  const needle = normalize(query.trim());
  const filtered = useMemo(() => {
    if (!needle) return groups;
    return groups
      .map((group) => ({ ...group, series: group.series.filter((s) => s.haystack.includes(needle)) }))
      .filter((group) => group.series.length > 0);
  }, [groups, needle]);

  const total = filtered.reduce((n, group) => n + group.series.length, 0);

  return (
    <>
      <div class="flex min-h-8 flex-wrap items-center gap-2 border border-line bg-bg-1 px-3 py-[3px]">
        <input
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder={t('builder.filterSeries')}
          class="h-[26px] min-w-0 flex-1 border border-line-strong bg-bg-0 px-2 text-[13.5px] outline-none focus:border-accent"
        />
        <span class="num text-[11px] text-text-3">{t('builder.seriesCount', { count: total })}</span>
      </div>

      {total === 0 && <p class="py-10 text-center text-text-3">{t('builder.noSeriesMatch')}</p>}

      {filtered.map((group) => {
        // Al filtrar se abre solo: buscar «Rathalos» y encontrarse cabeceras
        // cerradas sería pedir dos clics para ver lo que ya se pidió.
        const expanded = needle ? true : open.has(group.monsterId);
        return (
          <section key={group.monsterId ?? 'generic'} class="panel">
            <button
              onClick={() => setOpen((prev) => {
                const next = new Set(prev);
                if (!next.delete(group.monsterId)) next.add(group.monsterId);
                return next;
              })}
              aria-expanded={expanded}
              class="flex w-full items-center gap-2.5 border-b border-line bg-panel-head px-3 py-1.5 text-left hover:bg-bg-3"
            >
              <span class="bevel-sm grid h-7 w-7 shrink-0 place-items-center overflow-hidden bg-tile">
                {group.monsterId != null ? (
                  <img
                    src={monsterIconPath(group.monsterId)}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    decoding="async"
                    class="h-full w-full object-contain"
                    onError={(e) => (e.currentTarget as HTMLImageElement).remove()}
                  />
                ) : (
                  <span style={gearIconStyle('chest', 15, 'var(--text-3)')} />
                )}
              </span>
              <span class="font-ui min-w-0 flex-1 truncate text-[15px] uppercase tracking-[0.08em] text-accent-hi">
                {group.monsterId == null ? t('builder.genericSeries') : group.name}
              </span>
              <span class="num text-[11px] text-text-3">
                {t('builder.seriesCount', { count: group.series.length })}
              </span>
              <span class="text-[11px] text-text-3">{expanded ? '▾' : '▸'}</span>
            </button>

            {group.monsterId == null && expanded && (
              <p class="border-b border-line-soft px-3 py-1.5 text-[12px] text-text-3">
                {t('builder.genericSeriesNote')}
              </p>
            )}

            {expanded && group.series.map((series) => (
              <SeriesRow
                key={series.set.id}
                series={series}
                index={index}
                t={t}
                pinned={pinned}
                onPin={onPin}
              />
            ))}
          </section>
        );
      })}
    </>
  );
}

function SeriesRow(props: {
  series: Series;
  index: CatalogIndex;
  t: Translator;
  pinned: Partial<Record<ArmorKind, number>>;
  onPin: (kind: ArmorKind, armorId: number) => void;
}) {
  const { series, index, t, pinned, onPin } = props;
  const { set, pieces } = series;

  const bonuses = [
    ...set.setBonus.map((rank) => ({ rank, label: t('builder.setBonus') })),
    ...set.groupBonus.map((rank) => ({ rank, label: t('builder.groupBonus') })),
  ];

  return (
    <div class="border-b border-line-soft last:border-b-0">
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 bg-bg-1 px-3 py-1">
        <h3 class="font-ui text-[13.5px] uppercase tracking-[0.08em] text-text-1">{set.name}</h3>
        <button
          onClick={() => { for (const piece of pieces) onPin(piece.kind, piece.id); }}
          class="font-ui flex h-[22px] items-center border border-line-strong bg-bg-2 px-2 text-[11.5px] uppercase tracking-[0.06em] text-text-3 hover:border-accent hover:text-accent-hi"
        >{t('builder.pinWholeSeries')}</button>

        {bonuses.length > 0 && (
          <span class="ml-auto flex flex-wrap items-center gap-1.5">
            {bonuses.map(({ rank, label }, i) => (
              <span
                key={i}
                title={rank.description ?? label}
                class="num border border-line px-1.5 py-[1px] text-[11px] text-text-2"
              >
                {rank.name ?? index.skillById.get(rank.skillId)?.name}
                <span class="text-text-3"> · {t('builder.bonusPieces', { count: rank.pieces })}</span>
              </span>
            ))}
          </span>
        )}
      </div>

      {pieces.map((piece) => {
        const isPinned = pinned[piece.kind] === piece.id;
        return (
          <button
            key={piece.id}
            onClick={() => onPin(piece.kind, piece.id)}
            aria-pressed={isPinned}
            class={`grid w-full grid-cols-[58px_24px_minmax(0,1fr)_46px_auto] items-center gap-2 px-3 py-[3px] text-left ${
              isPinned ? 'bg-accent-weak' : 'hover:bg-bg-2'
            }`}
          >
            <span class="font-ui text-[11.5px] uppercase tracking-[0.1em] text-text-3">
              {t(KIND_KEY[piece.kind])}
            </span>
            <span class="grid h-[21px] w-[21px] place-items-center border border-line-strong bg-tile">
              <span style={gearIconStyle(piece.kind, 13, `var(${isPinned ? '--accent-hi' : '--text-2'})`)} />
            </span>
            <span class={`min-w-0 truncate text-[13.5px] ${isPinned ? 'text-accent-hi' : ''}`}>
              {piece.name}
              {piece.skills.length > 0 && (
                <span class="ml-2 text-[11.5px] text-text-3">
                  {piece.skills
                    .map((g) => `${index.skillById.get(g.skillId)?.name ?? ''} ${g.level}`)
                    .join(' · ')}
                </span>
              )}
            </span>
            <span class="num text-right text-[12px] text-text-2">{piece.defense}</span>
            <span class="flex gap-[3px]">
              {piece.slots.map((level, i) => (
                <span key={i} dangerouslySetInnerHTML={{ __html: slotSvg(level, false, true) }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
