import { secondsLeft, useCountdown } from "../game/clock";

export interface TimerProps {
  /** Plazo en hora del servidor (ms). */
  deadline: number | null;
  /** Desfase entre el reloj del servidor y el del navegador. */
  offset: number;
  /** Duración total, para dibujar cuánto del anillo queda. */
  totalMs: number;
  /** Nombre accesible del cronómetro, p. ej. "Tiempo de la ronda". */
  label: string;
  /** Lado del anillo en píxeles. */
  size?: number;
  /** Cuando quedan menos de estos milisegundos el anillo pasa a rojo; 0 lo apaga (p. ej. la cuenta atrás de inicio). */
  urgentAtMs?: number;
  now?: () => number;
}

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Cuenta atrás en segundos dentro de un anillo que se vacía. No anuncia cada segundo a los lectores de pantalla
 * (`role="timer"` no es una región viva), y el anillo es decorativo.
 */
export function Timer({ deadline, offset, totalMs, label, size = 120, urgentAtMs = 5000, now }: TimerProps) {
  const remaining = useCountdown(deadline, offset, { now });
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remaining / totalMs)) : 0;
  const urgent = urgentAtMs > 0 && remaining > 0 && remaining <= urgentAtMs;

  return (
    <div role="timer" aria-label={label} data-urgent={urgent} style={{ width: size, height: size }} className="relative mx-auto">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true" focusable="false">
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="8" className="stroke-surface-2" />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className={urgent ? "stroke-danger" : "stroke-accent"}
          style={{ transition: "stroke-dashoffset 250ms linear, stroke 250ms" }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-num text-4xl font-semibold tabular-nums ${urgent ? "text-danger" : ""}`}
      >
        {secondsLeft(remaining)}
      </span>
    </div>
  );
}
