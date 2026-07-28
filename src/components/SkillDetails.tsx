import { useEffect } from 'preact/hooks';
import type { Skill } from '../lib/catalog/types.ts';
import type { Translator } from '../lib/i18n/index.ts';

/**
 * Ficha de una habilidad: qué hace en cada nivel.
 *
 * Sirve para las cuatro clases por igual (armadura, arma, serie y grupo), que
 * en el catálogo comparten forma: todas traen `ranks` con el efecto de cada
 * nivel. Cuando se abre desde un set se le pasa el nivel logrado y se marcan
 * los rangos que ya están activos, que es lo que hace útil la ficha ahí: se ve
 * de un vistazo qué te da el set y qué te falta.
 */
export default function SkillDetails({
  skill,
  level,
  t,
  onClose,
}: {
  skill: Skill;
  /** Nivel alcanzado en el set. Se omite al consultar la habilidad suelta. */
  level?: number;
  t: Translator;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const max = skill.ranks.reduce((m, r) => Math.max(m, r.level), 0);
  const ranks = skill.ranks.slice().sort((a, b) => a.level - b.level);

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={skill.name}
        class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-line-strong bg-bg-1 p-4"
      >
        <div class="mb-3 flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-semibold">{skill.name}</h2>
            <p class="text-xs text-text-3">
              {t(`skillKind.${skill.kind}` as never)}
              {level !== undefined && (
                <> · <span class="num">{level}/{max}</span></>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            class="text-text-3 hover:text-text-1"
            aria-label={t('skill.close')}
          >×</button>
        </div>

        {/* Opcional: los bonus de serie y grupo no la traen, y un catálogo
            sincronizado antes de guardarla tampoco. */}
        {skill.description && (
          <p class="mb-3 border-l-2 border-line-strong pl-2.5 text-[13px] leading-[1.45] text-text-2">
            {skill.description}
          </p>
        )}

        {ranks.length === 0 ? (
          <p class="text-[12.5px] text-text-3">{t('skill.noRanks')}</p>
        ) : (
          <ul class="flex flex-col gap-1.5">
            {ranks.map((rank) => {
              const active = level !== undefined && rank.level <= level;
              return (
                <li
                  key={rank.level}
                  class="border p-2"
                  style={active
                    ? 'background: var(--accent-weak); border-color: var(--accent)'
                    : 'background: var(--bg-3); border-color: var(--line)'}
                >
                  <div
                    class="font-ui text-[11px] uppercase tracking-[0.1em]"
                    style={active ? 'color: var(--accent-hi)' : 'color: var(--text-3)'}
                  >
                    {t('skill.level', { level: rank.level })}
                    {rank.name ? ` · ${rank.name}` : ''}
                  </div>
                  <p class="mt-0.5 text-[12.5px] leading-[1.4] text-text-2">
                    {rank.description ?? '—'}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
