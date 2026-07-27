import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import Pagination from './Pagination.tsx';
import Stepper from './ui/Stepper.tsx';
import { slotSvg } from '../lib/ui/glyphs.ts';
import { paginate } from '../lib/paginate.ts';
import { itemIconColor, itemIconPath } from '../lib/catalog/item-icons.ts';
import { translatorFor, type Locale, type Translator } from '../lib/i18n/index.ts';
import type { Catalog } from '../lib/catalog/types.ts';

type Tab = 'adornos' | 'talismanes' | 'armaduras' | 'materiales';

interface Inventory {
  decorations: Record<string, number>;
  charms: Record<string, number>;
  armor: number[];
  weapons: number[];
  materials: Record<string, number>;
}

const EMPTY: Inventory = { decorations: {}, charms: {}, armor: [], weapons: [], materials: {} };

/** Quita acentos y pasa a minúsculas para que "joya bendicion" encuentre "Joya bendición". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function InventoryEditor({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [inventory, setInventory] = useState<Inventory>(EMPTY);
  const [tab, setTab] = useState<Tab>('adornos');
  const [query, setQuery] = useState('');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [page, setPage] = useState(1);
  // 40 por página: el tamaño que fija el sistema para adornos, armaduras y materiales.
  const [pageSize, setPageSize] = useState(40);
  const [status, setStatus] = useState<'cargando' | 'listo' | 'guardando' | 'guardado' | 'error'>('cargando');
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cat, res] = await Promise.all([loadCatalog(), fetch('/api/inventory')]);
        setCatalog(cat);
        if (res.ok) {
          const doc = await res.json();
          setInventory({
            decorations: doc.decorations ?? {},
            charms: doc.charms ?? {},
            armor: doc.armor ?? [],
            weapons: doc.weapons ?? [],
            materials: doc.materials ?? {},
          });
        }
        setStatus('listo');
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : 'Error cargando el inventario.');
        setStatus('error');
      }
    })();
  }, []);

  // Guardado diferido: capturar 300 adornos dispararía 300 peticiones si se
  // guardara en cada tecla.
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<Inventory | null>(null);

  const scheduleSave = (next: Inventory) => {
    pending.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setStatus('guardando');
      try {
        const res = await fetch('/api/inventory', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(pending.current),
        });
        if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
        setStatus('guardado');
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : 'No se pudo guardar.');
        setStatus('error');
      }
    }, 800);
  };

  const update = (mutate: (draft: Inventory) => void) => {
    setInventory((current) => {
      const next: Inventory = {
        decorations: { ...current.decorations },
        charms: { ...current.charms },
        armor: [...current.armor],
        weapons: [...current.weapons],
        materials: { ...current.materials },
      };
      mutate(next);
      scheduleSave(next);
      return next;
    });
  };

  const setCount = (bucket: 'decorations' | 'charms' | 'materials', id: number, value: number) => {
    update((draft) => {
      if (value <= 0) delete draft[bucket][String(id)];
      else draft[bucket][String(id)] = value;
    });
  };

  const toggleArmor = (id: number) => {
    update((draft) => {
      const at = draft.armor.indexOf(id);
      if (at >= 0) draft.armor.splice(at, 1);
      else draft.armor.push(id);
    });
  };

  const skillName = useMemo(() => {
    const map = new Map<number, string>();
    for (const skill of catalog?.skills ?? []) map.set(skill.id, skill.name);
    return map;
  }, [catalog]);

  const needle = normalize(query.trim());

  const rows = useMemo(() => {
    if (!catalog) return [];

    const matches = (name: string, extra = '') =>
      !needle || normalize(`${name} ${extra}`).includes(needle);

    if (tab === 'adornos') {
      return catalog.decorations
        .filter((d) => {
          const skills = d.skills.map((s) => skillName.get(s.skillId) ?? '').join(' ');
          if (!matches(d.name, skills)) return false;
          if (onlyOwned && !(inventory.decorations[String(d.id)] > 0)) return false;
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }

    if (tab === 'talismanes') {
      return catalog.charms.filter((c) => {
        const skills = c.ranks.flatMap((r) => r.skills.map((s) => skillName.get(s.skillId) ?? '')).join(' ');
        if (!matches(c.name, skills)) return false;
        if (onlyOwned && !(inventory.charms[String(c.id)] > 0)) return false;
        return true;
      });
    }

    if (tab === 'armaduras') {
      return catalog.armor
        .filter((a) => {
          const skills = a.skills.map((s) => skillName.get(s.skillId) ?? '').join(' ');
          if (!matches(a.name, skills)) return false;
          if (onlyOwned && !inventory.armor.includes(a.id)) return false;
          return true;
        });
    }

    return catalog.items
      .filter((i) => {
        if (!matches(i.name)) return false;
        if (onlyOwned && !(inventory.materials[String(i.id)] > 0)) return false;
        return true;
      });
  }, [catalog, tab, needle, onlyOwned, inventory, skillName]);

  // `rows` es la lista completa ya filtrada; `visible` es solo la página actual.
  const pageInfo = paginate(rows.length, page, pageSize);
  const visible = rows.slice(pageInfo.start, pageInfo.end);

  if (status === 'cargando') {
    return <p class="py-10 text-center text-base-500">{t('common.loadingCatalog')}</p>;
  }
  if (status === 'error' && !catalog) {
    return <p class="py-10 text-center text-red-300">{errorText}</p>;
  }

  const ownedDecoCount = Object.values(inventory.decorations).reduce((a, b) => a + b, 0);

  const tabs: [Tab, string, number][] = [
    ['adornos', t('inventory.decorations'), Object.keys(inventory.decorations).length],
    ['talismanes', t('inventory.charms'), Object.keys(inventory.charms).length],
    ['armaduras', t('inventory.armor'), inventory.armor.length],
    ['materiales', t('inventory.materials'), Object.keys(inventory.materials).length],
  ];

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => { setTab(key); setQuery(''); setPage(1); }}
            class={`rounded px-3 py-1.5 text-sm transition-colors ${
              tab === key ? 'bg-ember-500 text-base-950' : 'bg-base-850 text-base-300 hover:bg-base-800'
            }`}
          >
            {label}
            {count > 0 && <span class="ml-1.5 opacity-70">{count}</span>}
          </button>
        ))}

        <span class="ml-auto text-xs text-base-500">
          {status === 'guardando' && t('builder.saving')}
          {status === 'guardado' && t('builder.saved')}
          {status === 'error' && <span class="text-red-300">{errorText}</span>}
        </span>
      </div>

      <div class="mb-3 flex flex-wrap gap-2">
        <input
          value={query}
          onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setPage(1); }}
          placeholder={tab === 'adornos' ? t('inventory.searchDecorations') : t('inventory.search')}
          class="min-w-0 flex-1 rounded border border-base-700 bg-base-900 px-3 py-2 outline-none focus:border-ember-500"
        />
        <label class="flex items-center gap-2 rounded border border-base-700 px-3 text-sm text-base-300">
          <input
            type="checkbox"
            checked={onlyOwned}
            onChange={(e) => { setOnlyOwned((e.target as HTMLInputElement).checked); setPage(1); }}
          />
          {t('inventory.onlyOwned')}
        </label>
      </div>

      {tab === 'adornos' && (
        <p class="mb-3 text-xs text-base-500">
          {t('inventory.decoCount', { count: ownedDecoCount })}
        </p>
      )}

      <div class="divide-y divide-base-850 rounded border border-base-800">
        {rows.length === 0 && (
          <p class="px-3 py-6 text-center text-sm text-base-500">{t('inventory.nothingMatches')}</p>
        )}

        {tab === 'adornos' && (visible as Catalog['decorations']).map((deco) => (
          <Row
            key={deco.id}
            title={deco.name}
            subtitle={deco.skills.map((s) => `${skillName.get(s.skillId)} ${s.level}`).join(' · ')}
            badge={<SlotBadge size={deco.slot} kind={deco.kind} t={t} />}
          >
            <Stepper
              value={inventory.decorations[String(deco.id)] ?? 0}
              max={99}
              onChange={(v) => setCount('decorations', deco.id, v)}
              labelAdd={t('inventory.addOne')}
              labelRemove={t('inventory.removeOne')}
              name={deco.name}
            />
          </Row>
        ))}

        {tab === 'talismanes' && (visible as Catalog['charms']).map((charm) => {
          const owned = inventory.charms[String(charm.id)] ?? 0;
          const maxRank = charm.ranks.at(-1)?.level ?? 1;
          return (
            <Row
              key={charm.id}
              title={charm.name}
              subtitle={charm.ranks
                .map((r) => `nv${r.level}: ${r.skills.map((s) => `${skillName.get(s.skillId)} ${s.level}`).join(', ')}`)
                .join('  ·  ')}
            >
              {/* Lo que importa no es "cuántos" sino hasta qué rango lo forjaste. */}
              <div class="flex gap-1">
                <button
                  onClick={() => setCount('charms', charm.id, 0)}
                  class={`rounded px-2 py-1 text-xs ${owned === 0 ? 'bg-base-700 text-base-100' : 'bg-base-850 text-base-500 hover:bg-base-800'}`}
                >
                  {t('inventory.no')}
                </button>
                {charm.ranks.map((rank) => (
                  <button
                    key={rank.level}
                    onClick={() => setCount('charms', charm.id, rank.level)}
                    class={`rounded px-2 py-1 text-xs ${
                      owned === rank.level ? 'bg-ember-500 text-base-950' : 'bg-base-850 text-base-300 hover:bg-base-800'
                    }`}
                  >
                    {rank.level}
                  </button>
                ))}
                {maxRank > 1 && <span class="self-center pl-1 text-xs text-base-500">{t('inventory.rank')}</span>}
              </div>
            </Row>
          );
        })}

        {tab === 'armaduras' && (visible as Catalog['armor']).map((piece) => (
          <Row
            key={piece.id}
            title={piece.name}
            subtitle={`${piece.kind} · def ${piece.defense} · ${
              piece.skills.map((s) => `${skillName.get(s.skillId)} ${s.level}`).join(', ') || t('inventory.noSkills')
            }`}
            badge={<span class="text-xs text-base-500">{piece.slots.map((s) => `[${s}]`).join('') || '—'}</span>}
          >
            <label class="flex cursor-pointer items-center gap-2 text-sm text-base-300">
              <input
                type="checkbox"
                checked={inventory.armor.includes(piece.id)}
                onChange={() => toggleArmor(piece.id)}
              />
              {t('inventory.iHaveIt')}
            </label>
          </Row>
        ))}

        {tab === 'materiales' && (visible as Catalog['items']).map((item) => (
          <Row
            key={item.id}
            title={item.name}
            subtitle={`${t('inventory.rarity')} ${item.rarity}`}
            badge={<MaterialIcon item={item} />}
          >
            <Stepper
              value={inventory.materials[String(item.id)] ?? 0}
              max={9999}
              onChange={(v) => setCount('materials', item.id, v)}
              labelAdd={t('inventory.addOne')}
              labelRemove={t('inventory.removeOne')}
              name={item.name}
            />
          </Row>
        ))}
      </div>

      <Pagination
        info={pageInfo}
        onPage={setPage}
        onPageSize={(size) => { setPageSize(size); setPage(1); }}
        t={t}
        label={(
          tab === 'adornos' ? t('inventory.decorations')
          : tab === 'talismanes' ? t('inventory.charms')
          : tab === 'armaduras' ? t('inventory.pieces')
          : t('inventory.materials')
        ).toLowerCase()}
      />
    </div>
  );
}

