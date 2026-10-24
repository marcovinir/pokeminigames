import type { ErrorCode, RoomConfig, Seat, ServerEvent, ServerEventName } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { createGame, reduce } from "../../src/game/engine/engine.js";
import type { Effect, GameEvent, GameState, TimerId } from "../../src/game/engine/types.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";

export const RANDOM_3: RoomConfig = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null };
export const CHOSEN_3: RoomConfig = { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null };
export const START_TIME = 1_000_000;

type Payload<N extends ServerEventName> = Extract<ServerEvent, { name: N }>["payload"];

export interface Emitted {
  to: Seat | "all";
  event: ServerEvent;
}

/**
 * Hace correr el motor con hora y temporizadores simulados: `advance(ms)` dispara los
 * temporizadores en orden, sin esperar de verdad.
 */
export class Harness {
  state: GameState;
  now = START_TIME;
  emitted: Emitted[] = [];
  persisted: Effect[] = [];
  sentState: Seat[] = [];
  pending: { at: number; timer: TimerId }[] = [];
  readonly rng: ReturnType<typeof sequenceRng>;
  readonly catalog: PokemonCatalog;

  constructor(opts: { config?: RoomConfig; rng?: number[]; catalog?: PokemonCatalog; creator?: { userId: string; username: string; guest?: boolean; avatarId?: number }; rematch?: boolean } = {}) {
    this.rng = sequenceRng(opts.rng ?? []);
    this.catalog = opts.catalog ?? fixtureCatalog();
    const created = createGame(opts.config ?? RANDOM_3, opts.creator ?? { userId: "u1", username: "ash" }, this.now, opts.rematch ? { rematch: true } : undefined);
    this.state = created.state;
    this.run(created.effects);
  }

  private run(effects: Effect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case "schedule":
          this.pending.push({ at: effect.at, timer: effect.timer });
          break;
        case "emit":
          this.emitted.push({ to: effect.to, event: effect.event });
          break;
        case "send_state":
          this.sentState.push(effect.to);
          break;
        default:
          this.persisted.push(effect);
      }
    }
  }

  dispatch(event: GameEvent): Effect[] {
    const result = reduce(this.state, event, this.now, { catalog: this.catalog, rng: this.rng });
    this.state = result.state;
    this.run(result.effects);
    return result.effects;
  }

  /** Avanza el reloj disparando, en orden, los temporizadores que venzan. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const due = this.pending.filter((p) => p.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.pending.splice(this.pending.indexOf(due), 1);
      this.now = due.at;
      this.dispatch({ type: "TIMER", timer: due.timer });
    }
    this.now = target;
  }

  /** Cargas de los eventos con ese nombre; con `to`, solo los que recibió ese asiento. */
  payloads<N extends ServerEventName>(name: N, to?: Seat): Payload<N>[] {
    return this.emitted
      .filter((e) => e.event.name === name && (to === undefined || e.to === to || e.to === "all"))
      .map((e) => e.event.payload as Payload<N>);
  }

  last<N extends ServerEventName>(name: N, to?: Seat): Payload<N> | undefined {
    return this.payloads(name, to).at(-1);
  }

  errorCodes(seat: Seat): ErrorCode[] {
    return this.payloads("error", seat).map((p) => p.code);
  }

  effectsOfKind<K extends Effect["kind"]>(kind: K): Extract<Effect, { kind: K }>[] {
    return this.persisted.filter((e): e is Extract<Effect, { kind: K }> => e.kind === kind);
  }

  clearEmitted(): void {
    this.emitted = [];
  }

  /** El segundo jugador se une y los dos se conectan: empieza la cuenta atrás. */
  seatBoth(): void {
    this.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    this.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    this.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
  }

  /** Deja la partida en la primera ronda (o en la elección de tipos en el modo elegido). */
  startGame(): void {
    this.seatBoth();
    this.advance(5000);
  }

  submit(seat: Seat, text: string): Effect[] {
    return this.dispatch({ type: "SUBMIT", seat, text });
  }

  choose(seat: Seat, typeName: string): Effect[] {
    return this.dispatch({ type: "CHOOSE_TYPE", seat, typeName });
  }
}
