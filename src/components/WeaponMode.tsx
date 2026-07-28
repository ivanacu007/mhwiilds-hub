import { useMemo } from 'preact/hooks';
import type { CatalogIndex } from '../lib/catalog/types.ts';
import { weaponSkillsFor, type SkillReason } from '../lib/builder/weapon-skills.ts';
import { profilesFor, isSuggested, type ArmorProfile } from '../lib/builder/armor-profiles.ts';
import { rankWeapons, availableRankings } from '../lib/builder/weapon-ranking.ts';
import type { Translator, TranslationKey } from '../lib/i18n/index.ts';
import { gearIconStyle } from '../lib/ui/gear-icons.ts';

/**
 * Partir del arma que juegas.
 *
 * La pantalla está partida en dos porque el juego lo está: arriba, lo que
 * persigue el arma —y eso solo se consigue con el arma y sus joyas—, y abajo,
 * los sets de armadura, que en Wilds no dependen del arma sino del estilo. Es la
 * consecuencia directa de que ninguna pieza de armadura conceda una habilidad de
 * arma: si esto fuera una sola lista, mentiría sobre de dónde sale cada cosa.
 */
interface Props {
  index: CatalogIndex;
  t: Translator;
  weaponKinds: string[];
  kind: string;
  onKind: (kind: string) => void;
  /** decorationId -> cantidad que tienes. */
  ownedDecorations: Record<string, number>;
  onShowSkill: (skillId: number, level?: number) => void;
  onRunProfile: (profile: ArmorProfile) => void;
  runningProfile: string | null;
}

const REASON_ORDER: SkillReason[] = [
  'exclusive', 'charge', 'block', 'melee', 'artillery', 'gauge', 'ranged', 'ko', 'universal',
];

