import type { ErrorCode, Seat, ServerEvent, ServerEventName, SilhouetteConfig } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import type { Effect, GameEvent, TimerId } from "../../src/game/engine/types.js";
import { createSilhouetteGame, reduceSilhouette } from "../../src/game/silhouette/engine.js";
import type { SilhouetteState } from "../../src/game/silhouette/types.js";
import { buildSilhouetteRoomState } from "../../src/game/silhouette/view.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";
import { START_TIME } from "./harness.js";

export const SILHOUETTE_5: SilhouetteConfig = { game: "silueta", rounds: 5, generations: [1] };

type Payload<N extends ServerEventName> = Extract<ServerEvent, { name: N }>["payload"];

/** Como `Harness`, pero con el motor de la silueta: hora y temporizadores simulados, tokens «tok1», «tok2»… */
export class SilhouetteHarness {
  state: SilhouetteState;
  now = START_TIME;
  emitted: { to: Seat | "all"; event: ServerEvent }[] = [];
  others: Effect[] = [];
  sentState: Seat[] = [];
  pending: { at: number; timer: TimerId }[] = [];
  readonly catalog: PokemonCatalog;
  private readonly rng: ReturnType<typeof sequenceRng>;
  private tokens = 0;

  constructor(opts: { config?: SilhouetteConfig; rng?: number[]; catalog?: PokemonCatalog; rematch?: boolean } = {}) {
    this.rng = sequenceRng(opts.rng ?? []);
    this.catalog = opts.catalog ?? fixtureCatalog();
    const created = createSilhouetteGame(opts.config ?? SILHOUETTE_5, { userId: "u1", username: "ash" }, this.now, { rematch: opts.rematch });
    this.state = created.state;
    this.run(created.effects);
  }

  private deps() {
    return { catalog: this.catalog, rng: this.rng, newToken: () => `tok${++this.tokens}` };
  }

  private run(effects: Effect[]): void {
    for (const effect of effects) {
      if (effect.kind === "schedule") this.pending.push({ at: effect.at, timer: effect.timer });
      else if (effect.kind === "emit") this.emitted.push({ to: effect.to, event: effect.event });
      else if (effect.kind === "send_state") this.sentState.push(effect.to);
      else this.others.push(effect);
    }
  }

  dispatch(event: GameEvent): Effect[] {
    const result = reduceSilhouette(this.state, event, this.now, this.deps());
    this.state = result.state;
    this.run(result.effects);
    return result.effects;
  }

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

  /** Todo lo que recibió un asiento (eventos a él o a todos), en JSON. */
  receivedBy(seat: Seat): string {
    return JSON.stringify(this.emitted.filter((e) => e.to === seat || e.to === "all"));
  }

  view(seat: Seat) {
    return buildSilhouetteRoomState(this.state, seat, "ABC234", this.catalog, this.now);
  }

  seatBoth(): void {
    this.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    this.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    this.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
  }

  /** Deja la partida en la primera ronda. */
  startGame(): void {
    this.seatBoth();
    this.advance(5000);
  }

  submit(seat: Seat, text: string): Effect[] {
    return this.dispatch({ type: "SUBMIT", seat, text });
  }
}
