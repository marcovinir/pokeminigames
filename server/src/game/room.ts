import type { RoomConfig, RoomStateView, Seat } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../catalog/pokemon-catalog.js";
import { createGame, reduce } from "./engine/engine.js";
import {
  type Effect,
  type GameEvent,
  type GameState,
  type RoundRecord,
  SEATS,
} from "./engine/types.js";
import { buildRoomState } from "./engine/view.js";
import type { Broadcaster, Clock, GameRepository, Scheduler } from "./ports.js";
import type { Rng } from "./rng.js";

export interface GameRoomPorts {
  clock: Clock;
  scheduler: Scheduler;
  broadcaster: Broadcaster;
  repository: GameRepository;
  catalog: PokemonCatalog;
  rng: Rng;
  logger?: { error(message: string, error?: unknown): void };
  /** Intentos para guardar en la base de datos antes de rendirse (por defecto 3). */
  persistAttempts?: number;
  persistRetryDelayMs?: number;
}

export interface RoomUser {
  userId: string;
  username: string;
}

/**
 * Una sala en ejecución: recibe eventos (de sockets o temporizadores), se los pasa al
 * motor puro y ejecuta los efectos que este devuelve.
 */
export class GameRoom {
  private state: GameState;
  private readonly timers = new Set<() => void>();
  private persistChain: Promise<void> = Promise.resolve();
  private readonly finishListeners: Array<() => void> = [];
  private finishedNotified = false;

  private constructor(
    private readonly ports: GameRoomPorts,
    readonly code: string,
    private readonly gameId: string,
    state: GameState,
  ) {
    this.state = state;
  }

  static create(
    ports: GameRoomPorts,
    input: { code: string; gameId: string; config: RoomConfig; creator: RoomUser },
  ): GameRoom {
    const { state, effects } = createGame(input.config, input.creator, ports.clock.now());
    const room = new GameRoom(ports, input.code, input.gameId, state);
    room.execute(effects);
    return room;
  }

  get phase(): GameState["phase"] {
    return this.state.phase;
  }

  get config(): RoomConfig {
    return this.state.config;
  }

  seatOf(userId: string): Seat | undefined {
    return SEATS.find((seat) => this.state.players[seat]?.userId === userId);
  }

  hasSeat(seat: Seat): boolean {
    return this.state.players[seat] !== undefined;
  }

  playerCount(): number {
    return SEATS.filter((seat) => this.state.players[seat] !== undefined).length;
  }

  creatorName(): string {
    return this.state.players[1]?.username ?? "";
  }

  view(seat: Seat): RoomStateView {
    return buildRoomState(this.state, seat, this.code, this.ports.catalog, this.ports.clock.now());
  }

  /** Se llama una sola vez, cuando la partida termina por cualquier motivo. */
  onFinished(listener: () => void): void {
    this.finishListeners.push(listener);
  }

  /** Espera a que termine lo que quede por guardar en la base de datos. */
  idle(): Promise<void> {
    return this.persistChain;
  }

  dispatch(event: GameEvent): void {
    const result = reduce(this.state, event, this.ports.clock.now(), {
      catalog: this.ports.catalog,
      rng: this.ports.rng,
    });
    this.state = result.state;
    this.execute(result.effects);

    if (this.state.phase === "finished" && !this.finishedNotified) {
      this.finishedNotified = true;
      for (const cancel of this.timers) cancel();
      this.timers.clear();
      for (const listener of this.finishListeners) listener();
    }
  }

  private execute(effects: Effect[]): void {
    const { broadcaster, clock, scheduler, repository } = this.ports;
    for (const effect of effects) {
      switch (effect.kind) {
        case "schedule": {
          const cancel = scheduler.schedule(Math.max(0, effect.at - clock.now()), () => {
            this.timers.delete(cancel);
            this.dispatch({ type: "TIMER", timer: effect.timer });
          });
          this.timers.add(cancel);
          break;
        }
        case "emit":
          if (effect.to === "all") broadcaster.toAll(this.code, effect.event);
          else broadcaster.toSeat(this.code, effect.to, effect.event);
          break;
        case "send_state":
          broadcaster.toSeat(this.code, effect.to, { name: "room-state", payload: this.view(effect.to) });
          break;
        case "persist_seat_taken":
          this.persist("unir al segundo jugador", () => repository.addSecondPlayer(this.gameId, effect.userId));
          break;
        case "persist_seat_freed":
          this.persist("liberar el asiento 2", () => repository.removeSecondPlayer(this.gameId));
          break;
        case "persist_started":
          this.persist("marcar el inicio", () => repository.markStarted(this.gameId));
          break;
        case "persist_round": {
          const record: RoundRecord = effect.record;
          this.persist(`guardar la ronda ${record.number}`, () => repository.saveRound(this.gameId, record));
          break;
        }
        case "persist_end": {
          const winner = effect.outcome.winnerSeat;
          const winnerUserId = winner ? (this.state.players[winner]?.userId ?? null) : null;
          this.persist("guardar el final", () =>
            repository.finish(this.gameId, {
              status: effect.status,
              reason: effect.outcome.reason,
              winnerUserId,
              finalStats: effect.finalStats,
            }),
          );
          break;
        }
      }
    }
  }

  /**
   * Encola una escritura. Se ejecutan de una en una y en orden (la ronda 2 nunca se guarda
   * antes que la ronda 1). Un fallo se reintenta y, si persiste, se registra: la partida en
   * curso nunca se detiene por un problema de guardado.
   */
  private persist(label: string, operation: () => Promise<void>): void {
    this.persistChain = this.persistChain.then(async () => {
      const attempts = this.ports.persistAttempts ?? 3;
      const delay = this.ports.persistRetryDelayMs ?? 500;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          await operation();
          return;
        } catch (error) {
          if (attempt === attempts) {
            this.ports.logger?.error(`No se pudo guardar (${label}) en la sala ${this.code}`, error);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    });
  }
}
