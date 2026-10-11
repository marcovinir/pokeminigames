/** Los 18 tipos del juego. En la base de datos el id de un tipo es su posición + 1. */
export const TYPE_NAMES = [
  "normal",
  "fighting",
  "flying",
  "poison",
  "ground",
  "rock",
  "bug",
  "ghost",
  "steel",
  "fire",
  "water",
  "grass",
  "electric",
  "psychic",
  "ice",
  "dragon",
  "dark",
  "fairy",
] as const;

export type TypeName = (typeof TYPE_NAMES)[number];

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export type TypeMode = "random" | "chosen";
export type LengthMode = "fixed_rounds" | "custom";

/** Asiento en la sala: 1 es quien la crea, 2 quien se une. */
export type Seat = 1 | 2;

export type PickResult = "VALID" | "NOT_FOUND" | "WRONG_TYPES" | "ALREADY_OWNED" | "TAKEN" | "NO_ANSWER";

export type GamePhase = "waiting" | "starting" | "choosing_types" | "round_active" | "round_result" | "finished";

/**
 * Por qué terminó la partida. completed, forfeit, disconnect y exhausted son partidas
 * terminadas; cancelled, expired y abandoned quedan como abandonadas.
 */
export const GAME_END_REASONS = [
  "completed",
  "forfeit",
  "disconnect",
  "exhausted",
  "cancelled",
  "expired",
  "abandoned",
] as const;
export type GameEndReason = (typeof GAME_END_REASONS)[number];

export interface RoomConfig {
  typeMode: TypeMode;
  lengthMode: LengthMode;
  /** Rondas fijas (3 o 5) o máximo de rondas del modo personalizado; nulo si el fin es por meta de stats. */
  roundsLimit: number | null;
  /** Meta de stats del modo personalizado; nulo en cualquier otro caso. */
  statsGoal: number | null;
  /**
   * «Pistas de tipos»: las sugerencias del campo de respuesta muestran los tipos de cada Pokémon. Lo decide quien crea la
   * sala. Ausente (un servidor anterior) cuenta como apagado.
   */
  typeHints?: boolean;
}

export interface PokemonView {
  id: number;
  names: { es: string; en: string };
  spriteUrl: string;
  types: TypeName[];
  stats: BaseStats;
  totalStats: number;
}
