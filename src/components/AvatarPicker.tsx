import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import type { Catalog, Monster } from '../lib/catalog/types.ts';
import { monsterArtDataUri } from '../lib/monster-art.ts';
import Pagination from './Pagination.tsx';
import { paginate } from '../lib/paginate.ts';
import { translatorFor, type Locale } from '../lib/i18n/index.ts';
import {
  MONSTER_VARIANTS,
  monsterIconPath,
  type MonsterVariant,
} from '../lib/catalog/monster-icons.ts';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

interface Props {
  monsterId: number | null;
  variant: MonsterVariant;
  locale: Locale;
}

export default function AvatarPicker({ monsterId, variant, locale }: Props) {
  const t = translatorFor(locale);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState<number | null>(monsterId);
  const [selectedVariant, setSelectedVariant] = useState<MonsterVariant>(variant);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  /**
   * Qué niveles tiene cada monstruo se deduce de qué iconos existen: no hay
   * lista de cuáles tienen curtido o archicurtido, y mantenerla a mano se
   * desincronizaría con cada title update.
   */
  const [missing, setMissing] = useState<MonsterVariant[]>([]);
  const [status, setStatus] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle');

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => setStatus('error'));
  }, []);

  const monsters = catalog?.monsters ?? [];
  const current = selected != null ? monsters.find((m) => m.id === selected) ?? null : null;
  // El normal siempre está; los demás solo si su archivo existe.
  const available = MONSTER_VARIANTS.filter((v) => v === 'normal' || !missing.includes(v));

  const matching = useMemo(() => {
    const needle = normalize(query.trim());
    return needle ? monsters.filter((m) => normalize(m.name).includes(needle)) : monsters;
  }, [monsters, query]);

  const pageInfo = paginate(matching.length, page, 24);
  const visible = matching.slice(pageInfo.start, pageInfo.end);

  const save = async (id: number | null, v: MonsterVariant) => {
    if (id !== selected) setMissing([]);
    setSelected(id);
    setSelectedVariant(v);
    setStatus('guardando');
    try {
      const res = await fetch('/api/avatar', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ monsterId: id, variant: v }),
      });
      setStatus(res.ok ? 'guardado' : 'error');
    } catch {
      setStatus('error');
    }
  };

  // Un avatar guardado con una variante cuyo icono ya no está no debe quedar roto.
  const effectiveVariant = missing.includes(selectedVariant) ? 'normal' : selectedVariant;

  return (
    <div>
      <div class="flex items-center gap-3">
        <Preview
          monster={current}
          variant={effectiveVariant}
          size={56}
          onMissing={() => setMissing((cur) =>
            cur.includes(selectedVariant) ? cur : [...cur, selectedVariant])}
        />

        <div class="flex-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            class="rounded border border-base-700 px-3 py-1.5 text-sm hover:bg-base-850"
          >
            {current ? t('account.change') : t('account.pickMonster')}
          </button>
          {current && (
            <button
              type="button"
              onClick={() => { save(null, 'normal'); setOpen(false); }}
              class="ml-2 text-sm text-base-500 hover:text-red-300"
            >
              {t('account.remove')}
            </button>
          )}
          <p class="mt-1 text-xs text-base-500">
            {current
              ? `${current.name}${effectiveVariant === 'normal' ? '' : ` · ${t(`variant.${effectiveVariant}` as never)}`}`
              : t('account.avatarFallback')}
            {status === 'guardando' && t('crowns.saving')}
            {status === 'guardado' && t('crowns.saved')}
            {status === 'error' && <span class="text-red-300">{t('crowns.saveError')}</span>}
          </p>
        </div>
      </div>

      {current && available.length > 1 && (
        <div class="mt-3 flex flex-wrap gap-2">
          {available.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => save(current.id, v)}
              class={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs ${
                selectedVariant === v
                  ? 'border-ember-500 bg-ember-500/10 text-ember-300'
                  : 'border-base-700 text-base-300 hover:bg-base-850'
              }`}
            >
              <Preview
                monster={current}
                variant={v}
                size={32}
                round={false}
                onMissing={() => setMissing((cur) => (cur.includes(v) ? cur : [...cur, v]))}
              />
              {t(`variant.${v}` as never)}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div class="mt-3 rounded border border-base-800 bg-base-950 p-2">
          <input
            value={query}
            onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setPage(1); }}
            placeholder={t('crowns.searchMonster')}
            class="mb-2 w-full rounded border border-base-700 bg-base-900 px-3 py-1.5 text-sm outline-none focus:border-ember-500"
          />
          <div class="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1 overflow-y-auto">
            {visible.map((monster) => (
              <button
                key={monster.id}
                type="button"
                onClick={() => { save(monster.id, selectedVariant); setOpen(false); }}
                class={`flex flex-col items-center gap-0.5 rounded p-1 hover:bg-base-850 ${
                  selected === monster.id ? 'bg-ember-500/15' : ''
                }`}
                title={monster.name}
              >
                <Preview monster={monster} variant="normal" size={40} round={false} />
                <span class="line-clamp-1 text-[10px] text-base-500">{monster.name}</span>
              </button>
            ))}
          </div>

          <Pagination info={pageInfo} onPage={setPage} label={t('crowns.monsters')} t={t} />
        </div>
      )}
    </div>
  );
}

function Preview({
  monster,
  variant,
  size,
  round = true,
  onMissing,
}: {
  monster: Monster | null;
  variant: MonsterVariant;
  size: number;
  round?: boolean;
  onMissing?: () => void;
}) {
  if (!monster) {
    return (
      <span
        class="flex shrink-0 items-center justify-center rounded-full bg-base-800 text-base-500 ring-1 ring-base-700"
        style={{ width: size, height: size }}
      >
        ?
      </span>
    );
  }

  return (
    <span
      class={`block shrink-0 overflow-hidden ring-1 ring-base-700 ${round ? 'rounded-full' : 'rounded'}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url("${monsterArtDataUri(monster, size)}")`,
        backgroundSize: 'cover',
      }}
    >
      <img
        src={monsterIconPath(monster.id, variant)}
        alt=""
        width={size}
        height={size}
        class="h-full w-full object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.opacity = '0';
          onMissing?.();
        }}
      />
    </span>
  );
}