function Row(props: {
  title: string;
  subtitle?: string;
  badge?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <div class="flex items-center gap-3 px-3 py-2 hover:bg-base-900">
      {props.badge}
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm">{props.title}</p>
        {props.subtitle && <p class="truncate text-xs text-base-500">{props.subtitle}</p>}
      </div>
      {props.children}
    </div>
  );
}

/**
 * El archivo del wiki es monocromo: se usa como máscara y el color lo pone la
 * API, así 62 formas cubren los 773 materiales.
 */
function MaterialIcon({ item }: { item: Catalog['items'][number] }) {
  const path = itemIconPath(item.iconKind ?? undefined);
  const color = itemIconColor(item.iconColor ?? undefined);

  if (!path) {
    return (
      <span
        class="ml-1 w-8 shrink-0"
        style={{ display: 'inline-block' }}
      >
        <span
          style={{ display: 'block', width: 18, height: 18, borderRadius: 9, background: color, opacity: 0.45 }}
        />
      </span>
    );
  }

  return (
    <span class="ml-1 w-8 shrink-0" style={{ display: 'inline-block' }}>
      <span
        style={{
          display: 'block',
          width: 18,
          height: 18,
          backgroundColor: color,
          WebkitMask: `url("${path}") center/contain no-repeat`,
          mask: `url("${path}") center/contain no-repeat`,
        }}
      />
    </span>
  );
}

/** Rombo con el dígito impreso: el nivel no depende solo del color. */
function SlotBadge({ size, kind, t }: { size: number; kind: 'armor' | 'weapon'; t: Translator }) {
  return (
    <span
      class="flex w-10 shrink-0 items-center justify-center gap-0.5"
      title={kind === 'weapon' ? t('inventory.weaponDeco') : t('inventory.armorDeco')}
    >
      <span dangerouslySetInnerHTML={{ __html: slotSvg(size) }} />
      {kind === 'weapon' && <span class="text-[10px] text-accent">⚔</span>}
    </span>
  );
}

