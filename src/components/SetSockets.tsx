import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadCatalog } from '../lib/client/catalog-client.ts';
import { ARMOR_KINDS, indexCatalog, type ArmorKind, type Catalog } from '../lib/catalog/types.ts';
import { summarizeLoadout } from '../lib/catalog/loadout.ts';
import { weaponSkillsFor } from '../lib/builder/weapon-skills.ts';
import SlotPicker from './SlotPicker.tsx';
import SkillPanel from './SkillPanel.tsx';
import { translatorFor, type Locale } from '../lib/i18n/index.ts';
import { gearIconStyle } from '../lib/ui/gear-icons.ts';
import { slotSvg } from '../lib/ui/glyphs.ts';

/**
 * La ficha del set, editable en las ranuras.
 *
 * Es la misma pantalla de siempre —equipo a la izquierda, habilidades activas a
 * la derecha— pero con los rombos pulsables. Aquí es donde tiene más sentido
 * engarzar: las dos listas están a la vista, así que se ve al momento qué
 * habilidad sube o aparece al meter una joya, que es justo lo que no se ve
 * haciéndolo desde el armador.
 *
 * Solo se monta para quien es dueño del set: hace falta bajar el catálogo, y no
 * vale la pena cargárselo a quien solo abre un enlace compartido para mirar.
 */
export interface SetSocketsProps {
  locale: Locale;
  setId: string;
  pieces: Partial<Record<ArmorKind, number | null>>;
  weaponId: number | null;
  charmId: number | null;
  charmLevel: number | null;
  initialSockets: Record<string, number>;
}

const KIND_KEY = {
  head: 'piece.head', chest: 'piece.chest', arms: 'piece.arms',
  waist: 'piece.waist', legs: 'piece.legs',
} as const;

