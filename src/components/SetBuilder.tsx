import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import { ARMOR_KINDS, type Catalog } from '../lib/catalog/types.ts';
import type { Solution, SolveRequest, SolveResponse } from '../lib/solver/types.ts';
import { INTL_LOCALE, translatorFor, type Locale, type Translator } from '../lib/i18n/index.ts';

const KIND_KEY = {
  head: 'piece.head', chest: 'piece.chest', arms: 'piece.arms',
  waist: 'piece.waist', legs: 'piece.legs',
} as const;

interface Target { skillId: number; level: number; }

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function SetBuilder({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [inventory, setInventory] = useState<any>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [weaponId, setWeaponId] = useState<number | null>(null);
  const [weaponQuery, setWeaponQuery] = useState('');
  const [skillQuery, setSkillQuery] = useState('');
  const [onlyOwnedArmor, setOnlyOwnedArmor] = useState(false);
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
    const needle = normalize(skillQuery.trim());
    const pick = (kind: 'armor' | 'weapon') =>
      catalog.skills
        .filter((s) => s.kind === kind)
        .filter((s) => !needle || normalize(s.name).includes(needle))
        .filter((s) => !targets.some((t) => t.skillId === s.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    return [
      { kind: 'armor' as const, skills: pick('armor') },
      { kind: 'weapon' as const, skills: pick('weapon') },
    ].filter((g) => g.skills.length > 0);
  }, [catalog, skillQuery, targets]);

  const addSkill = (skillId: number) => {
    setTargets((list) => (list.some((t) => t.skillId === skillId) ? list : [...list, { skillId, level: 1 }]));
  };

  const weaponMatches = useMemo(() => {
    if (!catalog || weaponQuery.trim().length < 2) return [];
    const needle = normalize(weaponQuery.trim());
    return catalog.weapons.filter((w) => normalize(w.name).includes(needle)).slice(0, 8);
  }, [catalog, weaponQuery]);

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

  if (loadError && !catalog) return <p class="py-10 text-center text-red-300">{loadError}</p>;
  if (!catalog || !inventory) return <p class="py-10 text-center text-base-500">{t('common.loading')}</p>;

  const weapon = weaponId ? catalog.weapons.find((w) => w.id === weaponId) : null;

  return (
    <div class="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <aside class="space-y-4">
        <section class="rounded border border-base-800 bg-base-900 p-3">
          <div class="mb-2 flex items-center gap-2">
            <h2 class="text-sm font-medium text-base-300">{t('builder.wantedSkills')}</h2>
            {targets.length > 0 && (
              <button
                onClick={() => setTargets([])}
                class="ml-auto text-xs text-base-500 hover:text-red-300"
              >
                {t('builder.clearAll')}
              </button>
            )}
          </div>

          <div class="space-y-2">
            {targets.map((target) => {
              const skill = skillById.get(target.skillId);
              const max = skill?.ranks.reduce((m, r) => Math.max(m, r.level), 1) ?? 1;
              return (
                <div key={target.skillId} class="flex items-center gap-2 rounded bg-base-850 px-2 py-1.5">
                  <span class="min-w-0 flex-1 truncate text-sm">{skill?.name}</span>
                  {skill?.kind === 'weapon' && (
                    <span class="shrink-0 text-xs text-ember-300" title="Solo se obtiene del arma y sus adornos">⚔</span>
                  )}
                  <select
                    value={String(target.level)}
                    onChange={(e) => {
                      const level = Number((e.target as HTMLSelectElement).value);
                      setTargets((list) => list.map((t) => (t.skillId === target.skillId ? { ...t, level } : t)));
                    }}
                    class="rounded border border-base-700 bg-base-900 px-1.5 py-0.5 text-sm"
                  >
                    {Array.from({ length: max }, (_, i) => i + 1).map((lv) => (
                      <option key={lv} value={String(lv)}>{lv}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setTargets((list) => list.filter((t) => t.skillId !== target.skillId))}
                    class="text-base-500 hover:text-red-300"
                    aria-label={t('builder.remove')}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {targets.length === 0 && (
              <p class="py-2 text-center text-xs text-base-500">{t('builder.addSkillHint')}</p>
            )}
          </div>

          <input
            value={skillQuery}
            onInput={(e) => setSkillQuery((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              // Enter agrega la primera coincidencia: escribir y pulsar Enter es
              // lo que la gente intenta, y antes no hacía nada.
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const first = skillGroups[0]?.skills[0];
              if (first) { addSkill(first.id); setSkillQuery(''); }
            }}
            placeholder={t('builder.filterSkills')}
            class="mt-3 w-full rounded border border-base-700 bg-base-900 px-3 py-2 text-sm outline-none focus:border-ember-500"
          />

          <div class="mt-1 max-h-72 overflow-y-auto rounded border border-base-800">
            {skillGroups.length === 0 && (
              <p class="px-2 py-3 text-center text-xs text-base-500">{t('builder.noSkillMatch')}</p>
            )}
            {skillGroups.map((group) => (
              <div key={group.kind}>
                <p class="sticky top-0 bg-base-950 px-2 py-1 text-[11px] uppercase tracking-wide text-base-500">
                  {group.kind === 'armor' ? t('builder.armorSkills') : t('builder.weaponSkills')}
                  <span class="ml-1 opacity-60">{group.skills.length}</span>
                </p>
                <ul class="divide-y divide-base-850">
                  {group.skills.map((skill) => {
                    const max = skill.ranks.reduce((m, r) => Math.max(m, r.level), 1);
                    return (
                      <li key={skill.id}>
                        <button
                          onClick={() => addSkill(skill.id)}
                          class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-base-850"
                        >
                          <span class="min-w-0 flex-1 truncate">{skill.name}</span>
                          {group.kind === 'weapon' && (
                            <span class="shrink-0 text-xs text-ember-300">{t('builder.weaponSkillTag')}</span>
                          )}
                          <span class="shrink-0 text-xs text-base-600">{t('builder.max')} {max}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section class="rounded border border-base-800 bg-base-900 p-3">
          <h2 class="text-sm font-medium text-base-300">{t('builder.weaponOptional')}</h2>
          <p class="mb-2 text-xs text-base-500">{t('builder.weaponHelp')}</p>
          {weapon ? (
            <div class="flex items-center gap-2 rounded bg-base-850 px-2 py-1.5 text-sm">
              <span class="min-w-0 flex-1 truncate">{weapon.name}</span>
              <span class="text-xs text-base-500">{weapon.slots.map((s) => `[${s}]`).join('') || t('builder.noSlots')}</span>
              <button onClick={() => setWeaponId(null)} class="text-base-500 hover:text-red-300">×</button>
            </div>
          ) : (
            <>
              <input
                value={weaponQuery}
                onInput={(e) => setWeaponQuery((e.target as HTMLInputElement).value)}
                placeholder={t('builder.searchWeapon')}
                class="w-full rounded border border-base-700 bg-base-900 px-3 py-2 text-sm outline-none focus:border-ember-500"
              />
              {weaponMatches.length > 0 && (
                <ul class="mt-1 divide-y divide-base-850 rounded border border-base-800">
                  {weaponMatches.map((w) => (
                    <li key={w.id}>
                      <button
                        onClick={() => { setWeaponId(w.id); setWeaponQuery(''); }}
                        class="flex w-full gap-2 px-2 py-1.5 text-left text-sm hover:bg-base-850"
                      >
                        <span class="min-w-0 flex-1 truncate">{w.name}</span>
                        <span class="text-xs text-base-500">{w.slots.map((s) => `[${s}]`).join('')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

            </>
          )}
        </section>

        <label class="flex items-center gap-2 text-sm text-base-300">
          <input
            type="checkbox"
            checked={onlyOwnedArmor}
            onChange={(e) => setOnlyOwnedArmor((e.target as HTMLInputElement).checked)}
          />
          {t('builder.onlyForged')}
        </label>

        <button
          onClick={run}
          disabled={busy || targets.length === 0}
          class="w-full rounded bg-ember-500 px-4 py-2.5 font-medium text-base-950 hover:bg-ember-400 disabled:opacity-40"
        >
          {busy ? t('builder.searching') : t('builder.search')}
        </button>
      </aside>

      <section>
        {!result && !busy && (
          <p class="py-16 text-center text-base-500">
            {t('builder.pickAndSearch')}
          </p>
        )}

        {result && !result.ok && result.reason === 'falta-arma' && (
          <div class="rounded border border-ember-500/40 bg-ember-500/5 p-4">
            <h2 class="mb-1 font-medium text-ember-300">{t('builder.needWeapon')}</h2>
            <p class="text-sm text-base-300">
              {result.weaponSkills.map((t) => skillById.get(t.skillId)?.name).join(', ')}
              {' '}{result.weaponSkills.length === 1 ? t('builder.needWeaponOne') : t('builder.needWeaponMany')}:{' '}
              {t('builder.needWeaponBody')}
            </p>
          </div>
        )}

        {result && !result.ok && result.reason === 'sin-solucion' && (
          <div class="rounded border border-base-800 bg-base-900 p-4">
            <h2 class="mb-1 font-medium">{t('builder.noSolution')}</h2>
            {result.unreachable.length > 0 && (
              <p class="mb-3 text-sm text-base-300">
                {t('builder.shortOn', { skills: result.unreachable.map((x) => `${skillById.get(x.skillId)?.name} ${x.level}`).join(', ') })}
              </p>
            )}
            {result.missingDecorations.length > 0 && (
              <>
                <h3 class="mb-1 text-sm font-medium text-base-300">{t('builder.youWouldNeed')}</h3>
                <ul class="space-y-1 text-sm">
                  {result.missingDecorations.map((m) => (
                    <li key={m.decorationId} class="flex gap-2">
                      <span class="text-ember-300">{m.quantity}×</span>
                      <span>{decoById.get(m.decorationId)?.name ?? `adorno ${m.decorationId}`}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {result && result.ok && (
          <>
            <p class="mb-3 text-xs text-base-500">
              {t('builder.stats', {
                count: result.solutions.length,
                searched: result.searched.toLocaleString(INTL_LOCALE[locale]),
                ms: result.elapsedMs,
              })}
              {result.truncated && t('builder.truncated')}
            </p>
            {result.solutions.length === 0 && (
              <p class="py-10 text-center text-base-500">{t('builder.noneMatch')}</p>
            )}
            <div class="space-y-4">
              {result.solutions.map((solution, i) => (
                <SolutionCard
                  key={i}
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

function SolutionCard(props: {
  solution: Solution;
  armorById: Map<number, Catalog['armor'][number]>;
  decoById: Map<number, Catalog['decorations'][number]>;
  charmById: Map<number, Catalog['charms'][number]>;
  skillById: Map<number, Catalog['skills'][number]>;
  targets: Target[];
  t: Translator;
}) {
  const { solution, armorById, decoById, charmById, skillById, targets, t } = props;
  const [saving, setSaving] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle');
  const [slug, setSlug] = useState<string | null>(null);

  const save = async () => {
    setSaving('guardando');
    const name = targets
      .map((t) => `${skillById.get(t.skillId)?.name} ${t.level}`)
      .join(' + ')
      .slice(0, 60);

    try {
      const res = await fetch('/api/sets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name || 'Set',
          notes: null,
          weaponId: solution.weaponId,
          weaponDecorations: solution.weaponDecorations,
          head: solution.pieces.head,
          chest: solution.pieces.chest,
          arms: solution.pieces.arms,
          waist: solution.pieces.waist,
          legs: solution.pieces.legs,
          charmId: solution.charmId,
          charmLevel: solution.charmLevel,
          isPublic: true,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSlug(data.slug);
      setSaving('guardado');
    } catch {
      setSaving('error');
    }
  };

  return (
    <article class="rounded border border-base-800 bg-base-900 p-3">
      <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-500">
        <span>{t('builder.defense')} <strong class="text-base-100">{solution.defense}</strong></span>
        {solution.freeArmorSlots.length > 0 && (
          <span>{t('builder.freeSlots')} {solution.freeArmorSlots.map((s) => `[${s}]`).join('')}</span>
        )}
        <div class="ml-auto flex items-center gap-2">
          {slug && (
            <a href={`/set/${slug}`} class="text-ember-400 underline">{t('builder.viewLink')}</a>
          )}
          <button
            onClick={save}
            disabled={saving === 'guardando' || saving === 'guardado'}
            class="rounded border border-base-700 px-2 py-1 hover:bg-base-850 disabled:opacity-40"
          >
            {saving === 'guardado' ? t('builder.saved') : saving === 'guardando' ? t('builder.saving') : t('builder.save')}
          </button>
        </div>
      </div>

      <div class="grid gap-1 sm:grid-cols-2">
        {ARMOR_KINDS.map((kind) => {
          const piece = armorById.get(solution.pieces[kind].armorId);
          if (!piece) return null;
          return (
            <div key={kind} class="rounded bg-base-850 px-2 py-1.5 text-sm">
              <div class="flex gap-2">
                <span class="w-14 shrink-0 text-xs text-base-500">{t(KIND_KEY[kind])}</span>
                <span class="min-w-0 flex-1 truncate">{piece.name}</span>
              </div>
              {solution.pieces[kind].decorations.length > 0 && (
                <div class="mt-0.5 pl-14 text-xs text-ember-300">
                  {solution.pieces[kind].decorations
                    .map((d) => decoById.get(d.decorationId)?.name)
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </div>
          );
        })}

        {solution.charmId && (
          <div class="rounded bg-base-850 px-2 py-1.5 text-sm">
            <div class="flex gap-2">
              <span class="w-14 shrink-0 text-xs text-base-500">{t('piece.charm')}</span>
              <span class="min-w-0 flex-1 truncate">
                {charmById.get(solution.charmId)?.name} {solution.charmLevel}
              </span>
            </div>
          </div>
        )}
      </div>

      <div class="mt-2 flex flex-wrap gap-1">
        {Object.entries(solution.skills)
          .map(([id, level]) => ({ skill: skillById.get(Number(id)), level, id: Number(id) }))
          .filter((entry) => entry.skill)
          .sort((a, b) => {
            const aTarget = targets.some((t) => t.skillId === a.id) ? 0 : 1;
            const bTarget = targets.some((t) => t.skillId === b.id) ? 0 : 1;
            return aTarget - bTarget || b.level - a.level;
          })
          .map((entry) => {
            const isTarget = targets.some((t) => t.skillId === entry.id);
            return (
              <span
                key={entry.id}
                class={`rounded px-1.5 py-0.5 text-xs ${
                  isTarget ? 'bg-ember-500/20 text-ember-300' : 'bg-base-850 text-base-500'
                }`}
              >
                {entry.skill!.name} {entry.level}
              </span>
            );
          })}
      </div>
    </article>
  );
}
