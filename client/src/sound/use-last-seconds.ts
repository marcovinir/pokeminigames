import { useEffect, useRef } from "react";
import { useCountdown } from "../game/clock";
import { useServices } from "../services";

/** Lo que queda cuando el cronómetro se pone en rojo (el `urgentAtMs` por defecto de `Timer`). */
export const LAST_SECONDS_MS = 5000;

/**
 * El aviso de «últimos segundos»: una sola vez por ronda, al quedar 5 s para responder, y solo si aún no respondí.
 * Se usa en las pantallas de ronda (nunca en la de elegir tipos).
 */
export function useLastSeconds({ deadline, offset, answered, round, now }: { deadline: number | null; offset: number; answered: boolean; round: number; now?: () => number }) {
  const { sound } = useServices();
  const remaining = useCountdown(deadline, offset, now ? { now } : {});
  const warnedRound = useRef<number | null>(null);
  // Solo avisa al cruzar el umbral: si al montar (recargar, reconectar) ya quedaban menos de 5 s, no suena de golpe.
  const sawAbove = useRef<number | null>(null);

  useEffect(() => {
    if (remaining > LAST_SECONDS_MS) sawAbove.current = round;
    if (answered || deadline === null || warnedRound.current === round || sawAbove.current !== round) return;
    if (remaining > 0 && remaining <= LAST_SECONDS_MS) {
      warnedRound.current = round;
      sound.play("tick");
    }
  }, [answered, deadline, remaining, round, sound]);
}
