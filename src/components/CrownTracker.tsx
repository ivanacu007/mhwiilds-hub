import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import { crownSvg } from '../lib/ui/glyphs.ts';
import Stepper from './ui/Stepper.tsx';
import { translatorFor, type Locale, type Translator } from '../lib/i18n/index.ts';
import type { Catalog, Monster } from '../lib/catalog/types.ts';
import {
  CROWN_KEYS, crownsOf, emptyCounts, emptyCrowns, emptyProgress, sumCounts, tallyCrowns,
  type CrownKey,
} from '../lib/crowns.ts';
import { monsterArtDataUri } from '../lib/monster-art.ts';
import { MONSTER_VARIANTS, monsterIconPath, type MonsterVariant } from '../lib/catalog/monster-icons.ts';
import type { MonsterProgress } from '../lib/models.ts';

type Progress = Record<string, MonsterProgress>;

const FILTER_KEY = {
  todos: 'crowns.filterAll',
  faltantes: 'crowns.filterMissing',
  completos: 'crowns.filterComplete',
  favoritos: 'crowns.filterFavorites',
} as const;

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function CrownTracker({ favorites, locale }: { favorites: number[]; locale: Locale }) {
  const t = translatorFor(locale);
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

  const matching = useMemo(() => {
    const needle = normalize(query.trim());
    return monsters.filter((m) => {
      if (needle && !normalize(m.name).includes(needle)) return false;
      const c = crownsOf(progress[String(m.id)]);
      const all = CROWN_KEYS.every((key) => c[key]);
      if (filter === 'faltantes' && all) return false;
      if (filter === 'completos' && !all) return false;
      if (filter === 'favoritos' && !favs.includes(m.id)) return false;
      return true;
    });
  }, [monsters, query, filter, progress, favs]);

  // Sin paginar nunca: la rejilla existe para ver los 34 de un vistazo.
  const visible = matching;

  if (status === 'cargando') return <p class="py-10 text-center text-text-3">{t('common.loading')}</p>;
  if (!catalog) return <p class="py-10 text-center text-red-300">{t('common.catalogError')}</p>;

  const tally = tallyCrowns(monsters, progress);

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center gap-3 rounded border border-bg-3 bg-bg-1 px-3 py-2">
        {CROWN_KEYS.map((key) => (
          <Stat key={key} label={t(`crowns.${key}` as never)} value={tally[key]} total={tally.total} crown={key} t={t} />
        ))}
        <span class="ml-auto text-xs text-text-3">
          {t('crowns.complete', { done: tally.complete, total: tally.total })}
          {status === 'guardando' && t('crowns.saving')}
          {status === 'guardado' && t('crowns.saved')}
          {status === 'error' && <span class="text-red-300">{t('crowns.saveError')}</span>}
        </span>
      </div>

      <div class="mb-4 flex flex-wrap gap-2">
        <input
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder={t('crowns.searchMonster')}
          class="min-w-0 flex-1 rounded border border-line-strong bg-bg-1 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {(['todos', 'faltantes', 'completos', 'favoritos'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            class={`rounded px-3 py-1.5 text-sm capitalize ${
              filter === f ? 'bg-accent text-bg-0' : 'bg-bg-2 text-text-2 hover:bg-bg-3'
            }`}
          >
            {t(FILTER_KEY[f])}
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
            t={t}
          />
        ))}
      </div>

      {matching.length === 0 && (
        <p class="py-10 text-center text-sm text-text-3">{t('crowns.noneMatch')}</p>
      )}

      {open != null && (
        <MonsterDialog
          monster={monsters.find((m) => m.id === open)!}
          progress={progress[String(open)]}
          isFavorite={favs.includes(open)}
          onToggleFavorite={() => toggleFavorite(open)}
          onChange={(change) => patch(open, change)}
          onClose={() => setOpen(null)}
          t={t}
        />
      )}
    </div>
  );
}

function Stat({ label, value, total, crown, t }: {
  label: string; value: number; total: number; crown: CrownKey; t: Translator;
}) {
  return (
    <span class="flex items-center gap-1.5 text-sm">
      <Crown crown={crown} earned t={t} />
      <span class="text-text-2">{label}</span>
      <strong>{value}</strong>
      <span class="text-text-3">/{total}</span>
    </span>
  );
}

/**
 * La corona la dibuja el glifo compartido: color por tipo, **silueta por dato**.
 * Plata es contorno de tres puntas y oro sólida de cinco con estrella, así que
 * se distinguen sin depender del tono.
 */
function Crown({ crown, earned, dim, t }: {
  crown: CrownKey; earned: boolean; dim?: boolean; t: Translator;
}) {
  return (
    <span
      class="inline-flex shrink-0 align-middle"
      style={{ opacity: earned ? (dim ? 0.7 : 1) : 1 }}
      role="img"
      aria-label={t(`crowns.${crown}` as never)}
      dangerouslySetInnerHTML={{ __html: crownSvg(crown, earned) }}
    />
  );
}

/**
 * Muestra las variantes del monstruo una junto a otra. Los niveles que existen
 * los declara la API; los iconos que falten se ocultan solos.
 */
function VariantStrip({
  monster,
  variants,
  missing,
  onMissing,
  t,
}: {
  monster: Monster;
  variants: MonsterVariant[];
  missing: MonsterVariant[];
  onMissing: (variant: MonsterVariant) => void;
  t: Translator;
}) {
  return (
    <div class="flex shrink-0 flex-wrap gap-1">
      {variants.filter((v) => !missing.includes(v)).map((variant) => (
        <figure key={variant} class="text-center">
          <img
            src={monsterIconPath(monster.id, variant)}
            alt={`${monster.name} ${t(`variant.${variant}` as never)}`}
            width="56"
            height="56"
            class="tile h-14 w-14 object-contain"
            style={
              variant === 'normal'
                ? { backgroundImage: `url("${monsterArtDataUri(monster, 56)}")`, backgroundSize: 'cover' }
                : undefined
            }
            onError={() => onMissing(variant)}
          />
          {variant !== 'normal' && (
            <figcaption class="mt-0.5 text-[10px] leading-none text-text-3">
              {t(`variant.${variant}` as never)}
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
  t: Translator;
}) {
  const { monster, progress, isFavorite, onOpen, t } = props;
  const crowns = crownsOf(progress);

  return (
    <button
      onClick={onOpen}
      class="group flex flex-col items-center gap-1 rounded-lg border border-bg-3 bg-bg-1 p-2 text-center transition-colors hover:border-accent/60 hover:bg-bg-2"
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
          <span class="absolute -right-1 -top-1 text-xs text-accent-hi" title={t('crowns.favorite')}>★</span>
        )}
      </span>

      <span class="line-clamp-2 text-xs leading-tight text-text-2 group-hover:text-text-1">
        {monster.name}
      </span>

      <span class="flex gap-0.5">
        {CROWN_KEYS.map((key) => (
          <Crown key={key} crown={key} earned={crowns[key]} t={t} />
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
  t: Translator;
}) {
  const { monster, progress, isFavorite, onToggleFavorite, onChange, onClose, t } = props;
  const p = { ...emptyProgress(), ...progress };
  const hunted = { ...emptyCounts(), ...p.hunted };
  const captured = { ...emptyCounts(), ...p.captured };
  const crowns = { ...emptyCrowns(), ...p.crowns };

  // Los niveles que tiene el monstruo los declara la API. Antes se deducían de
  // si existía el archivo del icono, y eso escondía la fila de un nivel real
  // cuando faltaba su imagen: Gogmazios tiene curtido y no se podía registrar.
  const declared = new Set(monster.variants);
  const available = MONSTER_VARIANTS.filter((v) => v === 'normal' || declared.has(v));

  // La tira de iconos sí depende de los archivos: se oculta el que no cargue.
  const [missing, setMissing] = useState<MonsterVariant[]>([]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-line-strong bg-bg-1 p-4">
        <div class="mb-3 flex items-start gap-3">
          <VariantStrip
            monster={monster}
            variants={available}
            missing={missing}
            onMissing={(variant) => setMissing((current) =>
              current.includes(variant) ? current : [...current, variant])}
            t={t}
          />
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-semibold">{monster.name}</h2>
            <p class="text-xs text-text-3">
              {t(`species.${monster.species}` as never)}
            </p>
          </div>
          <button onClick={onToggleFavorite} class="text-lg" title={t('crowns.favorite')}>
            <span class={isFavorite ? 'text-accent-hi' : 'text-line-strong'}>★</span>
          </button>
          <button onClick={onClose} class="text-text-3 hover:text-text-1" aria-label={t('crowns.close')}>×</button>
        </div>

        <div class="mb-3 grid grid-cols-2 gap-1.5">
          {CROWN_KEYS.map((key) => (
            <label
              key={key}
              class={`flex cursor-pointer items-center gap-2 rounded border px-2 py-2 text-sm transition-colors ${
                crowns[key]
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-bg-3 bg-bg-2 hover:bg-bg-3'
              }`}
            >
              <input
                type="checkbox"
                checked={crowns[key]}
                onChange={(e) => onChange({
                  crowns: { ...crowns, [key]: (e.target as HTMLInputElement).checked },
                })}
              />
              <Crown crown={key} earned={crowns[key]} t={t} />
              <span class={crowns[key] ? '' : 'text-text-3'}>{t(`crowns.${key}` as never)}</span>
            </label>
          ))}
        </div>

        <div class="rounded border border-bg-3">
          <div class="flex items-center gap-2 border-b border-bg-3 px-2 py-1.5 text-[11px] text-text-3">
            <span class="flex-1">{t('crowns.level')}</span>
            <span class="w-[104px] text-center">{t('crowns.hunted')}</span>
            <span class="w-[104px] text-center">{t('crowns.captured')}</span>
          </div>

          {available.map((variant) => (
            <div key={variant} class="flex items-center gap-2 px-2 py-1.5">
              <span class="flex-1 text-sm">{t(`variant.${variant}` as never)}</span>
              <Stepper
                value={hunted[variant]}
                max={99999}
                onChange={(v) => onChange({ hunted: { ...hunted, [variant]: v } })}
                labelAdd={t('crowns.hunted')}
                labelRemove={t('crowns.hunted')}
                name={`${t('crowns.hunted')} · ${t(`variant.${variant}` as never)}`}
              />
              <Stepper
                value={captured[variant]}
                max={99999}
                onChange={(v) => onChange({ captured: { ...captured, [variant]: v } })}
                labelAdd={t('crowns.captured')}
                labelRemove={t('crowns.captured')}
                name={`${t('crowns.captured')} · ${t(`variant.${variant}` as never)}`}
              />
            </div>
          ))}

          {(sumCounts(hunted) > 0 || sumCounts(captured) > 0) && (
            <div class="flex items-center gap-2 border-t border-bg-3 px-2 py-1.5 text-sm">
              <span class="flex-1 text-text-3">{t('crowns.total')}</span>
              <strong class="num w-[104px] text-center">{sumCounts(hunted)}</strong>
              <strong class="num w-[104px] text-center">{sumCounts(captured)}</strong>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
