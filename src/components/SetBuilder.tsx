import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import { ARMOR_KINDS, indexCatalog, type ArmorKind, type Catalog } from '../lib/catalog/types.ts';
import type { Solution, SolveRequest, SolveResponse } from '../lib/solver/types.ts';
import { INTL_LOCALE, translatorFor, type Locale, type Translator } from '../lib/i18n/index.ts';
import Combo from './ui/Combo.tsx';
import LoadoutCard from './LoadoutCard.tsx';
import SeriesBrowser from './SeriesBrowser.tsx';
import { slotSvg } from '../lib/ui/glyphs.ts';
import { gearIconStyle } from '../lib/ui/gear-icons.ts';

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
  // Dos maneras de llegar a un set: describir lo que quieres y que el solver
  // busque, u hojear las series del juego y tomar piezas a mano. Las piezas
  // fijadas valen para las dos: el solver las respeta como restricción.
  const [mode, setMode] = useState<'solve' | 'browse'>('solve');
  const [pinned, setPinned] = useState<Partial<Record<ArmorKind, number>>>({});
  // En móvil el panel es una hoja inferior: ocupa toda la altura útil y
  // taparía los resultados si estuviera siempre abierto.
  const [sheetOpen, setSheetOpen] = useState(false);
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
        const [cat, res] = await Promise.all([loadCatalog(['armor', 'armorSets', 'charms', 'decorations', 'items', 'skills', 'weapons']), fetch('/api/inventory')]);
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

  // Un solo índice en vez de cuatro mapas sueltos: es lo que piden el navegador
  // de series y `summarizeLoadout`, y ya trae los mismos mapas por id.
  const index = useMemo(() => (catalog ? indexCatalog(catalog) : null), [catalog]);

  // Con identidad estable: el navegador de series la usa como dependencia de su
  // agrupación, y un `Set` nuevo en cada render la rehacía entera sin motivo.
  const ownedArmor = useMemo(
    () => (onlyOwnedArmor ? new Set<number>(inventory?.armor ?? []) : null),
    [onlyOwnedArmor, inventory],
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
    // Buscar siempre lleva a los resultados: el botón sigue a mano mientras se
    // hojean series, y dejarlo buscar en silencio detrás del navegador era
    // trabajo que nadie llegaba a ver.
    setMode('solve');
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
      locked: pinned,
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
  if (!catalog || !index || !inventory) {
    return <p class="py-10 text-center text-text-3">{t('common.loading')}</p>;
  }

  const { skillById, decorationById: decoById, armorById, charmById } = index;

  const weapon = weaponId ? catalog.weapons.find((w) => w.id === weaponId) : null;

  const armorSkills = skillGroups.find((g) => g.kind === 'armor')?.skills ?? [];
  const weaponSkills = skillGroups.find((g) => g.kind === 'weapon')?.skills ?? [];
  const totalSkills = catalog.skills.filter((s) => s.kind === 'armor' || s.kind === 'weapon').length;

  const pinnedCount = ARMOR_KINDS.filter((kind) => pinned[kind] != null).length;
  // Volver a tocar la pieza que ya estaba la suelta: es el mismo gesto para
  // poner y quitar, y evita tener que buscar la ✕ en la otra columna.
  const pin = (kind: ArmorKind, armorId: number) =>
    setPinned((prev) => (prev[kind] === armorId ? { ...prev, [kind]: undefined } : { ...prev, [kind]: armorId }));
  const unpin = (kind: ArmorKind) => setPinned((prev) => ({ ...prev, [kind]: undefined }));

  // La fila de cabecera la pinta el servidor; estos botones dependen de los
  // objetivos elegidos, así que se cuelgan ahí desde aquí.
  const headerSlot = typeof document === 'undefined' ? null : document.getElementById('page-actions');

  return (
    <div class="grid gap-3.5 lg:grid-cols-[380px_minmax(0,1fr)]">
      {headerSlot && createPortal(
        <>
          {/* El conmutador vive en la fila de cabecera, junto a «Limpiar»: es una
              decisión de pantalla, no del panel de objetivos. */}
          {([['solve', t('builder.modeSolve')], ['browse', t('builder.modeBrowse')]] as const).map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                aria-pressed={mode === key}
                class={`font-ui flex h-7 items-center px-3 text-[13px] uppercase tracking-[0.08em] ${
                  mode === key
                    ? 'border border-accent bg-accent-weak text-accent-hi'
                    : 'border border-line-strong bg-bg-2 text-text-2 hover:bg-bg-3 hover:text-text-1'
                }`}
              >{label}</button>
            ),
          )}
          <button
            onClick={() => {
              setTargets([]); setWeaponId(null); setResult(null); setPinned({});
            }}
            disabled={targets.length === 0 && weaponId === null && pinnedCount === 0}
            class="font-ui flex h-7 items-center border border-line-strong bg-bg-2 px-3 text-[13px] uppercase tracking-[0.08em] text-text-2 hover:bg-bg-3 hover:text-text-1 disabled:opacity-40"
          >{t('builder.clear')}</button>
        </>,
        headerSlot,
      )}

      {/* Un solo panel para objetivos y arma: son la misma pregunta ("qué
          quiero"), y partirlos en dos cajas hacía que el botón de buscar
          quedara flotando sin dueño. Va fijo porque la lista de resultados es
          larga y hay que poder subir un nivel sin volver arriba. */}
      {/* Por debajo de 1024 el panel es una hoja inferior: a esa anchura no
          caben dos columnas, y dejarlo arriba obligaba a subir cada vez para
          cambiar un nivel. El resumen queda siempre visible en la barra. */}
      <div
        onClick={() => setSheetOpen(false)}
        class={`fixed inset-0 z-30 bg-black/60 lg:hidden ${sheetOpen ? '' : 'hidden'}`}
        aria-hidden="true"
      />

      <aside
        class={`panel bevel-head z-40 flex flex-col max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[85vh] lg:sticky lg:top-[52px] lg:max-h-[calc(100vh-64px)] lg:self-start ${
          sheetOpen ? '' : 'max-lg:hidden'
        }`}
      >
        <header class="flex h-8 shrink-0 items-center gap-2 border-b border-accent bg-panel-head px-3">
          <h2 class="font-ui text-[14px] uppercase tracking-[0.12em] text-accent-hi">
            {t('builder.wantedSkills')}
          </h2>
          <span class="num ml-auto text-[11px] text-text-3">
            {t('builder.targetCount', { shown: targets.length, total: totalSkills })}
          </span>
          <button
            onClick={() => setSheetOpen(false)}
            aria-label={t('builder.closePanel')}
            class="-mr-1 grid h-6 w-6 place-items-center text-text-3 hover:text-text-1 lg:hidden"
          >✕</button>
        </header>

        {/* Lo fijado restringe la búsqueda, así que en modo buscar tiene que
            verse desde aquí: si no, salen ocho resultados con la misma pieza y
            no se entiende por qué. En modo explorar lo enseña la tarjeta del set
            con más detalle, y repetirlo aquí sobraba. */}
        {mode === 'solve' && (
          <div class="shrink-0 border-b border-line">
            <div class="flex h-[26px] items-center gap-2 bg-panel-head px-3">
              <h2 class="font-ui text-[12.5px] uppercase tracking-[0.12em] text-text-2">
                {t('builder.pinnedPieces')}
              </h2>
              <span class="num ml-auto text-[11px] text-text-3">
                {t('builder.pinned', { count: pinnedCount })}
              </span>
            </div>
            {pinnedCount === 0 ? (
              <p class="px-3 py-2 text-[12px] text-text-3">{t('builder.pinHint')}</p>
            ) : (
              <ul>
                {ARMOR_KINDS.filter((kind) => pinned[kind] != null).map((kind) => (
                  <li
                    key={kind}
                    class="grid min-h-[30px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-[3px]"
                  >
                    <span class="grid h-[20px] w-[20px] place-items-center border border-line-strong bg-tile">
                      <span style={gearIconStyle(kind, 13, 'var(--accent-hi)')} />
                    </span>
                    <span class="min-w-0 truncate text-[13px]">{armorById.get(pinned[kind]!)?.name}</span>
                    <button
                      onClick={() => unpin(kind)}
                      aria-label={`${t('builder.unpin')} ${armorById.get(pinned[kind]!)?.name}`}
                      class="grid h-5 w-5 place-items-center border border-line bg-bg-2 text-[11px] text-text-3 hover:border-danger hover:text-danger"
                    >✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div class="flex shrink-0 flex-col gap-2 border-b border-line px-3 py-2.5">
          <Combo
            placeholder={t('builder.filterSkills')}
            groups={[
              { label: t('builder.armorSkills'), items: armorSkills },
              { label: t('builder.weaponSkills'), items: weaponSkills },
            ]}
            browseGroup={skillTab === 'armor' ? t('builder.armorSkills') : t('builder.weaponSkills')}
            value={null}
            onPick={(skill) => addSkill(skill.id)}
            render={(skill) => skill.name}
            meta={(skill) => `${t('builder.max')} ${skill.ranks.reduce((m, r) => Math.max(m, r.level), 1)}`}
            keyOf={(skill) => skill.id}
            countLabel={(shown, total) => `${shown} / ${total}`}
            seeAllLabel={t('ui.seeAll')}
          />

          {/* Dos pestañas y no una lista mezclada: las de arma solo salen del
              arma, así que decidir en cuál se busca es parte del problema. */}
          <div class="flex items-center gap-1">
            {([['armor', armorSkills.length], ['weapon', weaponSkills.length]] as const).map(
              ([kind, count]) => (
                <button
                  key={kind}
                  onClick={() => setSkillTab(kind)}
                  class={`font-ui flex h-[26px] items-center px-2.5 text-[12.5px] uppercase tracking-[0.08em] ${
                    skillTab === kind
                      ? 'border border-accent bg-accent-weak text-accent-hi'
                      : 'border border-line bg-bg-2 text-text-2 hover:text-text-1'
                  }`}
                >
                  {kind === 'armor' ? t('builder.tabArmor') : t('builder.tabWeapon')} {count}
                </button>
              ),
            )}
            <label class="ml-auto flex cursor-pointer items-center gap-1.5 text-[12.5px] text-text-2">
              <input
                type="checkbox"
                checked={onlyOwnedArmor}
                onChange={(e) => setOnlyOwnedArmor((e.target as HTMLInputElement).checked)}
                class="peer sr-only"
              />
              <span
                class={`grid h-3.5 w-3.5 place-items-center border text-[10px] font-bold peer-focus-visible:outline peer-focus-visible:outline-accent ${
                  onlyOwnedArmor ? 'border-ok bg-ok text-bg-0' : 'border-line-strong text-transparent'
                }`}
                aria-hidden="true"
              >✓</span>
              {t('builder.onlyForged')}
            </label>
          </div>
        </div>

        {/* Lo único que crece es la lista de objetivos: el arma y el botón se
            quedan siempre visibles al fondo del panel. */}
        <div class="min-h-0 flex-1 overflow-y-auto">
          {targets.length === 0 ? (
            <p class="px-3 py-4 text-center text-[12px] text-text-3">{t('builder.addSkillHint')}</p>
          ) : (
            <ul>
              {targets.map((target) => {
                const skill = skillById.get(target.skillId);
                const max = skill?.ranks.reduce((m, r) => Math.max(m, r.level), 1) ?? 1;
                const setLevel = (level: number) =>
                  setTargets((list) =>
                    list.map((x) => (x.skillId === target.skillId ? { ...x, level } : x)));
                return (
                  <li
                    key={target.skillId}
                    class="grid min-h-[38px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-line-soft px-3 py-[3px]"
                  >
                    <span class="min-w-0 truncate text-[14px]">
                      {skill?.name}
                      {/* Marca de familia: estas habilidades solo salen del arma,
                          y sin avisar aquí el buscador falla con «falta arma»
                          sin que se entienda por qué. El glifo ⚔ que había se
                          dibujaba como una «×» y se confundía con el botón de
                          quitar, que está en la misma fila. */}
                      {skill?.kind === 'weapon' && (
                        <span class="num ml-1.5 text-[10px] uppercase text-text-3">
                          {t('builder.tabWeapon')}
                        </span>
                      )}
                    </span>
                    <span class="flex items-center gap-1">
                      <button
                        onClick={() => setLevel(Math.max(1, target.level - 1))}
                        disabled={target.level <= 1}
                        aria-label={`− ${skill?.name}`}
                        class="grid h-6 w-6 place-items-center border border-line-strong bg-bg-2 text-[14px] leading-none text-text-2 hover:bg-bg-3 hover:text-text-1 disabled:opacity-45"
                      >−</button>
                      <span class="num w-[34px] text-center text-[13.5px] text-accent-hi">
                        {target.level}<span class="text-text-3">/{max}</span>
                      </span>
                      <button
                        onClick={() => setLevel(Math.min(max, target.level + 1))}
                        disabled={target.level >= max}
                        aria-label={`+ ${skill?.name}`}
                        class="grid h-6 w-6 place-items-center border border-line-strong bg-bg-2 text-[14px] leading-none text-text-2 hover:bg-bg-3 hover:text-text-1 disabled:opacity-45"
                      >+</button>
                    </span>
                    <button
                      onClick={() => setTargets((list) => list.filter((x) => x.skillId !== target.skillId))}
                      aria-label={`${t('builder.remove')} ${skill?.name}`}
                      class="grid h-6 w-6 place-items-center border border-line bg-bg-2 text-[12px] text-text-3 hover:border-danger hover:text-danger"
                    >✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div class="flex h-[30px] shrink-0 items-center gap-2 border-y border-line bg-panel-head px-3">
          <h2 class="font-ui text-[13.5px] uppercase tracking-[0.12em] text-text-2">{t('piece.weapon')}</h2>
          <span class="num ml-auto text-[11px] text-text-3">{t('builder.optional')}</span>
        </div>

        <div class="flex shrink-0 flex-col gap-2 px-3 py-2.5">
          {/* Los 14 tipos como mosaico y no como desplegable: se reconocen por
              su icono antes que por el nombre, y así se ve de un vistazo cuál
              está filtrando. */}
          <div class="grid grid-cols-7 gap-1">
            {weaponKinds.map((kind) => {
              const on = weaponKind === kind;
              return (
                <button
                  key={kind}
                  onClick={() => setWeaponKind(on ? '' : kind)}
                  title={t(`wk.${kind}` as never)}
                  aria-label={t(`wk.${kind}` as never)}
                  aria-pressed={on}
                  class={`grid h-[30px] place-items-center border ${
                    on ? 'border-accent bg-accent-weak' : 'border-line bg-bg-2 hover:border-line-strong'
                  }`}
                >
                  <span style={gearIconStyle(kind, 21, `var(${on ? '--accent-hi' : '--text-3'})`)} />
                </button>
              );
            })}
          </div>

          {weapon ? (
            <div class="flex flex-col gap-2">
              <div class="flex h-8 items-center gap-2 border border-line-strong bg-bg-0 px-2.5">
                <span class="min-w-0 flex-1 truncate text-[14px]">{weapon.name}</span>
                <button
                  onClick={() => setWeaponId(null)}
                  aria-label={t('builder.remove')}
                  class="num shrink-0 text-[11px] text-text-3 hover:text-danger"
                >✕</button>
              </div>
              <div class="num flex items-center gap-2 text-[11.5px] text-text-2">
                <span>{t('builder.attackShort')} {weapon.attack}</span>
                {weapon.element && (
                  <span style={`color: var(--el-${weapon.element.kind})`}>
                    {t(`el.${weapon.element.kind}` as never)} {weapon.element.damage}
                  </span>
                )}
                {weapon.affinity !== 0 && (
                  <span style={weapon.affinity < 0 ? 'color: var(--danger)' : undefined}>
                    {t('builder.affinityShort')} {weapon.affinity > 0 ? '+' : ''}{weapon.affinity}%
                  </span>
                )}
                <span class="ml-auto flex gap-[3px]">
                  {weapon.slots.map((level, i) => (
                    <span key={i} dangerouslySetInnerHTML={{ __html: slotSvg(level, false, true) }} />
                  ))}
                </span>
              </div>
            </div>
          ) : (
            <div class="flex flex-col gap-2">
              <Combo
                placeholder={t('builder.filterWeapons')}
                groups={[{ label: t('piece.weapon'), items: weaponMatches }]}
                value={null}
                onPick={(w) => setWeaponId(w.id)}
                render={(w) => w.name}
                meta={(w) => w.slots.map((sl) => `[${sl}]`).join('') || '—'}
                keyOf={(w) => w.id}
                countLabel={(shown, total) => `${shown} / ${total}`}
                seeAllLabel={t('ui.seeAll')}
              />
            </div>
          )}
        </div>

        <div class="shrink-0 border-t border-line p-3">
          <button
            onClick={run}
            disabled={busy || targets.length === 0}
            class="bevel font-ui h-10 w-full border border-accent-hi text-[16px] font-semibold uppercase tracking-[0.14em] disabled:opacity-40"
            style="background: linear-gradient(180deg, var(--accent), var(--accent-deep)); color: var(--on-accent)"
          >
            {busy ? t('builder.searching') : t('builder.search')}
          </button>
          {result?.ok && (
            <p class="num mt-[7px] text-[11px] text-text-3">
              {t('builder.searchTime', { ms: result.elapsedMs })}
            </p>
          )}
        </div>
      </aside>

      <div class="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-accent bg-bg-1 px-3 py-2 lg:hidden">
        <button
          onClick={() => setSheetOpen(true)}
          class="font-ui flex h-9 items-center border border-line-strong bg-bg-2 px-3 text-[13px] uppercase tracking-[0.08em] text-text-2"
        >
          {t('builder.wantedSkills')}
          <span class="num ml-2 text-accent-hi">{targets.length}</span>
        </button>
        <button
          onClick={run}
          disabled={busy || targets.length === 0}
          class="bevel font-ui h-9 flex-1 border border-accent-hi text-[14px] font-semibold uppercase tracking-[0.12em] disabled:opacity-40"
          style="background: linear-gradient(180deg, var(--accent), var(--accent-deep)); color: var(--on-accent)"
        >
          {busy ? t('builder.searching') : t('builder.search')}
        </button>
      </div>

      {/* El hueco evita que la barra fija tape la última tarjeta de set. */}
      <section class="flex min-w-0 flex-col gap-3 max-lg:pb-16">
        {mode === 'browse' && (
          <>
            <LoadoutCard
              index={index}
              locale={locale}
              t={t}
              pinned={pinned}
              onUnpin={unpin}
              weaponId={weaponId}
              onUnpinWeapon={() => setWeaponId(null)}
              onComplete={() => void run()}
              canComplete={targets.length > 0 && pinnedCount < ARMOR_KINDS.length}
            />
            <SeriesBrowser
              index={index}
              locale={locale}
              t={t}
              pinned={pinned}
              onPin={pin}
              ownedArmor={ownedArmor}
            />
          </>
        )}

        {mode === 'solve' && !result && !busy && (
          <p class="py-16 text-center text-text-3">{t('builder.pickAndSearch')}</p>
        )}

        {mode === 'solve' && result && !result.ok && result.reason === 'falta-arma' && (
          <div class="bevel-head border border-accent bg-accent-weak p-4">
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

        {mode === 'solve' && result && !result.ok && result.reason === 'sin-solucion' && (
          <div class="panel bevel-head p-4">
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

        {mode === 'solve' && result?.ok && (
          <>
            <div class="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1 border border-line bg-bg-1 px-3 py-[3px]">
              <h2 class="font-ui text-[14px] uppercase tracking-[0.12em]">
                {t('builder.results', { count: sorted.length })}
              </h2>
              <p class="num text-[11px] text-text-3">
                {t('builder.ofCombos', { count: result.searched.toLocaleString(INTL_LOCALE[locale]) })}
                {result.truncated && t('builder.truncated')}
              </p>
              <div class="ml-auto flex items-center gap-1.5">
                <span class="font-ui text-[12.5px] uppercase tracking-[0.08em] text-text-3">
                  {t('builder.sortBy')}
                </span>
                {([['defense', t('builder.sortDefense')], ['slots', t('builder.sortSlots')]] as const).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      class={`flex h-[26px] items-center px-2.5 text-[13px] ${
                        sortBy === key
                          ? 'border border-accent bg-accent-weak text-accent-hi'
                          : 'border border-line-strong bg-bg-2 text-text-1 hover:bg-bg-3'
                      }`}
                    >{label}</button>
                  ),
                )}
              </div>
            </div>

            {sorted.length === 0 && (
              <p class="py-10 text-center text-text-3">{t('builder.noneMatch')}</p>
            )}

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
    <article
      class="panel bevel-head"
      style={`border-left: 2px solid var(--slot-${Math.min(3, Math.max(1, freeSlots[0] ?? 1))})`}
    >
      {/* Cabecera: lo que decide entre un set y otro va aquí, no repartido por
          la tarjeta. Defensa y ranuras libres son las dos cifras que se
          comparan de un set al siguiente, así que van en monoespaciada. */}
      <header class="flex min-h-[38px] flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-line bg-panel-head px-3.5 py-1">
        <span class="font-ui text-[16px] uppercase tracking-[0.1em] text-accent-hi">
          {t('builder.setNumber', { n: index })}
        </span>

        <span class="flex items-baseline gap-1.5">
          <span class="font-ui text-[11.5px] uppercase tracking-[0.1em] text-text-3">{t('builder.defense')}</span>
          <span class="num text-[15px] text-text-1">{solution.defense}</span>
        </span>

        <span class="flex items-baseline gap-1.5">
          <span class="font-ui text-[11.5px] uppercase tracking-[0.1em] text-text-3">{t('builder.res')}</span>
          {RES_ORDER.map((element) => {
            const value = solution.resistances[element] ?? 0;
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
          <button
            onClick={save}
            disabled={saving === 'guardando' || saving === 'guardado'}
            class="font-ui flex h-[26px] items-center border border-line-strong bg-bg-2 px-2.5 text-[12.5px] uppercase tracking-[0.08em] text-text-2 hover:bg-bg-3 hover:text-text-1 disabled:opacity-40"
          >
            {saving === 'guardado' ? t('builder.saved')
              : saving === 'guardando' ? t('builder.saving')
              : t('builder.save')}
          </button>
        </div>
      </header>

      <div class="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Rejilla de columnas fijas y no `flex`: los nombres de pieza varían
            mucho de largo, y sin columnas la defensa y las ranuras bailaban de
            renglón en renglón. */}
        <div class="min-w-0 lg:border-r lg:border-line">
          {ARMOR_KINDS.map((kind) => {
            const piece = armorById.get(solution.pieces[kind].armorId);
            if (!piece) return null;
            const placed = new Map(
              solution.pieces[kind].decorations.map((d) => [d.slotIndex, d.decorationId]),
            );
            return (
              <div
                key={kind}
                class="grid min-h-[34px] grid-cols-[64px_26px_minmax(0,1fr)_56px_auto] items-center gap-2 border-b border-line-soft px-3 py-[3px]"
              >
                <span class="font-ui text-[12px] uppercase tracking-[0.1em] text-text-3">
                  {t(KIND_KEY[kind])}
                </span>
                <span class="grid h-[22px] w-[22px] place-items-center border border-line-strong bg-tile">
                  <span style={gearIconStyle(kind, 14, 'var(--text-2)')} />
                </span>
                <span class="min-w-0 truncate text-[14px]">{piece.name}</span>
                <span class="num text-right text-[12.5px] text-text-2">{piece.defense}</span>
                <span class="flex gap-[3px]">
                  {piece.slots.map((level, i) => (
                    <span
                      key={i}
                      title={placed.has(i) ? decoById.get(placed.get(i)!)?.name : undefined}
                      dangerouslySetInnerHTML={{ __html: slotSvg(level, placed.has(i), true) }}
                    />
                  ))}
                </span>
              </div>
            );
          })}

          {solution.charmId && (
            <div class="grid min-h-[34px] grid-cols-[64px_26px_minmax(0,1fr)_56px_auto] items-center gap-2 bg-bg-1 px-3 py-[3px]">
              <span class="font-ui text-[12px] uppercase tracking-[0.1em] text-text-3">
                {t('piece.charm')}
              </span>
              <span class="grid h-[22px] w-[22px] place-items-center border border-line-strong bg-tile">
                <span style={gearIconStyle('charm', 14, 'var(--crown-gold)')} />
              </span>
              <span class="min-w-0 truncate text-[14px]">
                {charmById.get(solution.charmId)?.name} {solution.charmLevel}
              </span>
              <span class="num text-right text-[12.5px] text-text-3">—</span>
              <span></span>
            </div>
          )}
        </div>

        <div class="flex min-w-0 flex-col gap-2 border-t border-line p-3 lg:border-t-0">
          <h3 class="font-ui text-[12px] uppercase tracking-[0.12em] text-text-3">
            {t('builder.achieved')}
          </h3>
          <div class="flex flex-wrap gap-1">
            {Object.entries(solution.skills)
              .map(([id, level]) => ({ id: Number(id), skill: skillById.get(Number(id)), level }))
              .filter((x) => x.skill)
              // Lo pedido primero: en un set de 20 habilidades, las 5 que se
              // buscaban se perdían entre las que salen de regalo.
              .sort((a, b) => {
                const at = targets.some((x) => x.skillId === a.id) ? 0 : 1;
                const bt = targets.some((x) => x.skillId === b.id) ? 0 : 1;
                return at - bt || b.level - a.level;
              })
              .map((entry) => {
                const target = targets.find((x) => x.skillId === entry.id);
                const max = entry.skill!.ranks.reduce((m, r) => Math.max(m, r.level), 1);
                // Un objetivo servido a medias se marca en ámbar de aviso: es
                // la única forma de ver que este set no cumple sin recontar.
                const short = target !== undefined && entry.level < target.level;
                return (
                  <span
                    key={entry.id}
                    class="inline-flex items-center gap-1.5 border px-2 py-[3px] text-[12.5px]"
                    style={
                      short
                        ? 'background: color-mix(in srgb, var(--warn) 12%, transparent); border-color: var(--warn); color: var(--warn)'
                        : 'background: var(--bg-3); border-color: var(--line); color: var(--text-2)'
                    }
                  >
                    {entry.skill!.name}
                    <span class="num text-[11px]" style={short ? undefined : 'color: var(--accent-hi)'}>
                      {entry.level}/{target ? target.level : max}
                    </span>
                  </span>
                );
              })}
          </div>

          <h3 class="font-ui mt-0.5 text-[12px] uppercase tracking-[0.12em] text-text-3">
            {t('builder.placedDecos')}
          </h3>
          <ul class="text-[12.5px] leading-[1.35] text-text-2">
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
