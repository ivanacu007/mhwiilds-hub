import { useMemo, useState } from 'preact/hooks';
import { ARMOR_KINDS, type ArmorPiece, type ArmorSet, type CatalogIndex } from '../lib/catalog/types.ts';
import { MONSTER_ICONS, MONSTER_SORT_ORDER, monsterIconPath } from '../lib/catalog/monster-icons.ts';
import type { Locale, Translator } from '../lib/i18n/index.ts';
import Combo from './ui/Combo.tsx';
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
  /**
   * Piezas marcadas. Qué significa la marca lo decide quien lo usa: en el
   * armador son las fijadas para el set, en el inventario las que ya forjaste.
   */
  selected: Set<number>;
  onToggle: (piece: ArmorPiece) => void;
  /** Rótulo del botón que marca la serie entera; cambia según qué se marca. */
  selectAllLabel: string;
  onShowSkill: (skillId: number, level?: number) => void;
  /** Ids de armadura forjada, para el filtro «solo forjadas». Null = sin filtro. */
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

/**
 * Entrada del selector de monstruo. `all` no filtra y `generic` deja solo las
 * series sin monstruo; el resto es el id del monstruo.
 */
interface MonsterOption {
  key: 'all' | 'generic' | number;
  name: string;
}

export default function SeriesBrowser(props: Props) {
  const { index, locale, t, selected, onToggle, selectAllLabel, onShowSkill, ownedArmor } = props;
  const [query, setQuery] = useState('');
  const [monster, setMonster] = useState<MonsterOption | null>(null);
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
        // El nombre del monstruo entra en el filtro: buscar «omega» busca su
        // armadura, y las piezas de Omega Planetes no se llaman así. Antes solo
        // salían las que llevaban la palabra en el nombre, que no es ninguna.
        haystack: normalize(
          [set.name, monsterId != null ? monsterName.get(monsterId)! : '', ...pieces.map((p) => p.name)].join(' '),
        ),
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

  // Solo los monstruos que tienen serie: ofrecer los 34 y que trece devuelvan
  // vacío sería prometer lo que no hay. `groups` ya viene en orden de guía.
  const monsterOptions = useMemo<MonsterOption[]>(() => [
    { key: 'all', name: t('builder.allMonsters') },
    ...groups.map((group) => ({
      key: group.monsterId ?? ('generic' as const),
      name: group.monsterId == null ? t('builder.genericSeries') : group.name,
    })),
  ], [groups, t]);

  const needle = normalize(query.trim());
  const filtered = useMemo(() => {
    const picked = monster && monster.key !== 'all' ? monster.key : null;
    return groups
      .filter((group) => picked == null || (picked === 'generic' ? group.monsterId == null : group.monsterId === picked))
      .map((group) => (needle
        ? { ...group, series: group.series.filter((s) => s.haystack.includes(needle)) }
        : group))
      .filter((group) => group.series.length > 0);
  }, [groups, needle, monster]);

  const total = filtered.reduce((n, group) => n + group.series.length, 0);

  return (
    <>
      {/* Dos maneras de acotar, porque se llega por dos caminos: sabiendo de qué
          monstruo es la armadura, o recordando media palabra de su nombre. */}
      <div class="grid gap-2 border border-line bg-bg-1 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
        <Combo
          placeholder={t('builder.filterMonster')}
          groups={[{ label: t('finder.monster'), items: monsterOptions }]}
          value={monster}
          onPick={setMonster}
          render={(option) => option.name}
          keyOf={(option) => option.key}
          countLabel={(shown, total) => `${shown} / ${total}`}
          seeAllLabel={t('ui.seeAll')}
        />
        <input
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder={t('builder.filterSeries')}
          class="h-8 min-w-0 border border-line-strong bg-bg-0 px-2.5 text-[14px] outline-none focus:border-accent"
        />
        <span class="num text-[11px] text-text-3 sm:pl-1">
          {t('builder.seriesCount', { count: total })}
        </span>
      </div>

      {total === 0 && <p class="py-10 text-center text-text-3">{t('builder.noSeriesMatch')}</p>}

      {filtered.map((group) => {
        // Al filtrar se abre solo: buscar «Rathalos» o elegirlo en el selector y
        // encontrarse la cabecera cerrada sería pedir dos clics para ver lo que
        // ya se pidió.
        const expanded = needle || (monster && monster.key !== 'all')
          ? true
          : open.has(group.monsterId);
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
                selected={selected}
                onToggle={onToggle}
                selectAllLabel={selectAllLabel}
                onShowSkill={onShowSkill}
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
  selected: Set<number>;
  onToggle: (piece: ArmorPiece) => void;
  selectAllLabel: string;
  onShowSkill: (skillId: number, level?: number) => void;
}) {
  const { series, index, t, selected, onToggle, selectAllLabel, onShowSkill } = props;
  const { set, pieces } = series;

  const bonuses = [
    ...set.setBonus.map((rank) => ({ rank, label: t('builder.setBonus') })),
    ...set.groupBonus.map((rank) => ({ rank, label: t('builder.groupBonus') })),
  ];

  return (
    <div class="border-b border-line-soft last:border-b-0">
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 bg-bg-1 px-3 py-1">
        <h3 class="font-ui text-[13.5px] uppercase tracking-[0.08em] text-text-1">{set.name}</h3>
        {/* Solo lo que falte: `onToggle` alterna, así que llamarlo sobre una
            pieza ya marcada la desmarcaría y el botón dejaría la serie a medias. */}
        <button
          onClick={() => { for (const piece of pieces) if (!selected.has(piece.id)) onToggle(piece); }}
          class="font-ui flex h-[22px] items-center border border-line-strong bg-bg-2 px-2 text-[11.5px] uppercase tracking-[0.06em] text-text-3 hover:border-accent hover:text-accent-hi"
        >{selectAllLabel}</button>

        {bonuses.length > 0 && (
          <span class="ml-auto flex flex-wrap items-center gap-1.5">
            {bonuses.map(({ rank, label }, i) => (
              <button
                key={i}
                onClick={() => onShowSkill(rank.skillId, rank.level)}
                title={rank.description ?? label}
                class="num border border-line px-1.5 py-[1px] text-[11px] text-text-2 hover:border-accent hover:text-accent-hi"
              >
                {rank.name ?? index.skillById.get(rank.skillId)?.name}
                <span class="text-text-3"> · {t('builder.bonusPieces', { count: rank.pieces })}</span>
              </button>
            ))}
          </span>
        )}
      </div>

      {pieces.map((piece) => {
        const isPinned = selected.has(piece.id);
        return (
          <button
            key={piece.id}
            onClick={() => onToggle(piece)}
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
