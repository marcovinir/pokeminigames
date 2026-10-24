import type { RoomConfig, RoomStateView, Seat } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../catalog/pokemon-catalog.js";
import { createGame, reduce } from "./engine/engine.js";
import {
  type Effect,
  type GameEvent,
  type GameOutcome,
  type GameState,
  type RoundRecord,
  SEATS,
} from "./engine/types.js";
import { buildGameEnded, buildRoomState } from "./engine/view.js";
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

/** Quién es una persona conectada: la cuenta o el invitado del token. */
export interface PlayerIdentity {
  userId: string;
  username: string;
  /** Es un invitado (sin cuenta): sus partidas no se guardan. Siempre se dice: nada se trata como cuenta por omisión. */
  isGuest: boolean;
}

/** Quien se sienta en una sala: su identidad y el avatar que tenía al entrar (se lee de la base al crear o unirse). */
export interface RoomUser extends PlayerIdentity {
  /** Número de Pokédex del avatar; nulo = iniciales (siempre en un invitado). */
  avatarId: number | null;
}

/** Lo que el motor sabe de quien ocupa un asiento: `guest` y `avatarId` solo cuando aplican. */
function engineIdentity(user: RoomUser): { userId: string; username: string; guest?: boolean; avatarId?: number } {
  return {
    userId: user.userId,
    username: user.username,
    ...(user.isGuest ? { guest: true } : {}),
    ...(user.avatarId !== null ? { avatarId: user.avatarId } : {}),
  };
}

/** El evento que sienta a alguien en el asiento 2. */
export function joinedEvent(user: RoomUser): GameEvent {
  return { type: "PLAYER_JOINED", ...engineIdentity(user) };
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
    /** La fila de `games` de esta sala; `null` si no se guarda (la juega un invitado). */
    private gameId: string | null,
    state: GameState,
  ) {
    this.state = state;
  }

  static create(
    ports: GameRoomPorts,
    input: { code: string; gameId: string | null; config: RoomConfig; creator: RoomUser; rematch?: boolean },
  ): GameRoom {
    const { creator } = input;
    const { state, effects } = createGame(
      input.config,
      engineIdentity(creator),
      ports.clock.now(),
      { rematch: input.rematch },
    );
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

  /** Cómo terminó la partida (ganador y motivo); `null` mientras no ha terminado. */
  get outcome(): GameOutcome | null {
    return this.state.outcome;
  }

  /** Quién está sentado en cada asiento, con si es invitado (sale del estado del motor). */
  players(): Partial<Record<Seat, RoomUser>> {
    const players: Partial<Record<Seat, RoomUser>> = {};
    for (const seat of SEATS) {
      const player = this.state.players[seat];
      if (player) {
        players[seat] = { userId: player.userId, username: player.username, isGuest: player.guest === true, avatarId: player.avatarId ?? null };
      }
    }
    return players;
  }

  /**
   * Vuelve a mandarle a ese asiento el resumen de una partida terminada (el estado y el final), para quien recarga o
   * reconecta mientras la sala sigue viva por una oferta de revancha. En una sala sin terminar no hace nada.
   */
  replaySummary(seat: Seat): void {
    if (this.state.phase !== "finished") return;
    const { broadcaster, catalog } = this.ports;
    broadcaster.toSeat(this.code, seat, { name: "room-state", payload: this.view(seat) });
    broadcaster.toSeat(this.code, seat, { name: "game-ended", payload: buildGameEnded(this.state, catalog) });
  }

  /** ¿Se guarda esta partida en la base de datos? Deja de guardarse en cuanto entra un invitado, y ya no vuelve. */
  get persisted(): boolean {
    return this.gameId !== null;
  }

  /**
   * Entra un invitado: esta partida no deja rastro para nadie. Si ya había una fila de `games` la descarta, en la misma
   * cadena de escrituras (detrás de lo que ya estuviera encolado) y con el reintento de siempre. Es permanente e idempotente.
   */
  markNotPersisted(): void {
    const gameId = this.gameId;
    if (gameId === null) return;
    this.gameId = null;
    this.enqueue("descartar la partida", () => this.ports.repository.discardGame(gameId));
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
          this.persist("unir al segundo jugador", (gameId) => repository.addSecondPlayer(gameId, effect.userId));
          break;
        case "persist_seat_freed":
          this.persist("liberar el asiento 2", (gameId) => repository.removeSecondPlayer(gameId));
          break;
        case "persist_started":
          this.persist("marcar el inicio", (gameId) => repository.markStarted(gameId));
          break;
        case "persist_round": {
          const record: RoundRecord = effect.record;
          this.persist(`guardar la ronda ${record.number}`, (gameId) => repository.saveRound(gameId, record));
          break;
        }
        case "persist_end": {
          const winner = effect.outcome.winnerSeat;
          const winnerUserId = winner ? (this.state.players[winner]?.userId ?? null) : null;
          this.persist("guardar el final", (gameId) =>
            repository.finish(gameId, {
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

  /** Encola una escritura de esta partida; si la sala no se guarda (invitados), la ignora. */
  private persist(label: string, operation: (gameId: string) => Promise<void>): void {
    const gameId = this.gameId;
    if (gameId === null) return;
    this.enqueue(label, () => operation(gameId));
  }

  /**
   * Encola una escritura. Se ejecutan de una en una y en orden (la ronda 2 nunca se guarda
   * antes que la ronda 1). Un fallo se reintenta y, si persiste, se registra: la partida en
   * curso nunca se detiene por un problema de guardado.
   */
  private enqueue(label: string, operation: () => Promise<void>): void {
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
