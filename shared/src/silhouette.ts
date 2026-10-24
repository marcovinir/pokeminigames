import type { PokemonView, Seat } from "./types.js";

/** Lo que respondió un jugador en una ronda de silueta, visto al revelarla. */
export interface SilhouetteAnswer {
  /** Nulo si no respondió. */
  text: string | null;
  correct: boolean;
  /** Milisegundos desde el inicio de la ronda hasta que el servidor recibió la respuesta; nulo si no respondió. */
  ms: number | null;
  points: number;
}

/** La revelación de una ronda: el Pokémon y lo que respondió cada uno. */
export interface SilhouetteReveal {
  round: number;
  pokemon: PokemonView;
  answers: Record<Seat, SilhouetteAnswer>;
}

/** La ronda abierta. Nunca dice qué Pokémon es: la silueta llega por una URL opaca. */
export interface SilhouetteRoundView {
  number: number;
  deadline: number;
  silhouetteUrl: string;
  answered: boolean;
  answeredMs: number | null;
}

/** Lo propio de la silueta en el estado de la sala. */
export interface SilhouetteStateView {
  totalRounds: number;
  round: SilhouetteRoundView | null;
  reveals: SilhouetteReveal[];
}
