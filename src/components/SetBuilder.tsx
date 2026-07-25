import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import { ARMOR_KINDS, type ArmorKind, type Catalog } from '../lib/catalog/types.ts';
import type { Solution, SolveRequest, SolveResponse } from '../lib/solver/types.ts';

const KIND_LABEL: Record<ArmorKind, string> = {
  head: 'Cabeza',
  chest: 'Torso',
  arms: 'Brazos',
  waist: 'Cintura',
  legs: 'Piernas',
};

interface Target { skillId: number; level: number; }

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function SetBuilder() {
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

  const skillMatches = useMemo(() => {
    if (!catalog || skillQuery.trim().length < 2) return [];
    const needle = normalize(skillQuery.trim());
    return catalog.skills
      .filter((s) => s.kind === 'armor' || s.kind === 'weapon')
      .filter((s) => normalize(s.name).includes(needle))
      .filter((s) => !targets.some((t) => t.skillId === s.id))
      .slice(0, 8);
  }, [catalog, skillQuery, targets]);

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
  if (!catalog || !inventory) return <p class="py-10 text-center text-base-500">Cargando…</p>;

  const weapon = weaponId ? catalog.weapons.find((w) => w.id === weaponId) : null;

  return (
    <div class="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <aside class="space-y-4">
        <section class="rounded border border-base-800 bg-base-900 p-3">
          <h2 class="mb-2 text-sm font-medium text-base-300">Habilidades que quieres</h2>

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
                    aria-label="Quitar"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {targets.length === 0 && (
              <p class="py-2 text-center text-xs text-base-500">Agrega al menos una habilidad.</p>
            )}
          </div>

          <input
            value={skillQuery}
            onInput={(e) => setSkillQuery((e.target as HTMLInputElement).value)}
            placeholder="Buscar habilidad…"
            class="mt-2 w-full rounded border border-base-700 bg-base-900 px-3 py-2 text-sm outline-none focus:border-ember-500"
          />
          {skillMatches.length > 0 && (
            <ul class="mt-1 divide-y divide-base-850 rounded border border-base-800">
              {skillMatches.map((skill) => (
                <li key={skill.id}>
                  <button
                    onClick={() => {
                      setTargets((list) => [...list, { skillId: skill.id, level: 1 }]);
                      setSkillQuery('');
                    }}
                    class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-base-850"
                  >
                    <span class="flex-1">{skill.name}</span>
                    {skill.kind === 'weapon' && <span class="text-xs text-ember-300">⚔ arma</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section class="rounded border border-base-800 bg-base-900 p-3">
          <h2 class="mb-2 text-sm font-medium text-base-300">Arma (opcional)</h2>
          {weapon ? (
            <div class="flex items-center gap-2 rounded bg-base-850 px-2 py-1.5 text-sm">
              <span class="min-w-0 flex-1 truncate">{weapon.name}</span>
              <span class="text-xs text-base-500">{weapon.slots.map((s) => `[${s}]`).join('') || 'sin ranuras'}</span>
              <button onClick={() => setWeaponId(null)} class="text-base-500 hover:text-red-300">×</button>
            </div>
          ) : (
            <>
              <input
                value={weaponQuery}
                onInput={(e) => setWeaponQuery((e.target as HTMLInputElement).value)}
                placeholder="Buscar arma…"
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
              <p class="mt-1 text-xs text-base-500">
                Las habilidades de arma (⚔) solo salen del arma y sus adornos.
              </p>
            </>
          )}
        </section>

        <label class="flex items-center gap-2 text-sm text-base-300">
          <input
            type="checkbox"
            checked={onlyOwnedArmor}
            onChange={(e) => setOnlyOwnedArmor((e.target as HTMLInputElement).checked)}
          />
          Solo piezas que ya forjé
        </label>

        <button
          onClick={run}
          disabled={busy || targets.length === 0}
          class="w-full rounded bg-ember-500 px-4 py-2.5 font-medium text-base-950 hover:bg-ember-400 disabled:opacity-40"
        >
          {busy ? 'Buscando…' : 'Buscar sets'}
        </button>
      </aside>

      <section>
        {!result && !busy && (
          <p class="py-16 text-center text-base-500">
            Elige habilidades y pulsa «Buscar sets».
          </p>
        )}

        {result && !result.ok && result.reason === 'falta-arma' && (
          <div class="rounded border border-ember-500/40 bg-ember-500/5 p-4">
            <h2 class="mb-1 font-medium text-ember-300">Necesitas elegir un arma</h2>
            <p class="text-sm text-base-300">
              {result.weaponSkills.map((t) => skillById.get(t.skillId)?.name).join(', ')}
              {result.weaponSkills.length === 1 ? ' es una habilidad de arma' : ' son habilidades de arma'}:
              ninguna pieza de armadura las da. Selecciona un arma y se resolverán con sus ranuras.
            </p>
          </div>
        )}

        {result && !result.ok && result.reason === 'sin-solucion' && (
          <div class="rounded border border-base-800 bg-base-900 p-4">
            <h2 class="mb-1 font-medium">No hay ningún set posible con lo que tienes</h2>
            {result.unreachable.length > 0 && (
              <p class="mb-3 text-sm text-base-300">
                Se quedó corto en: {result.unreachable.map((t) => `${skillById.get(t.skillId)?.name} ${t.level}`).join(', ')}.
              </p>
            )}
            {result.missingDecorations.length > 0 && (
              <>
                <h3 class="mb-1 text-sm font-medium text-base-300">Te faltarían</h3>
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
              {result.solutions.length} sets · {result.searched.toLocaleString('es-MX')} combinaciones evaluadas
              en {result.elapsedMs} ms
              {result.truncated && ' · búsqueda cortada por tiempo'}
            </p>
            {result.solutions.length === 0 && (
              <p class="py-10 text-center text-base-500">Ningún set cumple esos objetivos.</p>
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
}) {
  const { solution, armorById, decoById, charmById, skillById, targets } = props;
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
        <span>Defensa <strong class="text-base-100">{solution.defense}</strong></span>
        {solution.freeArmorSlots.length > 0 && (
          <span>Ranuras libres {solution.freeArmorSlots.map((s) => `[${s}]`).join('')}</span>
        )}
        <div class="ml-auto flex items-center gap-2">
          {slug && (
            <a href={`/set/${slug}`} class="text-ember-400 underline">Ver enlace</a>
          )}
          <button
            onClick={save}
            disabled={saving === 'guardando' || saving === 'guardado'}
            class="rounded border border-base-700 px-2 py-1 hover:bg-base-850 disabled:opacity-40"
          >
            {saving === 'guardado' ? 'Guardado' : saving === 'guardando' ? 'Guardando…' : 'Guardar'}
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
                <span class="w-14 shrink-0 text-xs text-base-500">{KIND_LABEL[kind]}</span>
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
              <span class="w-14 shrink-0 text-xs text-base-500">Amuleto</span>
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
