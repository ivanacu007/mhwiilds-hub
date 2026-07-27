import { useState } from 'preact/hooks';
import { ARMOR_KINDS, type ArmorKind, type CatalogIndex } from '../lib/catalog/types.ts';
import { summarizeLoadout } from '../lib/catalog/loadout.ts';
import { MONSTER_ICONS } from '../lib/catalog/monster-icons.ts';
import type { Locale, Translator } from '../lib/i18n/index.ts';
import { slotSvg } from '../lib/ui/glyphs.ts';
import { gearIconStyle } from '../lib/ui/gear-icons.ts';

/**
 * El set que se está armando a mano, con lo que da tal como va.
 *
 * Se enseña incompleto a propósito: fijar una sola pieza y ver ya su defensa y
 * sus habilidades es la mitad de la gracia de hojear series. Las ranuras de
 * adorno se muestran libres y no se rellenan; de eso se encarga el buscador
 * cuando se le pide completar el set.
 */
const KIND_KEY = {
  head: 'piece.head', chest: 'piece.chest', arms: 'piece.arms',
  waist: 'piece.waist', legs: 'piece.legs',
} as const;

const RES_ORDER = ['fire', 'water', 'thunder', 'ice', 'dragon'] as const;

interface Props {
  index: CatalogIndex;
  locale: Locale;
  t: Translator;
  pinned: Partial<Record<ArmorKind, number>>;
  onUnpin: (kind: ArmorKind) => void;
  /**
   * El arma se elige en el panel de la izquierda, el mismo sitio que en modo
   * buscar. Aquí entra como una pieza más: sus habilidades cuentan y sus
   * ranuras se suman a las libres, sin que haga falta pedir nada al solver.
   */
  weaponId: number | null;
  onUnpinWeapon: () => void;
  onShowSkill: (skillId: number, level?: number) => void;
  onComplete: () => void;
  /** Si hay objetivos elegidos, completar con el buscador tiene sentido. */
  canComplete: boolean;
}

/** Nombre por defecto: la serie si todas las piezas son de una, si no el monstruo. */
function defaultName(index: CatalogIndex, locale: Locale, armorIds: number[]): string {
  const pieces = armorIds.map((id) => index.armorById.get(id)).filter((p) => p != null);
  if (pieces.length === 0) return 'Set';

  const setIds = new Set(pieces.map((p) => p!.setId));
  if (setIds.size === 1) {
    const only = index.armorSetById.get([...setIds][0] as number);
    if (only) return only.name;
  }

  const monsterIds = new Set(
    pieces.map((p) => (p!.setId != null ? index.armorSetById.get(p!.setId)?.monsterId ?? null : null)),
  );
  if (monsterIds.size === 1) {
    const entry = MONSTER_ICONS.find((m) => m.id === [...monsterIds][0]);
    if (entry) return entry[locale];
  }

  return pieces.map((p) => p!.name).join(' + ').slice(0, 60);
}

