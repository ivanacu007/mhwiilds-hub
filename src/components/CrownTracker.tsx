import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import type { Catalog, Monster } from '../lib/catalog/types.ts';
import {
  CROWN_KINDS, deriveCrowns, emptyCounts, emptyProgress, formatSize, sumCounts, tallyCrowns,
  type CrownKind,
} from '../lib/crowns.ts';
import { monsterArtDataUri, SPECIES_LABEL } from '../lib/monster-art.ts';
import { MONSTER_VARIANTS, VARIANT_LABEL, monsterIconPath, type MonsterVariant } from '../lib/catalog/monster-icons.ts';
import type { MonsterProgress, VariantCounts } from '../lib/models.ts';

type Progress = Record<string, MonsterProgress>;

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function CrownTracker({ favorites }: { favorites: number[] }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [favs, setFavs] = useState<number[]>(favorites);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'todos' | 'faltantes' | 'completos' | 'favoritos'>('todos');
  const [open, setOpen] = useState<number | null>(null);
  const [status, setStatus] = useState<'cargando' | 'listo' | 'guardando' | 'guardado' | 'error'>('cargando');

  useEffect(() => {
    (async () => {
      try {
        const [cat, res] = await Promise.all([loadCatalog(), fetch('/api/progress')]);
        setCatalog(cat);
        if (res.ok) setProgress((await res.json()).monsters ?? {});
        setStatus('listo');
      } catch {
        setStatus('error');
      }
    })();
  }, []);

  const timer = useRef<number | null>(null);
  const pending = useRef<Progress>({});

  const save = (next: Progress) => {
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setStatus('guardando');
      try {
        const res = await fetch('/api/progress', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ monsters: pending.current }),
        });
        setStatus(res.ok ? 'guardado' : 'error');
      } catch {
        setStatus('error');
      }
    }, 700);
  };

  const patch = (monsterId: number, change: Partial<MonsterProgress>) => {
    setProgress((current) => {
      const key = String(monsterId);
      const next = { ...current, [key]: { ...emptyProgress(), ...current[key], ...change } };
      save(next);
      return next;
    });
  };

  const toggleFavorite = async (monsterId: number) => {
    const next = favs.includes(monsterId)
      ? favs.filter((id) => id !== monsterId)
      : [...favs, monsterId].slice(0, 12);
    setFavs(next);
    await fetch('/api/favorites', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ monsters: next }),
    });
  };

  const monsters = catalog?.monsters ?? [];

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    return monsters.filter((m) => {
      if (needle && !normalize(m.name).includes(needle)) return false;
      const c = deriveCrowns(m, progress[String(m.id)]);
      const all = c.mini.earned && c.silver.earned && c.gold.earned;
      if (filter === 'faltantes' && all) return false;
      if (filter === 'completos' && !all) return false;
      if (filter === 'favoritos' && !favs.includes(m.id)) return false;
      return true;
    });
  }, [monsters, query, filter, progress, favs]);

  if (status === 'cargando') return <p class="py-10 text-center text-base-500">Cargando…</p>;
  if (!catalog) return <p class="py-10 text-center text-red-300">No se pudo cargar el catálogo.</p>;

  const tally = tallyCrowns(monsters, progress);

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center gap-3 rounded border border-base-800 bg-base-900 px-3 py-2">
        <Stat label="Pequeñas" value={tally.mini} total={tally.total} kind="mini" />
        <Stat label="Plata" value={tally.silver} total={tally.total} kind="silver" />
        <Stat label="Oro" value={tally.gold} total={tally.total} kind="gold" />
        <span class="ml-auto text-xs text-base-500">
          {tally.complete} de {tally.total} completos
          {status === 'guardando' && ' · guardando…'}
          {status === 'guardado' && ' · guardado'}
          {status === 'error' && <span class="text-red-300"> · error al guardar</span>}
        </span>
      </div>

      <div class="mb-4 flex flex-wrap gap-2">
        <input
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="Buscar monstruo…"
          class="min-w-0 flex-1 rounded border border-base-700 bg-base-900 px-3 py-2 text-sm outline-none focus:border-ember-500"
        />
        {(['todos', 'faltantes', 'completos', 'favoritos'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            class={`rounded px-3 py-1.5 text-sm capitalize ${
              filter === f ? 'bg-ember-500 text-base-950' : 'bg-base-850 text-base-300 hover:bg-base-800'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
        {visible.map((monster) => (
          <MonsterTile
            key={monster.id}
            monster={monster}
            progress={progress[String(monster.id)]}
            isFavorite={favs.includes(monster.id)}
            onOpen={() => setOpen(monster.id)}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <p class="py-10 text-center text-sm text-base-500">Ningún monstruo coincide.</p>
      )}

      {open != null && (
        <MonsterDialog
          monster={monsters.find((m) => m.id === open)!}
          progress={progress[String(open)]}
          isFavorite={favs.includes(open)}
          onToggleFavorite={() => toggleFavorite(open)}
          onChange={(change) => patch(open, change)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, total, kind }: { label: string; value: number; total: number; kind: CrownKind }) {
  return (
    <span class="flex items-center gap-1.5 text-sm">
      <Crown kind={kind} earned />
      <span class="text-base-300">{label}</span>
      <strong>{value}</strong>
      <span class="text-base-500">/{total}</span>
    </span>
  );
}

const CROWN_COLOR: Record<CrownKind, string> = {
  mini: '#8fb8d8',
  silver: '#c9ccd4',
  gold: '#e0b53c',
};

function Crown({ kind, earned, dim }: { kind: CrownKind; earned: boolean; dim?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 20"
      width="14"
      height="12"
      aria-hidden="true"
      style={{
        opacity: earned ? (dim ? 0.75 : 1) : 0.18,
        filter: earned && !dim ? 'drop-shadow(0 0 2px rgba(0,0,0,.6))' : undefined,
      }}
    >
      <path
        d="M2 16 L2 5 L7 9 L12 2 L17 9 L22 5 L22 16 Z"
        fill={earned ? CROWN_COLOR[kind] : '#6b7280'}
        stroke="rgba(0,0,0,.45)"
        stroke-width="1"
        stroke-linejoin="round"
      />
      <rect x="2" y="16" width="20" height="2.5" fill={earned ? CROWN_COLOR[kind] : '#6b7280'} />
    </svg>
  );
}

/**
 * Muestra las variantes del monstruo una junto a otra. Los templados y
 * arcotemplados no existen para todos, y no hay lista de cuáles: si el archivo
 * falta, la imagen se quita sola y solo queda la normal.
 */
function VariantStrip({
  monster,
  missing,
  onMissing,
}: {
  monster: Monster;
  missing: MonsterVariant[];
  onMissing: (variant: MonsterVariant) => void;
}) {
  return (
    <div class="flex shrink-0 flex-wrap gap-1">
      {MONSTER_VARIANTS.filter((v) => !missing.includes(v)).map((variant) => (
        <figure key={variant} class="text-center">
          <img
            src={monsterIconPath(monster.id, variant)}
            alt={`${monster.name} ${VARIANT_LABEL[variant]}`}
            width="56"
            height="56"
            class="h-14 w-14 rounded-lg object-contain"
            style={
              variant === 'normal'
                ? { backgroundImage: `url("${monsterArtDataUri(monster, 56)}")`, backgroundSize: 'cover' }
                : undefined
            }
            onError={() => onMissing(variant)}
          />
          {variant !== 'normal' && (
            <figcaption class="mt-0.5 text-[10px] leading-none text-base-500">
              {VARIANT_LABEL[variant]}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

function MonsterTile(props: {
  monster: Monster;
  progress: MonsterProgress | undefined;
  isFavorite: boolean;
  onOpen: () => void;
}) {
  const { monster, progress, isFavorite, onOpen } = props;
  const crowns = deriveCrowns(monster, progress);

  return (
    <button
      onClick={onOpen}
      class="group flex flex-col items-center gap-1 rounded-lg border border-base-800 bg-base-900 p-2 text-center transition-colors hover:border-ember-500/60 hover:bg-base-850"
    >
      <span class="relative">
        <img
          src={monsterIconPath(monster.id)}
          alt=""
          width="72"
          height="72"
          loading="lazy"
          class="h-16 w-16 rounded-lg object-contain"
          style={{ backgroundImage: `url("${monsterArtDataUri(monster, 72)}")`, backgroundSize: 'cover' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }}
        />
        {isFavorite && (
          <span class="absolute -right-1 -top-1 text-xs text-ember-400" title="Favorito">★</span>
        )}
      </span>

      <span class="line-clamp-2 text-xs leading-tight text-base-300 group-hover:text-base-100">
        {monster.name}
      </span>

      <span class="flex gap-0.5">
        {CROWN_KINDS.map((kind) => (
          <Crown key={kind} kind={kind} earned={crowns[kind].earned} dim={!crowns[kind].fromSize} />
        ))}
      </span>
    </button>
  );
}

function MonsterDialog(props: {
  monster: Monster;
  progress: MonsterProgress | undefined;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onChange: (change: Partial<MonsterProgress>) => void;
  onClose: () => void;
}) {
  const { monster, progress, isFavorite, onToggleFavorite, onChange, onClose } = props;
  const p = { ...emptyProgress(), ...progress };
  const hunted = { ...emptyCounts(), ...p.hunted };
  const captured = { ...emptyCounts(), ...p.captured };

  // Qué niveles tiene este monstruo se deduce de qué iconos existen: no hay
  // lista de cuáles tienen templado o frenético, y mantenerla a mano se
  // desincronizaría con cada title update.
  const [missing, setMissing] = useState<MonsterVariant[]>([]);
  const available = MONSTER_VARIANTS.filter((v) => v === 'normal' || !missing.includes(v));
  const crowns = deriveCrowns(monster, p);
  const size = monster.size;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const numberField = (
    label: string,
    value: number | null,
    hint: string,
    onInput: (v: number | null) => void,
  ) => (
    <label class="block">
      <span class="mb-1 block text-xs text-base-300">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value ?? ''}
        placeholder="—"
        onInput={(e) => {
          const raw = (e.target as HTMLInputElement).value.trim();
          onInput(raw === '' ? null : Number(raw));
        }}
        class="w-full rounded border border-base-700 bg-base-950 px-2 py-1.5 text-sm outline-none focus:border-ember-500"
      />
      <span class="mt-0.5 block text-[11px] text-base-500">{hint}</span>
    </label>
  );

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-base-700 bg-base-900 p-4">
        <div class="mb-3 flex items-start gap-3">
          <VariantStrip
            monster={monster}
            missing={missing}
            onMissing={(variant) => setMissing((current) =>
              current.includes(variant) ? current : [...current, variant])}
          />
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-semibold">{monster.name}</h2>
            <p class="text-xs text-base-500">
              {SPECIES_LABEL[monster.species] ?? monster.species}
              {size && ` · tamaño base ${formatSize(size.base)}`}
            </p>
          </div>
          <button onClick={onToggleFavorite} class="text-lg" title="Favorito">
            <span class={isFavorite ? 'text-ember-400' : 'text-base-700'}>★</span>
          </button>
          <button onClick={onClose} class="text-base-500 hover:text-base-100" aria-label="Cerrar">×</button>
        </div>

        {size ? (
          <>
            <div class="mb-3 grid grid-cols-2 gap-2">
              {numberField('Tu más pequeño', p.smallest, `Corona pequeña con ${formatSize(size.mini)} o menos`,
                (v) => onChange({ smallest: v }))}
              {numberField('Tu más grande', p.largest, `Oro con ${formatSize(size.gold)} o más`,
                (v) => onChange({ largest: v }))}
            </div>

            <div class="mb-3 space-y-1.5">
              {CROWN_KINDS.map((kind) => {
                const state = crowns[kind];
                const threshold = kind === 'mini' ? size.mini : kind === 'silver' ? size.silver : size.gold;
                return (
                  <div key={kind} class="flex items-center gap-2 rounded bg-base-850 px-2 py-1.5 text-sm">
                    <Crown kind={kind} earned={state.earned} />
                    <span class="flex-1">
                      {kind === 'mini' ? 'Pequeña' : kind === 'silver' ? 'Plata' : 'Oro'}
                      <span class="ml-1 text-xs text-base-500">
                        {kind === 'mini' ? '≤' : '≥'} {formatSize(threshold)}
                      </span>
                    </span>
                    {state.fromSize ? (
                      <span class="text-xs text-jade-400">por tamaño</span>
                    ) : (
                      <label class="flex cursor-pointer items-center gap-1 text-xs text-base-500">
                        <input
                          type="checkbox"
                          checked={
                            kind === 'mini' ? p.manualMini : kind === 'silver' ? p.manualSilver : p.manualGold
                          }
                          onChange={(e) => {
                            const checked = (e.target as HTMLInputElement).checked;
                            onChange(
                              kind === 'mini' ? { manualMini: checked }
                              : kind === 'silver' ? { manualSilver: checked }
                              : { manualGold: checked },
                            );
                          }}
                        />
                        marcar
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            {crowns.nextGoal && (
              <p class="mb-3 rounded border border-ember-500/30 bg-ember-500/5 px-2 py-1.5 text-xs text-ember-300">
                Te faltan {formatSize(crowns.nextGoal.needed)} para la corona de{' '}
                {crowns.nextGoal.kind === 'silver' ? 'plata' : 'oro'}.
              </p>
            )}
          </>
        ) : (
          <p class="mb-3 text-sm text-base-500">Este monstruo no tiene umbrales de corona.</p>
        )}

        <div class="rounded border border-base-800">
          <div class="flex items-center gap-2 border-b border-base-800 px-2 py-1.5 text-[11px] text-base-500">
            <span class="flex-1">Nivel</span>
            <span class="w-16 text-center">Cazados</span>
            <span class="w-16 text-center">Capturados</span>
          </div>

          {available.map((variant) => (
            <div key={variant} class="flex items-center gap-2 px-2 py-1.5">
              <span class="flex-1 text-sm">{VARIANT_LABEL[variant]}</span>
              <input
                type="number" min="0" value={hunted[variant] || ''}
                placeholder="0"
                onInput={(e) => onChange({
                  hunted: { ...hunted, [variant]: Number((e.target as HTMLInputElement).value) || 0 },
                })}
                class="w-16 rounded border border-base-700 bg-base-950 px-1.5 py-1 text-center text-sm outline-none focus:border-ember-500"
              />
              <input
                type="number" min="0" value={captured[variant] || ''}
                placeholder="0"
                onInput={(e) => onChange({
                  captured: { ...captured, [variant]: Number((e.target as HTMLInputElement).value) || 0 },
                })}
                class="w-16 rounded border border-base-700 bg-base-950 px-1.5 py-1 text-center text-sm outline-none focus:border-ember-500"
              />
            </div>
          ))}

          {(sumCounts(hunted) > 0 || sumCounts(captured) > 0) && (
            <div class="flex items-center gap-2 border-t border-base-800 px-2 py-1.5 text-sm">
              <span class="flex-1 text-base-500">Total</span>
              <strong class="w-16 text-center">{sumCounts(hunted)}</strong>
              <strong class="w-16 text-center">{sumCounts(captured)}</strong>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
