import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import { ARMOR_KINDS, type Catalog } from '../lib/catalog/types.ts';
import type { Solution, SolveRequest, SolveResponse } from '../lib/solver/types.ts';
import { INTL_LOCALE, translatorFor, type Locale, type Translator } from '../lib/i18n/index.ts';
import Combo from './ui/Combo.tsx';
import { slotSvg } from '../lib/ui/glyphs.ts';

const KIND_KEY = {
  head: 'piece.head', chest: 'piece.chest', arms: 'piece.arms',
  waist: 'piece.waist', legs: 'piece.legs',
} as const;

interface Target { skillId: number; level: number; }

export default function SetBuilder({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [inventory, setInventory] = useState<any>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [weaponId, setWeaponId] = useState<number | null>(null);
  const [weaponKind, setWeaponKind] = useState('');
  const [onlyOwnedArmor, setOnlyOwnedArmor] = useState(false);
  const [skillTab, setSkillTab] = useState<'armor' | 'weapon'>('armor');
  const [sortBy, setSortBy] = useState<'defense' | 'slots'>('defense');
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const worker = useRef<Worker | null>(null);
  const nextId = useRef(1);
  const pending = useRef(new Map<number, (r: SolveResponse) => void>());

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        const [cat, res] = await Promise.all([loadCatalog(), fetch('/api/inventory')]);
        if (disposed) return;
        setCatalog(cat);
        setInventory(res.ok ? await res.json() : { decorations: {}, charms: {}, armor: [] });

        const w = new Worker(new URL('../lib/solver/worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (event) => {
          const data = event.data;
          if (data.type === 'resultado') {
            pending.current.get(data.id)?.(data.response);
            pending.current.delete(data.id);
          } else if (data.type === 'error') {
            pending.current.get(data.id)?.({
              ok: false, reason: 'sin-solucion', unreachable: [], missingDecorations: [], elapsedMs: 0,
            });
            pending.current.delete(data.id);
            setLoadError(data.error);
          }
        };
        w.postMessage({ type: 'catalogo', catalog: cat });
        worker.current = w;
      } catch (err) {
        if (!disposed) setLoadError(err instanceof Error ? err.message : 'Error cargando datos.');
      }
    })();

    return () => {
      disposed = true;
      worker.current?.terminate();
    };
  }, []);

  const skillById = useMemo(
    () => new Map((catalog?.skills ?? []).map((s) => [s.id, s])),
    [catalog],
  );
  const decoById = useMemo(
    () => new Map((catalog?.decorations ?? []).map((d) => [d.id, d])),
    [catalog],
  );
  const armorById = useMemo(
    () => new Map((catalog?.armor ?? []).map((a) => [a.id, a])),
    [catalog],
  );
  const charmById = useMemo(
    () => new Map((catalog?.charms ?? []).map((c) => [c.id, c])),
    [catalog],
  );

  /**
   * La lista completa, agrupada y filtrable. Antes era una búsqueda que exigía
   * dos letras y mostraba ocho resultados como mucho, así que no había forma de
   * ver qué habilidades existen ni de llegar a una cuyo nombre no recuerdas.
   */
  const skillGroups = useMemo(() => {
    if (!catalog) return [] as { kind: 'armor' | 'weapon'; skills: Catalog['skills'] }[];
    // El filtrado por texto vive dentro del selector; aquí solo se agrupa y se
    // quitan las ya elegidas.
    const pick = (kind: 'armor' | 'weapon') =>
      catalog.skills
        .filter((s) => s.kind === kind)
        .filter((s) => !targets.some((t) => t.skillId === s.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    return [
      { kind: 'armor' as const, skills: pick('armor') },
      { kind: 'weapon' as const, skills: pick('weapon') },
    ].filter((g) => g.skills.length > 0);
  }, [catalog, targets]);

  const addSkill = (skillId: number) => {
    setTargets((list) => (list.some((t) => t.skillId === skillId) ? list : [...list, { skillId, level: 1 }]));
  };

  const weaponKinds = useMemo(() => {
    const seen = new Set((catalog?.weapons ?? []).map((w) => w.kind));
    return [...seen].sort();
  }, [catalog]);

  /**
   * Igual que las habilidades: se puede navegar la lista, no solo buscar. Son
   * 1188 armas, así que el tipo acota a unas 85 antes de filtrar por texto.
   */
  const weaponMatches = useMemo(() => {
    if (!catalog) return [];
    return catalog.weapons
      .filter((w) => !weaponKind || w.kind === weaponKind)
      .sort((a, b) => a.rarity - b.rarity || a.name.localeCompare(b.name));
  }, [catalog, weaponKind]);

  const run = async () => {
    if (!worker.current || targets.length === 0 || !inventory) return;
    setBusy(true);
    setResult(null);

    const id = nextId.current++;
    const request: SolveRequest = {
      targets,
      inventory: {
        decorations: inventory.decorations ?? {},
        charms: inventory.charms ?? {},
        // null = "considera todo el juego"; útil para planear qué forjar.
        armor: onlyOwnedArmor ? (inventory.armor ?? []) : null,
      },
      weaponId,
      rank: 'all',
      maxResults: 8,
      timeBudgetMs: 2500,
    };

    const response = await new Promise<SolveResponse>((resolve) => {
      pending.current.set(id, resolve);
      worker.current!.postMessage({ type: 'resolver', id, request });
    });

    setResult(response);
    setBusy(false);
  };

  const sorted = useMemo(() => {
    if (!result?.ok) return [];
    const list = [...result.solutions];
    // Reordenar en cliente evita relanzar la búsqueda solo por cambiar el criterio.
    return sortBy === 'slots'
      ? list.sort((a, b) => {
          const free = (s: Solution) => [...s.freeArmorSlots, ...s.freeWeaponSlots].reduce((n, x) => n + x, 0);
          return free(b) - free(a) || b.defense - a.defense;
        })
      : list.sort((a, b) => b.defense - a.defense);
  }, [result, sortBy]);

  if (loadError && !catalog) return <p class="py-10 text-center text-red-300">{loadError}</p>;
  if (!catalog || !inventory) return <p class="py-10 text-center text-base-500">{t('common.loading')}</p>;

  const weapon = weaponId ? catalog.weapons.find((w) => w.id === weaponId) : null;

  const armorSkills = skillGroups.find((g) => g.kind === 'armor')?.skills ?? [];
  const weaponSkills = skillGroups.find((g) => g.kind === 'weapon')?.skills ?? [];
  const visibleSkills = skillTab === 'armor' ? armorSkills : weaponSkills;
  const totalSkills = catalog.skills.filter((s) => s.kind === 'armor' || s.kind === 'weapon').length;

  return (
    <div class="grid gap-4 lg:grid-cols-[380px_1fr]">
      {/* Panel fijo: la lista de resultados es larga y hay que poder cambiar un
          objetivo sin subir. `self-start` evita que la columna se estire, que es
          lo que impediría que `sticky` hiciera nada. */}
      <aside class="lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <section class="panel bevel">
          <header class="flex items-baseline gap-2 border-b border-line px-3 py-2">
            <h2 class="font-ui text-[15px] uppercase tracking-[0.08em] text-accent-hi">
              {t('builder.wantedSkills')}
            </h2>
            <span class="num ml-auto text-[12px] text-text-3">
              {t('builder.targetCount', { shown: targets.length, total: totalSkills })}
            </span>
          </header>

          <div class="px-3 py-2">
            <Combo
              placeholder={t('builder.filterSkills')}
              groups={[{
                label: skillTab === 'armor' ? t('builder.armorSkills') : t('builder.weaponSkills'),
                items: visibleSkills,
              }]}
              value={null}
              onPick={(skill) => addSkill(skill.id)}
              render={(skill) => skill.name}
              meta={(skill) => `${t('builder.max')} ${skill.ranks.reduce((m, r) => Math.max(m, r.level), 1)}`}
              keyOf={(skill) => skill.id}
              countLabel={(shown, total) => `${shown} / ${total}`}
            />

            {/* Dos pestañas y no una lista mezclada: las de arma solo salen del
                arma, así que decidir en cuál se busca es parte del problema. */}
            <div class="mt-2 flex items-center gap-1">
              {([['armor', armorSkills.length], ['weapon', weaponSkills.length]] as const).map(
                ([kind, count]) => (
                  <button
                    key={kind}
                    onClick={() => setSkillTab(kind)}
                    class={`bevel-sm font-ui px-2.5 py-1 text-[12px] uppercase tracking-wide ${
                      skillTab === kind
                        ? 'border border-accent bg-accent-weak text-accent-hi'
                        : 'border border-line text-text-3 hover:text-text-1'
                    }`}
                  >
                    {kind === 'armor' ? t('builder.armorSkills') : t('builder.weaponSkills')}
                    <span class="num ml-1.5 opacity-70">{count}</span>
                  </button>
                ),
              )}
              <label class="ml-auto flex cursor-pointer items-center gap-1.5 text-[12px] text-text-2">
                <input
                  type="checkbox"
                  checked={onlyOwnedArmor}
                  onChange={(e) => setOnlyOwnedArmor((e.target as HTMLInputElement).checked)}
                />
                {t('builder.onlyForged')}
              </label>
            </div>
          </div>

          {targets.length === 0 ? (
            <p class="px-3 pb-3 text-center text-[12px] text-text-3">{t('builder.addSkillHint')}</p>
          ) : (
            <ul class="border-t border-line">
              {targets.map((target) => {
                const skill = skillById.get(target.skillId);
                const max = skill?.ranks.reduce((m, r) => Math.max(m, r.level), 1) ?? 1;
                const setLevel = (level: number) =>
                  setTargets((list) =>
                    list.map((x) => (x.skillId === target.skillId ? { ...x, level } : x)));
                return (
                  <li
                    key={target.skillId}
                    class="flex h-8 items-center gap-2 border-b border-line px-3 last:border-0"
                  >
                    <span class="min-w-0 flex-1 truncate text-[13px]">{skill?.name}</span>
                    {skill?.kind === 'weapon' && (
                      <span class="shrink-0 text-[11px] text-accent" title={t('builder.weaponSkills')}>⚔</span>
                    )}
                    <button
                      onClick={() => setLevel(Math.max(1, target.level - 1))}
                      disabled={target.level <= 1}
                      aria-label={`− ${skill?.name}`}
                      class="grid h-[22px] w-[22px] place-items-center border border-line text-text-2 hover:bg-bg-3 disabled:opacity-30"
                    >−</button>
                    <span class="num w-9 text-center text-[13px]">
                      {target.level}<span class="text-text-3">/{max}</span>
                    </span>
                    <button
                      onClick={() => setLevel(Math.min(max, target.level + 1))}
                      disabled={target.level >= max}
                      aria-label={`+ ${skill?.name}`}
                      class="grid h-[22px] w-[22px] place-items-center border border-line text-text-2 hover:bg-bg-3 disabled:opacity-30"
                    >+</button>
                    <button
                      onClick={() => setTargets((list) => list.filter((x) => x.skillId !== target.skillId))}
                      aria-label={`${t('builder.remove')} ${skill?.name}`}
                      class="grid h-[22px] w-[22px] place-items-center text-text-3 hover:text-danger"
                    >✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section class="panel bevel mt-3">
          <header class="flex items-baseline gap-2 border-b border-line px-3 py-2">
            <h2 class="font-ui text-[15px] uppercase tracking-[0.08em] text-accent-hi">
              {t('piece.weapon')}
            </h2>
            <span class="ml-auto font-ui text-[12px] uppercase tracking-wide text-text-3">
              {t('builder.optional')}
            </span>
          </header>

          <div class="px-3 py-2">
            {weapon ? (
              <div class="flex items-center gap-2">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[14px]">{weapon.name}</p>
                  <p class="num text-[12px] text-text-3">
                    ATQ {weapon.attack}
                    {weapon.element && ` · ${t(`el.${weapon.element.kind}` as never)} ${weapon.element.damage}`}
                    {weapon.affinity !== 0 && ` · ${weapon.affinity > 0 ? '+' : ''}${weapon.affinity}%`}
                  </p>
                </div>
                <span class="flex shrink-0 gap-0.5">
                  {weapon.slots.map((level, i) => (
                    <span key={i} dangerouslySetInnerHTML={{ __html: slotSvg(level, false, true) }} />
                  ))}
                </span>
                <button
                  onClick={() => setWeaponId(null)}
                  aria-label={t('builder.remove')}
                  class="grid h-[22px] w-[22px] place-items-center text-text-3 hover:text-danger"
                >✕</button>
              </div>
            ) : (
              <>
                <select
                  value={weaponKind}
                  onChange={(e) => setWeaponKind((e.target as HTMLSelectElement).value)}
                  class="mb-2 h-8 w-full rounded-[2px] border border-line bg-bg-1 px-2 text-[13px] outline-none focus:border-accent"
                >
                  <option value="">{t('builder.allWeaponKinds')}</option>
                  {weaponKinds.map((kind) => (
                    <option key={kind} value={kind}>{t(`wk.${kind}` as never)}</option>
                  ))}
                </select>
                <Combo
                  placeholder={t('builder.filterWeapons')}
                  groups={[{ label: t('piece.weapon'), items: weaponMatches }]}
                  value={null}
                  onPick={(w) => setWeaponId(w.id)}
                  render={(w) => w.name}
                  meta={(w) => w.slots.map((sl) => `[${sl}]`).join('') || '—'}
                  keyOf={(w) => w.id}
                  countLabel={(shown, total) => `${shown} / ${total}`}
                />
                <p class="mt-1.5 text-[12px] leading-snug text-text-3">{t('builder.weaponHelp')}</p>
              </>
            )}
          </div>
        </section>

        <button
          onClick={run}
          disabled={busy || targets.length === 0}
          class="bevel font-ui mt-3 w-full bg-accent py-2.5 text-[15px] uppercase tracking-[0.08em] text-bg-0 hover:bg-accent-hi disabled:opacity-40"
        >
          {busy ? t('builder.searching') : t('builder.search')}
        </button>

        {result?.ok && (
          <p class="num mt-1.5 text-center text-[11px] text-text-3">
            {t('builder.searchTime', { ms: result.elapsedMs })}
          </p>
        )}
      </aside>

      <section>
        {!result && !busy && (
          <p class="py-16 text-center text-text-3">{t('builder.pickAndSearch')}</p>
        )}

        {result && !result.ok && result.reason === 'falta-arma' && (
          <div class="bevel border border-accent bg-accent-weak p-4">
            <h2 class="font-ui mb-1 text-[17px] uppercase tracking-wide text-accent-hi">
              {t('builder.needWeapon')}
            </h2>
            <p class="text-sm text-text-2">
              {result.weaponSkills.map((x) => skillById.get(x.skillId)?.name).join(', ')}
              {' '}{result.weaponSkills.length === 1 ? t('builder.needWeaponOne') : t('builder.needWeaponMany')}:{' '}
              {t('builder.needWeaponBody')}
            </p>
          </div>
        )}

        {result && !result.ok && result.reason === 'sin-solucion' && (
          <div class="panel bevel p-4">
            <h2 class="font-ui mb-1 text-[17px] uppercase tracking-wide">{t('builder.noSolution')}</h2>
            {result.unreachable.length > 0 && (
              <p class="mb-3 text-sm text-text-2">
                {t('builder.shortOn', {
                  skills: result.unreachable
                    .map((x) => `${skillById.get(x.skillId)?.name} ${x.level}`).join(', '),
                })}
              </p>
            )}
            {result.missingDecorations.length > 0 && (
              <>
                <h3 class="font-ui mb-1 text-[13px] uppercase tracking-wide text-text-3">
                  {t('builder.youWouldNeed')}
                </h3>
                <ul class="space-y-1 text-sm">
                  {result.missingDecorations.map((m) => (
                    <li key={m.decorationId} class="flex gap-2">
                      <span class="num text-accent">{m.quantity}×</span>
                      <span>{decoById.get(m.decorationId)?.name ?? m.decorationId}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {result?.ok && (
          <>
            <div class="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2">
              <h2 class="font-ui text-[17px] uppercase tracking-[0.06em]">
                {t('builder.results', { count: sorted.length })}
              </h2>
              <p class="text-[13px] text-text-3">
                {t('builder.ofCombos', { count: result.searched.toLocaleString(INTL_LOCALE[locale]) })}
                {result.truncated && t('builder.truncated')}
              </p>
              <div class="ml-auto flex items-center gap-1">
                <span class="font-ui text-[12px] uppercase tracking-wide text-text-3">
                  {t('builder.sortBy')}
                </span>
                {([['defense', t('builder.sortDefense')], ['slots', t('builder.sortSlots')]] as const).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      class={`bevel-sm font-ui px-2 py-1 text-[12px] uppercase tracking-wide ${
                        sortBy === key
                          ? 'border border-accent bg-accent-weak text-accent-hi'
                          : 'border border-line text-text-3 hover:text-text-1'
                      }`}
                    >{label}</button>
                  ),
                )}
              </div>
            </div>

            {sorted.length === 0 && (
              <p class="py-10 text-center text-text-3">{t('builder.noneMatch')}</p>
            )}

            <div class="space-y-3">
              {sorted.map((solution, i) => (
                <SolutionCard
                  key={i}
                  index={i + 1}
                  solution={solution}
                  armorById={armorById}
                  decoById={decoById}
                  charmById={charmById}
                  skillById={skillById}
                  targets={targets}
                  t={t}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const RES_ORDER = ['fire', 'water', 'thunder', 'ice', 'dragon'] as const;

function SolutionCard(props: {
  index: number;
  solution: Solution;
  armorById: Map<number, Catalog['armor'][number]>;
  decoById: Map<number, Catalog['decorations'][number]>;
  charmById: Map<number, Catalog['charms'][number]>;
  skillById: Map<number, Catalog['skills'][number]>;
  targets: Target[];
  t: Translator;
}) {
  const { index, solution, armorById, decoById, charmById, skillById, targets, t } = props;
  const [saving, setSaving] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle');
  const [slug, setSlug] = useState<string | null>(null);

  const save = async () => {
    setSaving('guardando');
    const name = targets
      .map((x) => `${skillById.get(x.skillId)?.name} ${x.level}`)
      .join(' + ')
      .slice(0, 60);
    try {
      const res = await fetch('/api/sets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name || 'Set', notes: null,
          weaponId: solution.weaponId, weaponDecorations: solution.weaponDecorations,
          head: solution.pieces.head, chest: solution.pieces.chest, arms: solution.pieces.arms,
          waist: solution.pieces.waist, legs: solution.pieces.legs,
          charmId: solution.charmId, charmLevel: solution.charmLevel, isPublic: true,
        }),
      });
      if (!res.ok) throw new Error();
      setSlug((await res.json()).slug);
      setSaving('guardado');
    } catch {
      setSaving('error');
    }
  };

  const freeSlots = [...solution.freeArmorSlots, ...solution.freeWeaponSlots];

  return (
    <article class="panel bevel" style="box-shadow: inset 2px 0 0 var(--accent), var(--shadow-2)">
      {/* Cabecera: lo que decide entre un set y otro va aquí, no repartido. */}
      <header class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-3 py-2">
        <span class="font-ui text-[15px] uppercase tracking-[0.08em] text-accent-hi">
          {t('builder.setNumber', { n: index })}
        </span>
        <span class="font-ui text-[12px] uppercase tracking-wide text-text-3">
          {t('builder.defense')} <strong class="num ml-0.5 text-[15px] text-text-1">{solution.defense}</strong>
        </span>

        <span class="flex items-baseline gap-1.5">
          <span class="font-ui text-[12px] uppercase tracking-wide text-text-3">{t('builder.res')}</span>
          {RES_ORDER.map((element) => {
            const value = solution.resistances[element] ?? 0;
            return (
              <span
                key={element}
                class="num text-[13px]"
                title={t(`el.${element}` as never)}
                style={`color: var(--el-${element}); opacity: ${value === 0 ? 0.4 : 1}`}
              >
                {value > 0 ? `+${value}` : value}
              </span>
            );
          })}
        </span>

        {freeSlots.length > 0 && (
          <span class="flex items-center gap-1">
            <span class="font-ui text-[12px] uppercase tracking-wide text-text-3">{t('builder.free')}</span>
            {freeSlots.map((level, i) => (
              <span key={i} dangerouslySetInnerHTML={{ __html: slotSvg(level, false, true) }} />
            ))}
          </span>
        )}

        <div class="ml-auto flex items-center gap-1">
          {slug && (
            <a
              href={`/set/${slug}`}
              class="bevel-sm font-ui border border-line px-2 py-1 text-[12px] uppercase tracking-wide hover:bg-bg-3"
            >{t('builder.viewLink')}</a>
          )}
          <button
            onClick={save}
            disabled={saving === 'guardando' || saving === 'guardado'}
            class="bevel-sm font-ui border border-line px-2 py-1 text-[12px] uppercase tracking-wide hover:bg-bg-3 disabled:opacity-40"
          >
            {saving === 'guardado' ? t('builder.saved')
              : saving === 'guardando' ? t('builder.saving')
              : t('builder.save')}
          </button>
        </div>
      </header>

      <div class="grid gap-3 p-3 lg:grid-cols-[1fr_260px]">
        <ul>
          {ARMOR_KINDS.map((kind) => {
            const piece = armorById.get(solution.pieces[kind].armorId);
            if (!piece) return null;
            const placed = new Map(
              solution.pieces[kind].decorations.map((d) => [d.slotIndex, d.decorationId]),
            );
            return (
              <li key={kind} class="flex h-8 items-center gap-2 border-b border-line last:border-0">
                <span class="font-ui w-16 shrink-0 text-[11px] uppercase tracking-wide text-text-3">
                  {t(KIND_KEY[kind])}
                </span>
                <span class="min-w-0 flex-1 truncate text-[14px]">{piece.name}</span>
                <span class="num shrink-0 text-[13px] text-text-2">{piece.defense}</span>
                <span class="flex w-16 shrink-0 justify-end gap-0.5">
                  {piece.slots.map((level, i) => (
                    <span
                      key={i}
                      title={placed.has(i) ? decoById.get(placed.get(i)!)?.name : undefined}
                      dangerouslySetInnerHTML={{ __html: slotSvg(level, placed.has(i), true) }}
                    />
                  ))}
                </span>
              </li>
            );
          })}

          {solution.charmId && (
            <li class="flex h-8 items-center gap-2">
              <span class="font-ui w-16 shrink-0 text-[11px] uppercase tracking-wide text-text-3">
                {t('piece.charm')}
              </span>
              <span class="min-w-0 flex-1 truncate text-[14px]">
                {charmById.get(solution.charmId)?.name} {solution.charmLevel}
              </span>
            </li>
          )}
        </ul>

        <div>
          <h3 class="font-ui mb-1 text-[11px] uppercase tracking-wide text-text-3">
            {t('builder.achieved')}
          </h3>
          <div class="mb-3 flex flex-wrap gap-1">
            {Object.entries(solution.skills)
              .map(([id, level]) => ({ id: Number(id), skill: skillById.get(Number(id)), level }))
              .filter((x) => x.skill)
              .sort((a, b) => {
                const at = targets.some((x) => x.skillId === a.id) ? 0 : 1;
                const bt = targets.some((x) => x.skillId === b.id) ? 0 : 1;
                return at - bt || b.level - a.level;
              })
              .map((entry) => {
                const isTarget = targets.some((x) => x.skillId === entry.id);
                const max = entry.skill!.ranks.reduce((m, r) => Math.max(m, r.level), 1);
                return (
                  <span
                    key={entry.id}
                    class={`bevel-sm px-1.5 py-0.5 text-[12px] ${
                      isTarget ? 'bg-accent-weak text-accent-hi' : 'bg-bg-3 text-text-2'
                    }`}
                  >
                    {entry.skill!.name}
                    <span class="num ml-1 opacity-80">{entry.level}/{max}</span>
                  </span>
                );
              })}
          </div>

          <h3 class="font-ui mb-1 text-[11px] uppercase tracking-wide text-text-3">
            {t('builder.placedDecos')}
          </h3>
          <ul class="space-y-0.5 text-[12px] text-text-2">
            {ARMOR_KINDS.flatMap((kind) => solution.pieces[kind].decorations)
              .concat(solution.weaponDecorations)
              .map((d, i) => (
                <li key={i} class="truncate">{decoById.get(d.decorationId)?.name}</li>
              ))}
            {ARMOR_KINDS.every((k) => solution.pieces[k].decorations.length === 0) &&
              solution.weaponDecorations.length === 0 && (
                <li class="text-text-3">—</li>
              )}
          </ul>
        </div>
      </div>
    </article>
  );
}
