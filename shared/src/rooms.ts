import type { GamePhase, LengthMode, RoomConfig, TypeMode } from "./types.js";

/** Cuerpo de `POST /rooms`. */
export interface CreateRoomRequest {
  typeMode: TypeMode;
  lengthMode: LengthMode;
  roundsLimit?: number;
  statsGoal?: number;
}

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
