import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CatalogIndex } from '../lib/catalog/types.ts';
import { pickDecorations } from '../lib/builder/decoration-picks.ts';
import type { Translator } from '../lib/i18n/index.ts';
import { slotSvg } from '../lib/ui/glyphs.ts';

/**
 * Elegir joya para una ranura concreta.
 *
 * Se abre desde el rombo de la ranura, así que ya se sabe de qué nivel es y si
 * es de arma o de armadura: la lista llega filtrada a lo que cabe, ordenada por
 * lo que aporta a este set, y marcando lo que ya tienes.
 *
 * Se ofrecen también las que no tienes: enseñar solo el inventario escondería
 * que existe la joya que arregla el set, que es justo lo que hay que saber para
 * ir a buscarla.
 */
interface Props {
  index: CatalogIndex;
  t: Translator;
  slot: number;
  kind: 'armor' | 'weapon';
  wantedSkills: Map<number, number>;
  currentLevels: Map<number, number>;
  ownedDecorations: Record<string, number>;
  /** Joya que ya está puesta, para poder quitarla. */
  current: number | null;
  onPick: (decorationId: number | null) => void;
  onClose: () => void;
}

export default function SlotPicker(props: Props) {
  const { index, t, slot, kind, wantedSkills, currentLevels, ownedDecorations } = props;
  const { current, onPick, onClose } = props;
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const suggested = useMemo(
    () => pickDecorations({ index, slot, kind, wantedSkills, currentLevels, owned: ownedDecorations }),
    [index, slot, kind, wantedSkills, currentLevels, ownedDecorations],
  );

  /** Al escribir se busca en todo lo que cabe, no solo en lo sugerido. */
  const needle = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return suggested;
    return index.catalog.decorations
      .filter((d) => d.kind === kind && d.slot <= slot)
      .filter((d) => d.name.toLowerCase().includes(needle))
      .slice(0, 30)
      .map((decoration) => ({
        decoration,
        owned: ownedDecorations[String(decoration.id)] ?? 0,
        wanted: [],
        score: 0,
      }));
  }, [needle, suggested, index, kind, slot, ownedDecorations]);

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div class="panel bevel-head flex max-h-[85vh] w-full max-w-lg flex-col">
        <header class="flex min-h-[38px] shrink-0 items-center gap-2.5 border-b border-accent bg-panel-head px-3.5 py-1">
          <span dangerouslySetInnerHTML={{ __html: slotSvg(slot, false, true) }} />
          <h2 class="font-ui min-w-0 flex-1 text-[15px] uppercase tracking-[0.08em] text-accent-hi">
            {kind === 'weapon' ? t('slots.weaponSlot') : t('slots.armorSlot')}
          </h2>
          {current != null && (
            <button
              onClick={() => onPick(null)}
              class="font-ui border border-line-strong bg-bg-2 px-2.5 py-1 text-[12px] uppercase tracking-[0.08em] text-text-3 hover:border-danger hover:text-danger"
            >{t('slots.clear')}</button>
          )}
          <button
            onClick={onClose}
            aria-label={t('builder.closePanel')}
            class="grid h-6 w-6 shrink-0 place-items-center text-text-3 hover:text-text-1"
          >✕</button>
        </header>

        <div class="shrink-0 border-b border-line px-3 py-2">
          <input
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder={t('slots.search')}
            class="h-8 w-full border border-line-strong bg-bg-0 px-2.5 text-[14px] outline-none focus:border-accent"
          />
          {!needle && (
            <p class="mt-1.5 text-[11.5px] text-text-3">{t('slots.suggestedHint')}</p>
          )}
        </div>

        <ul class="min-h-0 flex-1 overflow-y-auto">
          {results.length === 0 && (
            <li class="px-3 py-4 text-center text-[12.5px] text-text-3">{t('slots.none')}</li>
          )}
          {results.map(({ decoration, owned, wanted }) => (
            <li key={decoration.id} class="border-b border-line-soft last:border-b-0">
              <button
                onClick={() => onPick(decoration.id)}
                class={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-bg-2 ${
                  current === decoration.id ? 'bg-accent-weak' : ''
                }`}
              >
                <span dangerouslySetInnerHTML={{ __html: slotSvg(decoration.slot, true, true) }} />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[13.5px]">{decoration.name}</span>
                  <span class="block truncate text-[11.5px] text-text-3">
                    {decoration.skills
                      .map((g) => `${index.skillById.get(g.skillId)?.name} ${g.level}`)
                      .join(' · ')}
                  </span>
                </span>
                {/* Lo que aporta a este set, que es el motivo de estar arriba. */}
                {wanted.length > 0 && (
                  <span class="font-ui shrink-0 text-[10.5px] uppercase tracking-[0.06em] text-accent-hi">
                    {wanted.length > 1 ? t('slots.fitsTwo') : t('slots.fits')}
                  </span>
                )}
                <span
                  class={`num shrink-0 text-[11.5px] ${owned > 0 ? 'text-ok' : 'text-text-3'}`}
                >{owned > 0 ? `×${owned}` : t('slots.notOwned')}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