export default function WeaponMode(props: Props) {
  const { index, t, weaponKinds, kind, onKind, ownedDecorations, onShowSkill } = props;
  const { onRunProfile, runningProfile } = props;

  /** decorationId por habilidad, solo joyas de arma. */
  const jewelsBySkill = useMemo(() => {
    const map = new Map<number, { id: number; name: string; slot: number; owned: number }[]>();
    for (const deco of index.catalog.decorations) {
      if (deco.kind !== 'weapon') continue;
      for (const grant of deco.skills) {
        if (!map.has(grant.skillId)) map.set(grant.skillId, []);
        map.get(grant.skillId)!.push({
          id: deco.id,
          name: deco.name,
          slot: deco.slot,
          owned: ownedDecorations[String(deco.id)] ?? 0,
        });
      }
    }
    return map;
  }, [index, ownedDecorations]);

  const grouped = useMemo(() => {
    if (!kind) return [];
    const hints = weaponSkillsFor(kind);
    return REASON_ORDER
      .map((why) => ({ why, skills: hints.filter((h) => h.why === why) }))
      .filter((g) => g.skills.length > 0);
  }, [kind]);

  const profiles = useMemo(() => profilesFor(kind), [kind]);

  const rankings = useMemo(() => {
    if (!kind) return [];
    const weapons = index.catalog.weapons;
    return availableRankings(weapons, kind)
      .map((key) => ({ key, entries: rankWeapons(weapons, kind, key, 5) }));
  }, [index, kind]);

  return (
    <>
      {/* El mismo mosaico que el panel de objetivos: se reconocen por la forma. */}
      <div class="border border-line bg-bg-1 p-2">
        <div class="grid grid-cols-7 gap-1">
          {weaponKinds.map((wk) => {
            const on = kind === wk;
            return (
              <button
                key={wk}
                onClick={() => onKind(on ? '' : wk)}
                title={t(`wk.${wk}` as TranslationKey)}
                aria-label={t(`wk.${wk}` as TranslationKey)}
                aria-pressed={on}
                class={`grid h-[34px] place-items-center border ${
                  on ? 'border-accent bg-accent-weak' : 'border-line bg-bg-2 hover:border-line-strong'
                }`}
              >
                <span style={gearIconStyle(wk, 22, `var(${on ? '--accent-hi' : '--text-3'})`)} />
              </button>
            );
          })}
        </div>
      </div>

      {!kind && <p class="py-16 text-center text-text-3">{t('builder.pickWeaponKind')}</p>}

      {kind && (
        <section class="panel bevel-head">
          <header class="flex min-h-[34px] flex-wrap items-center gap-2 border-b border-accent bg-panel-head px-3 py-1">
            <span style={gearIconStyle(kind, 18, 'var(--accent-hi)')} />
            <h2 class="font-ui text-[15px] uppercase tracking-[0.1em] text-accent-hi">
              {t('builder.weaponSkillsFor', { weapon: t(`wk.${kind}` as TranslationKey) })}
            </h2>
          </header>
          {/* El aviso no es decoración: es justo lo que confunde de Wilds. */}
          <p class="border-b border-line-soft px-3 py-1.5 text-[12px] text-text-3">
            {t('builder.armorCantGive')}
          </p>

          {grouped.map((group) => (
            <div key={group.why} class="border-b border-line-soft last:border-b-0">
              <h3 class="font-ui bg-bg-1 px-3 py-1 text-[11.5px] uppercase tracking-[0.1em] text-text-3">
                {t(`why.${group.why}` as TranslationKey)}
              </h3>
              <ul>
                {group.skills.map(({ skillId }) => {
                  const skill = index.skillById.get(skillId);
                  if (!skill) return null;
                  const jewels = jewelsBySkill.get(skillId) ?? [];
                  const ownedJewels = jewels.filter((j) => j.owned > 0);
                  return (
                    <li
                      key={skillId}
                      class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-soft px-3 py-1 last:border-b-0"
                    >
                      <button
                        onClick={() => onShowSkill(skillId)}
                        title={t('builder.skillInfo')}
                        class="text-[13.5px] hover:text-accent-hi"
                      >{skill.name}</button>
                      <span class="num text-[11px] text-text-3">
                        {t('builder.max')} {skill.ranks.length}
                      </span>
                      {jewels.length === 0 ? (
                        <span class="font-ui ml-auto text-[11px] uppercase tracking-[0.06em] text-text-3">
                          {t('builder.onlyFromWeapon')}
                        </span>
                      ) : (
                        <span class="num ml-auto text-[11px] text-text-3">
                          {t('builder.jewelsThatGive', { count: jewels.length })}
                          {ownedJewels.length > 0 && (
                            <span style="color: var(--ok)"> · {t('builder.youOwnJewel')}</span>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {kind && rankings.length > 0 && (
        <section class="panel bevel-head">
          <header class="flex min-h-[34px] flex-wrap items-center gap-2 border-b border-accent bg-panel-head px-3 py-1">
            <h2 class="font-ui text-[15px] uppercase tracking-[0.1em] text-accent-hi">
              {t('builder.bestWeapons')}
            </h2>
          </header>
          {/* Sin esto la tabla parecería una tier list, y no lo es: falta el
              afilado, que decide media comparación. */}
          <p class="border-b border-line-soft px-3 py-1.5 text-[12px] text-text-3">
            {t('builder.rankingCaveat')}
          </p>

          {rankings.map(({ key, entries }) => (
            <div key={key} class="border-b border-line-soft last:border-b-0">
              <h3 class="font-ui bg-bg-1 px-3 py-1 text-[11.5px] uppercase tracking-[0.1em] text-text-3">
                {t(`rank.${key}` as TranslationKey)}
              </h3>
              <ul>
                {entries.map(({ weapon }) => (
                  <li
                    key={weapon.id}
                    class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-line-soft px-3 py-1 last:border-b-0"
                  >
                    <span class="min-w-0 truncate text-[13.5px]">
                      {weapon.name}
                      <span class="num ml-2 text-[11px] text-text-3">r{weapon.rarity}</span>
                    </span>
                    <span class="num flex items-center gap-2.5 text-[11.5px] text-text-2">
                      <span class={key === 'raw' || key === 'effective' ? 'text-accent-hi' : ''}>
                        {t('builder.attackShort')} {weapon.attack}
                      </span>
                      <span
                        class={key === 'effective' ? 'text-accent-hi' : ''}
                        style={weapon.affinity < 0 ? 'color: var(--danger)' : undefined}
                      >
                        {t('builder.affinityShort')} {weapon.affinity > 0 ? '+' : ''}{weapon.affinity}%
                      </span>
                      {weapon.element && (
                        <span
                          class={key === 'element' ? 'font-semibold' : ''}
                          style={`color: var(--el-${weapon.element.kind})`}
                        >
                          {t(`el.${weapon.element.kind}` as TranslationKey)} {weapon.element.damage}
                        </span>
                      )}
                      <span class={`flex gap-[3px] ${key === 'slots' ? 'text-accent-hi' : ''}`}>
                        {weapon.slots.length > 0
                          ? weapon.slots.map((level, i) => <span key={i}>[{level}]</span>)
                          : <span class="text-text-3">—</span>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {kind && (
        <section class="panel bevel-head">
          <header class="flex min-h-[34px] flex-wrap items-center gap-2 border-b border-accent bg-panel-head px-3 py-1">
            <h2 class="font-ui text-[15px] uppercase tracking-[0.1em] text-accent-hi">
              {t('builder.profiles')}
            </h2>
          </header>
          <p class="border-b border-line-soft px-3 py-1.5 text-[12px] text-text-3">
            {t('builder.profilesBlurb')}
          </p>

          <ul class="grid gap-2 p-2 sm:grid-cols-2">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <button
                  onClick={() => onRunProfile(profile)}
                  disabled={runningProfile !== null}
                  class={`flex h-full w-full flex-col items-start gap-1 border p-2.5 text-left disabled:opacity-50 ${
                    isSuggested(kind, profile.id)
                      ? 'border-accent bg-accent-weak'
                      : 'border-line bg-bg-2 hover:border-line-strong'
                  }`}
                >
                  <span class="flex w-full items-center gap-2">
                    <span class="font-ui text-[14px] uppercase tracking-[0.08em] text-text-1">
                      {t(profile.nameKey as TranslationKey)}
                    </span>
                    {isSuggested(kind, profile.id) && (
                      <span class="font-ui text-[10.5px] uppercase tracking-[0.08em] text-accent-hi">
                        {t('builder.suggested')}
                      </span>
                    )}
                    {runningProfile === profile.id && (
                      <span class="num ml-auto text-[11px] text-text-3">{t('builder.generating')}</span>
                    )}
                  </span>
                  <span class="text-[12px] leading-[1.35] text-text-3">
                    {t(profile.blurbKey as TranslationKey)}
                  </span>
                  <span class="mt-0.5 flex flex-wrap gap-1">
                    {profile.targets.map((target) => (
                      <span
                        key={target.skillId}
                        class="num border border-line bg-bg-3 px-1.5 py-[1px] text-[11px] text-text-2"
                      >
                        {index.skillById.get(target.skillId)?.name} {target.level}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
