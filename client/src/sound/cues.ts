import type { GameEndedPayload, Seat, ServerEvent } from "@pokemon-minigames/shared";
import type { GameView } from "../game/apply-event";

/** Los efectos de 8 bits del juego (se generan con Web Audio en `synth.ts`). */
export type SoundEffect = "correct" | "wrong" | "win" | "lose" | "round" | "tick" | "click" | "reveal" | "rival";

/** Qué música toca: ninguna, la de sala, la de partida o el tema de final según el resultado. */
export type MusicCue = { zone: "none" } | { zone: "lobby" } | { zone: "battle" } | { zone: "final"; outcome: "win" | "lose" };

/** Un efecto y cuándo suena, en ms desde que llega el evento. */
export interface EffectCue {
  effect: SoundEffect;
  delayMs: number;
}

/** El efecto de acierto o fallo de la silueta suena después de la revelación. */
const AFTER_REVEAL_MS = 600;
/** El efecto de ganar o perder, tras el acierto o el fallo de la última ronda. */
const AFTER_LAST_ROUND_MS = 500;

const BATTLE_PHASES = new Set<GameView["phase"]>(["starting", "choosing_types", "round_active", "round_result"]);

/**
 * Cómo terminó la partida para mí: ganarla por cualquier motivo (también porque el rival se fue) es `win`; perderla,
 * `lose`; un empate de una partida jugada hasta el final suena a victoria (nadie perdió). Una partida sin ganador que no
 * se completó (cancelada, caducada, abandonada) no tiene final que celebrar: `null`.
 */
export function endOutcome(ended: GameEndedPayload, mySeat: Seat | null): "win" | "lose" | null {
  if (mySeat === null) return null;
  if (ended.winnerSeat === null) return ended.reason === "completed" ? "win" : null;
  return ended.winnerSeat === mySeat ? "win" : "lose";
}

/**
 * La música según la pantalla: sala en el menú, los lobbies y la espera; partida desde la cuenta atrás hasta la última
 * ronda; el tema de final en el resumen; silencio en el resto (acceso, información, perfiles).
 */
export function musicCueFor(pathname: string, view: GameView): MusicCue {
  if (pathname === "/" || pathname.startsWith("/jugar/")) return { zone: "lobby" };
  if (!pathname.startsWith("/sala/")) return { zone: "none" };
  if (BATTLE_PHASES.has(view.phase)) return { zone: "battle" };
  if (view.phase === "finished") {
    const outcome = view.ended ? endOutcome(view.ended, view.mySeat) : null;
    return outcome ? { zone: "final", outcome } : { zone: "lobby" };
  }
  return { zone: "lobby" };
}

/**
 * Los efectos de un evento del servidor. Solo los eventos «en vivo» suenan: un `room-state` (al entrar, recargar o
 * reconectar) nunca, para que volver a una partida no repita lo que ya pasó.
 */
export function effectsForEvent(before: GameView, event: ServerEvent, after: GameView): EffectCue[] {
  const now = (effect: SoundEffect): EffectCue => ({ effect, delayMs: 0 });
  const seat = after.mySeat ?? before.mySeat;
  switch (event.name) {
    case "round-started":
    case "silhouette-round-started":
      return [now("round")];
    case "round-result":
      if (seat === null) return [];
      return [now(event.payload.results[seat].result === "VALID" ? "correct" : "wrong")];
    case "silhouette-round-result":
      if (seat === null) return [];
      return [now("reveal"), { effect: event.payload.reveal.answers[seat].correct ? "correct" : "wrong", delayMs: AFTER_REVEAL_MS }];
    case "game-ended": {
      const outcome = endOutcome(event.payload, seat);
      if (!outcome) return [];
      // En «Doble tipo» el final llega junto al resultado de la última ronda: espera a que acabe su efecto.
      return [{ effect: outcome, delayMs: before.phase === "round_result" ? AFTER_LAST_ROUND_MS : 0 }];
    }
    case "opponent-answered": {
      // Solo si el aviso era de la ronda abierta (el reductor lo ignora si es de otra).
      const marked = after.round?.opponentAnswered === true || after.silhouette?.round?.opponentAnswered === true;
      const wasMarked = before.round?.opponentAnswered === true || before.silhouette?.round?.opponentAnswered === true;
      return seat !== null && marked && !wasMarked ? [now("rival")] : [];
    }
    default:
      return [];
  }
}
