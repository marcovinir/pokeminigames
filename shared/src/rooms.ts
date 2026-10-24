import type { GamePhase, LengthMode, RoomConfig, TypeMode } from "./types.js";

/** Cuerpo de `POST /rooms` para «Doble tipo» (`game` puede faltar). */
export interface CreateDobleTipoRoomRequest {
  game?: "doble_tipo";
  typeMode: TypeMode;
  lengthMode: LengthMode;
  roundsLimit?: number;
  statsGoal?: number;
  /** Pistas de tipos en las sugerencias (por defecto, apagadas). */
  typeHints?: boolean;
}

/** Cuerpo de `POST /rooms` para la silueta (sin rondas: 10; sin generaciones: Kanto). */
export interface CreateSilhouetteRoomRequest {
  game: "silueta";
  rounds?: 5 | 10 | 15;
  generations?: number[];
}

/** Cuerpo de `POST /rooms`. */
export type CreateRoomRequest = CreateDobleTipoRoomRequest | CreateSilhouetteRoomRequest;

export interface CreateRoomResponse {
  code: string;
}

/** Respuesta de `GET /rooms/:code`. */
export interface PublicRoomInfo {
  code: string;
  phase: GamePhase;
  config: RoomConfig;
  creator: string;
  playerCount: number;
}
