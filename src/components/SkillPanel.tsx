import { useState } from 'preact/hooks';
import type { Skill } from '../lib/catalog/types.ts';
import SkillDetails from './SkillDetails.tsx';
import { translatorFor, type Locale } from '../lib/i18n/index.ts';

/**
 * Las habilidades activas de un set, con su barra por niveles.
 *
 * Vive en un componente propio porque la ficha del set la pinta dos veces: la
 * versión de mirar, que va sin JavaScript, y la del dueño, que además deja
 * engarzar. Tener el panel en dos sitios ya hizo que se separaran, y este es el
 * trozo con más detalle —la barra, el verde al tope, el nivel— así que es el que
 * más se nota cuando se separan.
 *
 * Recibe las habilidades ya resueltas y no el catálogo entero: son las diez o
 * doce de este set, con sus rangos, que es lo justo para poder abrir la ficha
 * sin bajarse nada más.
 */
export interface PanelSkill {
  skill: Skill;
  level: number;
  max: number;
}

export default function SkillPanel({
  skills,
  locale,
  title,
}: {
  skills: PanelSkill[];
  locale: Locale;
  title: string;
}) {
  const t = translatorFor(locale);
  const [open, setOpen] = useState<PanelSkill | null>(null);

  return (
    <section class="panel">
      {open && (
        <SkillDetails
          skill={open.skill}
          level={open.level}
          t={t}
          onClose={() => setOpen(null)}
        />
      )}

      <h2 class="font-ui border-b border-line bg-panel-head px-3 py-1 text-[13px] uppercase tracking-[0.1em] text-text-2">
        {title}
        <span class="ml-2 normal-case tracking-normal text-text-3">{t('builder.skillHint')}</span>
      </h2>

      {skills.map((entry) => (
        <button
          key={entry.skill.id}
          onClick={() => setOpen(entry)}
          title={t('builder.skillInfo')}
          class="flex w-full items-center gap-2.5 border-b border-line-soft px-3 py-1.5 text-left last:border-b-0 hover:bg-bg-2"
        >
          <span class="min-w-0 flex-1">
            <span class={`block truncate text-[13.5px] ${entry.level >= entry.max ? 'text-ok' : ''}`}>
              {entry.skill.name}
            </span>
            {/* Cuántos niveles llenos sobre cuántos hay; verde al tope. */}
            <span class="mt-[3px] flex gap-[2px]">
              {Array.from({ length: entry.max }, (_, i) => (
                <span
                  key={i}
                  class="h-[7px] w-[9px] border"
                  style={i < entry.level
                    ? `background: var(${entry.level >= entry.max ? '--ok' : '--accent'}); border-color: var(${entry.level >= entry.max ? '--ok' : '--accent'})`
                    : 'background: transparent; border-color: var(--line-strong)'}
                />
              ))}
            </span>
          </span>
          <span class={`num shrink-0 text-[12.5px] ${entry.level >= entry.max ? 'text-ok' : 'text-text-2'}`}>
            {t('sets.level', { n: entry.level })}
          </span>
        </button>
      ))}
    </section>
  );
}