export default function SetSockets(props: SetSocketsProps) {
  const { locale, setId, pieces, weaponId, charmId, charmLevel } = props;
  const t = translatorFor(locale);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [sockets, setSockets] = useState<Record<string, number>>(props.initialSockets);
  const [openSlot, setOpenSlot] = useState<{ kind: ArmorKind | 'weapon'; index: number; slot: number } | null>(null);
  const [saving, setSaving] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle');

  useEffect(() => {
    let disposed = false;
    (async () => {
      const [cat, res] = await Promise.all([
        loadCatalog(['armor', 'armorSets', 'charms', 'decorations', 'skills', 'weapons']),
        fetch('/api/inventory'),
      ]);
      if (disposed) return;
      setCatalog(cat);
      if (res.ok) setOwned((await res.json()).decorations ?? {});
    })().catch(() => {});
    return () => { disposed = true; };
  }, []);

  const index = useMemo(() => (catalog ? indexCatalog(catalog) : null), [catalog]);

  const socketsOf = (kind: ArmorKind | 'weapon') =>
    Object.entries(sockets)
      .filter(([key]) => key.startsWith(`${kind}:`))
      .map(([key, decorationId]) => ({ slotIndex: Number(key.split(':')[1]), decorationId }));

  const loadout = useMemo(() => ({
    pieces: Object.fromEntries(
      ARMOR_KINDS.filter((kind) => pieces[kind] != null).map((kind) => [
        kind,
        { armorId: pieces[kind]!, decorations: socketsOf(kind) },
      ]),
    ),
    weaponId,
    weaponDecorations: socketsOf('weapon'),
    charmId,
    charmLevel,
  }), [pieces, weaponId, charmId, charmLevel, sockets]);

  const summary = useMemo(
    () => (index ? summarizeLoadout(index, loadout) : null),
    [index, loadout],
  );

  /** Lo que busca el set: lo que persigue su arma, que es lo que se sabe aquí. */
  const wantedSkills = useMemo(() => {
    const map = new Map<number, number>();
    if (!index || weaponId == null) return map;
    const weapon = index.weaponById.get(weaponId);
    if (!weapon) return map;
    for (const hint of weaponSkillsFor(weapon.kind)) {
      map.set(hint.skillId, index.skillById.get(hint.skillId)?.ranks.length ?? 1);
    }
    return map;
  }, [index, weaponId]);

  /** Se guarda solo al cambiar una ranura: es una acción, no un borrador. */
  const persist = async (next: Record<string, number>) => {
    setSaving('guardando');
    const of = (kind: ArmorKind | 'weapon') =>
      Object.entries(next)
        .filter(([key]) => key.startsWith(`${kind}:`))
        .map(([key, decorationId]) => ({ slotIndex: Number(key.split(':')[1]), decorationId }));
    try {
      const res = await fetch(`/api/sets/${setId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          piezas: true,
          weaponId,
          weaponDecorations: of('weapon'),
          ...Object.fromEntries(ARMOR_KINDS.map((kind) => [
            kind,
            pieces[kind] != null ? { armorId: pieces[kind], decorations: of(kind) } : null,
          ])),
          charmId,
          charmLevel,
        }),
      });
      if (!res.ok) throw new Error();
      setSaving('guardado');
    } catch {
      setSaving('error');
    }
  };

  const setSocket = (kind: ArmorKind | 'weapon', slotIndex: number, decorationId: number | null) => {
    const next = { ...sockets };
    if (decorationId == null) delete next[`${kind}:${slotIndex}`];
    else next[`${kind}:${slotIndex}`] = decorationId;
    setSockets(next);
    setOpenSlot(null);
    void persist(next);
  };

  if (!index || !summary) {
    return <p class="py-10 text-center text-text-3">{t('common.loading')}</p>;
  }

  const weapon = weaponId != null ? index.weaponById.get(weaponId) ?? null : null;
  const charm = charmId != null ? index.charmById.get(charmId) ?? null : null;

  const slotRow = (kind: ArmorKind | 'weapon', slots: number[]) => (
    <span class="flex shrink-0 gap-[3px]">
      {slots.map((level, i) => {
        const decorationId = sockets[`${kind}:${i}`];
        const deco = decorationId != null ? index.decorationById.get(decorationId) : null;
        return (
          <button
            key={i}
            onClick={() => setOpenSlot({ kind, index: i, slot: level })}
            title={deco ? deco.name : t('slots.empty')}
            aria-label={deco ? deco.name : t('slots.empty')}
            class="leading-none hover:opacity-80"
            dangerouslySetInnerHTML={{ __html: slotSvg(level, deco != null, true) }}
          />
        );
      })}
    </span>
  );

  const rows = [
    ...(weapon ? [{
      label: t('piece.weapon'), icon: weapon.kind, name: weapon.name,
      slots: weapon.slots, kind: 'weapon' as const, tone: 'var(--text-2)',
    }] : []),
    ...ARMOR_KINDS.map((kind) => {
      const piece = pieces[kind] != null ? index.armorById.get(pieces[kind]!) : null;
      return {
        label: t(KIND_KEY[kind]), icon: kind, name: piece?.name ?? null,
        slots: piece?.slots ?? [], kind, tone: piece ? 'var(--text-2)' : 'var(--text-3)',
      };
    }),
    ...(charm ? [{
      label: t('piece.charm'), icon: 'charm', name: `${charm.name} ${charmLevel}`,
      slots: [], kind: 'charm' as const, tone: 'var(--crown-gold)',
    }] : []),
  ];

  return (
    <>
      {openSlot && (
        <SlotPicker
          index={index}
          t={t}
          slot={openSlot.slot}
          kind={openSlot.kind === 'weapon' ? 'weapon' : 'armor'}
          wantedSkills={wantedSkills}
          currentLevels={new Map(summary.skills.map((s) => [s.skillId, s.level]))}
          ownedDecorations={owned}
          current={sockets[`${openSlot.kind}:${openSlot.index}`] ?? null}
          onPick={(decorationId) => setSocket(openSlot.kind, openSlot.index, decorationId)}
          onClose={() => setOpenSlot(null)}
        />
      )}

      <div class="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <section class="panel">
          <h2 class="font-ui flex items-center gap-2 border-b border-line bg-panel-head px-3 py-1 text-[13px] uppercase tracking-[0.1em] text-text-2">
            {t('sets.equipment')}
            <span class="num ml-auto text-[11px] normal-case tracking-normal text-text-3">
              {saving === 'guardando' ? t('builder.saving')
                : saving === 'guardado' ? t('builder.saved')
                : saving === 'error' ? t('common.error')
                : t('slots.tapHint')}
            </span>
          </h2>

          {rows.map((row) => (
            <div key={row.kind} class="flex items-center gap-2.5 border-b border-line-soft px-3 py-1.5 last:border-b-0">
              <span class="grid h-[26px] w-[26px] shrink-0 place-items-center border border-line-strong bg-tile">
                <span style={gearIconStyle(row.icon, 16, row.tone)} />
              </span>
              <span class="min-w-0 flex-1">
                <span class="font-ui block text-[10.5px] uppercase tracking-[0.1em] text-text-3">
                  {row.label}
                </span>
                <span class={`block truncate text-[14px] ${row.name ? '' : 'text-text-3'}`}>
                  {row.name ?? '—'}
                </span>
                {/* Las joyas puestas, bajo su pieza. */}
                {row.kind !== 'charm' && socketsOf(row.kind as ArmorKind | 'weapon').length > 0 && (
                  <span class="block truncate text-[12px] text-accent-hi">
                    {socketsOf(row.kind as ArmorKind | 'weapon')
                      .map((d) => index.decorationById.get(d.decorationId)?.name)
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </span>
              {row.kind !== 'charm' && slotRow(row.kind as ArmorKind | 'weapon', row.slots)}
            </div>
          ))}
        </section>

        <SkillPanel
          locale={locale}
          title={t('sets.activeSkills')}
          skills={summary.skills.flatMap((s) => {
            const skill = index.skillById.get(s.skillId);
            return skill ? [{ skill, level: s.level, max: s.max }] : [];
          })}
        />
      </div>
    </>
  );
}
