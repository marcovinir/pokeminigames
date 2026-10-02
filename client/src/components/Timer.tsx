import { secondsLeft, useCountdown } from "../game/clock";

export interface TimerProps {
  /** Plazo en hora del servidor (ms). */
  deadline: number | null;
  /** Desfase entre el reloj del servidor y el del navegador. */
  offset: number;
  /** Duración total, para dibujar la barra de progreso. */
  totalMs: number;
  /** Nombre accesible del cronómetro, p. ej. "Tiempo de la ronda". */
  label: string;
  now?: () => number;
}

/** Cuenta atrás en segundos con barra de progreso. No anuncia cada segundo a los lectores de pantalla. */
export function Timer({ deadline, offset, totalMs, label, now }: TimerProps) {
  const remaining = useCountdown(deadline, offset, { now });
  const percent = totalMs > 0 ? Math.min(100, (remaining / totalMs) * 100) : 0;

  return (
    <div role="timer" aria-label={label} className="text-center">
      <span className="font-num text-4xl font-medium tabular-nums">{secondsLeft(remaining)}</span>
      <div className="mt-2 h-1 overflow-hidden rounded-ui bg-surface-2" aria-hidden="true">
        <div className="h-1 bg-accent" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