export default function LoadoutCard(props: Props) {
  const { index, locale, t, pinned, onUnpin, weaponId, onUnpinWeapon, onShowSkill } = props;
  const { onComplete, canComplete } = props;
  const [saving, setSaving] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle');
  const [slug, setSlug] = useState<string | null>(null);

  const weapon = weaponId != null ? index.weaponById.get(weaponId) ?? null : null;
  const summary = summarizeLoadout(index, {
    pieces: Object.fromEntries(
      ARMOR_KINDS.filter((kind) => pinned[kind] != null)
        .map((kind) => [kind, { armorId: pinned[kind]! }]),
    ),
    weaponId,
  });
  const freeSlots = [...summary.freeArmorSlots, ...summary.freeWeaponSlots];

  const save = async () => {
    setSaving('guardando');
    const armorIds = ARMOR_KINDS.map((kind) => pinned[kind]).filter((id): id is number => id != null);
    try {
      const res = await fetch('/api/sets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: defaultName(index, locale, armorIds), notes: null,
          weaponId, weaponDecorations: [],
          ...Object.fromEntries(
            ARMOR_KINDS.map((kind) => [
              kind,
              pinned[kind] != null ? { armorId: pinned[kind], decorations: [] } : null,
            ]),
          ),
          charmId: null, charmLevel: null, isPublic: true,
        }),
      });
      if (!res.ok) throw new Error();
      setSlug((await res.json()).slug);
      setSaving('guardado');
    } catch {
      setSaving('error');
    }
  };

  return (
    <article
      class="panel bevel-head"
      style={`border-left: 2px solid var(--slot-${Math.min(3, Math.max(1, freeSlots[0] ?? 1))})`}
    >
      <header class="flex min-h-[38px] flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-line bg-panel-head px-3.5 py-1">
        <span class="font-ui text-[16px] uppercase tracking-[0.1em] text-accent-hi">
          {t('builder.yourSet')}
        </span>
        <span class="num text-[11.5px] text-text-3">
          {t('builder.pinned', { count: summary.pieceCount })}
        </span>

        <span class="flex items-baseline gap-1.5">
          <span class="font-ui text-[11.5px] uppercase tracking-[0.1em] text-text-3">{t('builder.defense')}</span>
          <span class="num text-[15px] text-text-1">{summary.defense}</span>
        </span>

        <span class="flex items-baseline gap-1.5">
          <span class="font-ui text-[11.5px] uppercase tracking-[0.1em] text-text-3">{t('builder.res')}</span>
          {RES_ORDER.map((element) => {
            const value = summary.resistances[element] ?? 0;
            return (
              <span
                key={element}
                class="num text-[12.5px]"
                title={t(`el.${element}` as never)}
                style={`color: var(--el-${element}); opacity: ${value === 0 ? 0.4 : 1}`}
              >
                {value > 0 ? `+${value}` : value}
              </span>
            );
          })}
        </span>

        {freeSlots.length > 0 && (
          <span class="flex items-center gap-1.5">
            <span class="font-ui text-[11.5px] uppercase tracking-[0.1em] text-text-3">{t('builder.free')}</span>
            {freeSlots.map((level, i) => (
              <span key={i} dangerouslySetInnerHTML={{ __html: slotSvg(level, false, true) }} />
            ))}
          </span>
        )}

        <div class="ml-auto flex items-center gap-1.5">
          {slug && (
            <a
              href={`/set/${slug}`}
              class="font-ui flex h-[26px] items-center border border-accent bg-accent-weak px-2.5 text-[12.5px] uppercase tracking-[0.08em] text-accent-hi"
            >{t('builder.viewLink')}</a>
          )}
          {canComplete && (
            <button
              onClick={onComplete}
              class="font-ui flex h-[26px] items-center border border-line-strong bg-bg-2 px-2.5 text-[12.5px] uppercase tracking-[0.08em] text-text-2 hover:bg-bg-3 hover:text-text-1"
            >{t('builder.completeWithSearch')}</button>
          )}
          {/* Guardar pide al menos una pieza de armadura: la API rechaza un set
              que solo lleve arma, y es mejor no ofrecerlo que fallar al pulsar. */}
          <button
            onClick={save}
            title={summary.pieceCount === 0 ? t('builder.saveNeedsPiece') : undefined}
            disabled={summary.pieceCount === 0 || saving === 'guardando' || saving === 'guardado'}
            class="font-ui flex h-[26px] items-center border border-line-strong bg-bg-2 px-2.5 text-[12.5px] uppercase tracking-[0.08em] text-text-2 hover:bg-bg-3 hover:text-text-1 disabled:opacity-40"
          >
            {saving === 'guardado' ? t('builder.saved')
              : saving === 'guardando' ? t('builder.saving')
              : t('builder.save')}
          </button>
        </div>
      </header>

      <div class="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div class="min-w-0 lg:border-r lg:border-line">
          {/* El arma primero, como en la ficha del juego. Lleva ataque donde las
              piezas llevan defensa: son las dos cifras que se comparan, y no
              tiene sentido dejar la columna en blanco. */}
          {weapon && (
            <div class="grid min-h-[34px] grid-cols-[64px_26px_minmax(0,1fr)_56px_auto_24px] items-center gap-2 border-b border-line bg-bg-1 px-3 py-[3px]">
              <span class="font-ui text-[12px] uppercase tracking-[0.1em] text-text-3">
                {t('piece.weapon')}
              </span>
              <span class="grid h-[22px] w-[22px] place-items-center border border-line-strong bg-tile">
                <span style={gearIconStyle(weapon.kind, 14, 'var(--accent-hi)')} />
              </span>
              <span class="min-w-0 truncate text-[14px]">
                {weapon.name}
                {weapon.element && (
                  <span class="num ml-2 text-[11.5px]" style={`color: var(--el-${weapon.element.kind})`}>
                    {t(`el.${weapon.element.kind}` as never)} {weapon.element.damage}
                  </span>
                )}
                {weapon.affinity !== 0 && (
                  <span
                    class="num ml-2 text-[11.5px] text-text-3"
                    style={weapon.affinity < 0 ? 'color: var(--danger)' : undefined}
                  >
                    {t('builder.affinityShort')} {weapon.affinity > 0 ? '+' : ''}{weapon.affinity}%
                  </span>
                )}
              </span>
              <span class="num text-right text-[12.5px] text-text-2" title={t('builder.attackShort')}>
                {weapon.attack}
              </span>
              <span class="flex gap-[3px]">
                {weapon.slots.map((level, i) => (
                  <span key={i} dangerouslySetInnerHTML={{ __html: slotSvg(level, false, true) }} />
                ))}
              </span>
              <button
                onClick={onUnpinWeapon}
                aria-label={`${t('builder.unpin')} ${weapon.name}`}
                class="grid h-6 w-6 place-items-center border border-line bg-bg-2 text-[12px] text-text-3 hover:border-danger hover:text-danger"
              >✕</button>
            </div>
          )}

          {ARMOR_KINDS.map((kind) => {
            const piece = pinned[kind] != null ? index.armorById.get(pinned[kind]!) : undefined;
            return (
              <div
                key={kind}
                class="grid min-h-[34px] grid-cols-[64px_26px_minmax(0,1fr)_56px_auto_24px] items-center gap-2 border-b border-line-soft px-3 py-[3px]"
              >
                <span class="font-ui text-[12px] uppercase tracking-[0.1em] text-text-3">
                  {t(KIND_KEY[kind])}
                </span>
                <span class="grid h-[22px] w-[22px] place-items-center border border-line-strong bg-tile">
                  <span style={gearIconStyle(kind, 14, `var(${piece ? '--text-2' : '--text-3'})`)} />
                </span>
                <span class={`min-w-0 truncate text-[14px] ${piece ? '' : 'text-text-3'}`}>
                  {piece?.name ?? '—'}
                </span>
                <span class="num text-right text-[12.5px] text-text-2">{piece?.defense ?? ''}</span>
                <span class="flex gap-[3px]">
                  {(piece?.slots ?? []).map((level, i) => (
                    <span key={i} dangerouslySetInnerHTML={{ __html: slotSvg(level, false, true) }} />
                  ))}
                </span>
                {piece ? (
                  <button
                    onClick={() => onUnpin(kind)}
                    aria-label={`${t('builder.unpin')} ${piece.name}`}
                    class="grid h-6 w-6 place-items-center border border-line bg-bg-2 text-[12px] text-text-3 hover:border-danger hover:text-danger"
                  >✕</button>
                ) : <span />}
              </div>
            );
          })}
        </div>

        <div class="flex min-w-0 flex-col gap-2 border-t border-line p-3 lg:border-t-0">
          {summary.pieceCount === 0 && !weapon ? (
            <p class="py-2 text-[12.5px] text-text-3">{t('builder.emptySet')}</p>
          ) : (
            <>
              {/* La pista va aquí y no en cada tarjeta de resultado: repetida
                  ocho veces sería ruido, y esta tarjeta está siempre en pantalla
                  mientras se hojea. */}
              <h3 class="font-ui text-[12px] uppercase tracking-[0.12em] text-text-3">
                {t('builder.achieved')}
                <span class="ml-2 normal-case tracking-normal opacity-80">
                  {t('builder.skillHint')}
                </span>
              </h3>
              <div class="flex flex-wrap gap-1">
                {summary.skills.map((skill) => (
                  <button
                    key={skill.skillId}
                    onClick={() => onShowSkill(skill.skillId, skill.level)}
                    title={t('builder.skillInfo')}
                    class="inline-flex items-center gap-1.5 border border-line bg-bg-3 px-2 py-[3px] text-[12.5px] text-text-2 hover:border-accent hover:text-text-1"
                  >
                    {skill.name}
                    <span class="num text-[11px] text-accent-hi">{skill.level}/{skill.max}</span>
                  </button>
                ))}
              </div>

              {(summary.setBonuses.length > 0 || summary.groupBonuses.length > 0) && (
                <>
                  <h3 class="font-ui mt-0.5 text-[12px] uppercase tracking-[0.12em] text-text-3">
                    {t('builder.setBonus')}
                  </h3>
                  <ul class="text-[12.5px] leading-[1.35] text-text-2">
                    {[...summary.setBonuses, ...summary.groupBonuses].map((bonus, i) => {
                      const last = bonus.ranks.at(-1)!;
                      return (
                        <li key={i}>
                          {/* También se abre: un bonus de serie es una habilidad
                              del mismo catálogo, y es donde menos se sabe qué
                              hace. */}
                          <button
                            onClick={() => onShowSkill(last.skillId, last.level)}
                            title={t('builder.skillInfo')}
                            class="max-w-full truncate text-left hover:text-accent-hi"
                          >
                            {bonus.name}
                            <span class="num text-text-3">
                              {' · '}{t('builder.bonusPieces', { count: last.pieces })}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
