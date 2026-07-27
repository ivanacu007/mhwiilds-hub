import { useEffect, useRef } from 'preact/hooks';

/**
 * Contador ± del inventario.
 *
 * Es el control más pulsado de la app: capturar 361 adornos pasa por aquí. De
 * ahí tres cosas que no son adorno:
 *
 * - El valor es un `input` numérico de verdad, para teclear 47 de golpe en vez
 *   de pulsar 47 veces.
 * - Mantener pulsado repite, tras una pausa, para subir de 0 a 20 sin soltar.
 * - En móvil el área táctil se extiende a 44 px con `::before` sin engordar el
 *   botón visible, que sigue midiendo 30.
 */
interface Props {
  value: number;
  max: number;
  onChange: (value: number) => void;
  labelAdd: string;
  labelRemove: string;
  /** Nombre de lo que se cuenta, para que el lector de pantalla lo diga. */
  name: string;
}

const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 120;

export default function Stepper({ value, max, onChange, labelAdd, labelRemove, name }: Props) {
  const timers = useRef<{ delay?: number; repeat?: number }>({});

  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
    timers.current = {};
  };

  // Si el componente se va mientras se mantiene pulsado, el intervalo seguiría vivo.
  useEffect(() => stop, []);

  const clamp = (n: number) => Math.max(0, Math.min(max, n));

  const start = (delta: number) => {
    onChange(clamp(value + delta));
    let running = value + delta;
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => {
        running = clamp(running + delta);
        onChange(running);
      }, HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  const button = (delta: number, label: string, glyph: string, disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${label}: ${name}`}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); start(delta); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      class="relative grid h-[30px] w-[30px] place-items-center rounded-[2px] border border-line text-text-2 transition-colors hover:bg-bg-3 hover:text-text-1 disabled:opacity-40 disabled:hover:bg-transparent
             before:absolute before:-inset-[7px] before:content-[''] md:before:hidden"
    >
      {glyph}
    </button>
  );

  return (
    <div class="flex items-center gap-1">
      {button(-1, labelRemove, '−', value === 0)}
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={0}
        max={max}
        aria-label={name}
        onInput={(e) => {
          const parsed = Number((e.target as HTMLInputElement).value);
          onChange(Number.isFinite(parsed) ? clamp(Math.floor(parsed)) : 0);
        }}
        class={`num h-[30px] w-14 rounded-[2px] border border-line bg-bg-0 text-center text-[13px] outline-none focus:border-accent ${
          value > 0 ? 'text-text-1' : 'text-text-3'
        }`}
      />
      {button(1, labelAdd, '+', value >= max)}
    </div>
  );
}
