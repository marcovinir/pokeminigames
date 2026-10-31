import { type GameEndedPayload, type GamePhase, type RoomConfig, type RoomStateView, type Seat, isAuctionConfig, isSilhouetteConfig } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../catalog/pokemon-catalog.js";
import { createAuctionGame, reduceAuction } from "./auction/engine.js";
import type { AuctionState } from "./auction/types.js";
import { buildAuctionGameEnded, buildAuctionRoomState } from "./auction/view.js";
import { createGame, reduce } from "./engine/engine.js";
import type { Effect, GameEvent, GameOutcome, GameState, PlayerState } from "./engine/types.js";
import { buildGameEnded, buildRoomState } from "./engine/view.js";
import type { Rng } from "./rng.js";
import { createSilhouetteGame, reduceSilhouette } from "./silhouette/engine.js";
import type { SilhouetteState } from "./silhouette/types.js";
import { buildSilhouetteGameEnded, buildSilhouetteRoomState } from "./silhouette/view.js";

/** Lo que la sala necesita saber del estado de cualquier juego (el resto es asunto de cada motor). */
export interface EngineState {
  phase: GamePhase;
  config: RoomConfig;
  players: Partial<Record<Seat, PlayerState>>;
  outcome: GameOutcome | null;
  rematch?: true;
}

/** Quién ocupa un asiento, como lo entiende un motor: `guest` y `avatarId` solo cuando aplican. */
export interface SeatOccupant {
  userId: string;
  username: string;
  guest?: boolean;
  avatarId?: number;
}

export interface EngineContext {
  catalog: PokemonCatalog;
  rng: Rng;
  newToken: () => string;
}

export interface EngineResult {
  state: EngineState;
  effects: Effect[];
}

/** Un minijuego visto desde la sala: crear, reducir eventos y dar sus vistas. */
export interface GameEngine {
  create(config: RoomConfig, creator: SeatOccupant, now: number, options: { rematch?: boolean }): EngineResult;
  reduce(state: EngineState, event: GameEvent, now: number, ctx: EngineContext): EngineResult;
  roomState(state: EngineState, seat: Seat, code: string, catalog: PokemonCatalog, now: number): RoomStateView;
  gameEnded(state: EngineState, catalog: PokemonCatalog): GameEndedPayload;
}

// Cada adaptador solo recibe estados que él mismo creó (la sala no mezcla motores), de ahí los cambios de tipo.
const dobleTipoEngine: GameEngine = {
  create: (config, creator, now, options) => {
    if (isSilhouetteConfig(config) || isAuctionConfig(config)) throw new Error("«Doble tipo» no juega con la configuración de otro juego");
    return createGame(config, creator, now, options);
  },
  reduce: (state, event, now, ctx) => reduce(state as GameState, event, now, { catalog: ctx.catalog, rng: ctx.rng }),
  roomState: (state, seat, code, catalog, now) => buildRoomState(state as GameState, seat, code, catalog, now),
  gameEnded: (state, catalog) => buildGameEnded(state as GameState, catalog),
};

const silhouetteEngine: GameEngine = {
  create: (config, creator, now, options) => {
    if (!isSilhouetteConfig(config)) throw new Error("La silueta necesita una configuración de silueta");
    return createSilhouetteGame(config, creator, now, options);
  },
  reduce: (state, event, now, ctx) => reduceSilhouette(state as SilhouetteState, event, now, ctx),
  roomState: (state, seat, code, catalog, now) => buildSilhouetteRoomState(state as SilhouetteState, seat, code, catalog, now),
  gameEnded: (state, catalog) => buildSilhouetteGameEnded(state as SilhouetteState, catalog),
};

const auctionEngine: GameEngine = {
  create: (config, creator, now, options) => {
    if (!isAuctionConfig(config)) throw new Error("La subasta necesita una configuración de subasta");
    return createAuctionGame(config, creator, now, options);
  },
  reduce: (state, event, now, ctx) => reduceAuction(state as AuctionState, event, now, ctx),
  roomState: (state, seat, code, catalog, now) => buildAuctionRoomState(state as AuctionState, seat, code, catalog, now),
  gameEnded: (state, catalog) => buildAuctionGameEnded(state as AuctionState, catalog),
};

/** El motor del juego de una configuración. */
export function engineFor(config: RoomConfig): GameEngine {
  if (isAuctionConfig(config)) return auctionEngine;
  return isSilhouetteConfig(config) ? silhouetteEngine : dobleTipoEngine;
}
