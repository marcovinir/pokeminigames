import type { AuctionConfig, ErrorCode, Seat, ServerEvent, ServerEventName } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { createAuctionGame, reduceAuction } from "../../src/game/auction/engine.js";
import type { AuctionState } from "../../src/game/auction/types.js";
import { buildAuctionRoomState } from "../../src/game/auction/view.js";
import type { Effect, GameEvent, TimerId } from "../../src/game/engine/types.js";
import { seededRng } from "../../src/game/auction/simulation.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { START_TIME } from "./harness.js";

export const AUCTION: AuctionConfig = { game: "subasta", traps: false };
export const AUCTION_TRAPS: AuctionConfig = { game: "subasta", traps: true };

type Payload<N extends ServerEventName> = Extract<ServerEvent, { name: N }>["payload"];

/** Como `Harness`, con el motor de la subasta: hora y temporizadores simulados, tokens «tok1», «tok2»… */
export class AuctionHarness {
  state: AuctionState;
  now = START_TIME;
  readonly pending: { at: number; timer: TimerId }[] = [];
  readonly emitted: { to: Seat | "all"; event: ServerEvent }[] = [];
  readonly registered: { token: string; pokemonId: number }[] = [];
  readonly catalog: PokemonCatalog;
  private tokens = 0;
  private readonly rng;

  constructor(opts: { config?: AuctionConfig; seed?: number; catalog?: PokemonCatalog } = {}) {
    this.rng = seededRng(opts.seed ?? 1);
    this.catalog = opts.catalog ?? fixtureCatalog();
    const created = createAuctionGame(opts.config ?? AUCTION, { userId: "u1", username: "ash" }, this.now);
    this.state = created.state;
    this.run(created.effects);
  }

  private run(effects: Effect[]): void {
    for (const effect of effects) {
      if (effect.kind === "schedule") this.pending.push({ at: effect.at, timer: effect.timer });
      else if (effect.kind === "emit") this.emitted.push({ to: effect.to, event: effect.event });
      else if (effect.kind === "register_silhouette") this.registered.push({ token: effect.token, pokemonId: effect.pokemonId });
    }
  }

  dispatch(event: GameEvent): Effect[] {
    const result = reduceAuction(this.state, event, this.now, { catalog: this.catalog, rng: this.rng, newToken: () => `tok${++this.tokens}` });
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

  payloads<N extends ServerEventName>(name: N): Payload<N>[] {
    return this.emitted.filter((e) => e.event.name === name).map((e) => e.event.payload as Payload<N>);
  }

  errorCodes(seat: Seat): ErrorCode[] {
    return this.emitted.filter((e) => e.event.name === "error" && e.to === seat).map((e) => (e.event.payload as { code: ErrorCode }).code);
  }

  view(seat: Seat) {
    return buildAuctionRoomState(this.state, seat, "ABC234", this.catalog, this.now);
  }

  lot() {
    return this.view(1).auction!.lot!;
  }

  startGame(): void {
    this.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    this.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    this.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
    this.advance(5000);
  }

  bid(seat: Seat, step?: 10_000 | 50_000 | 100_000): void {
    this.dispatch({ type: "BID", seat, step: step ?? null });
  }

  pass(seat: Seat): void {
    this.dispatch({ type: "PASS", seat });
  }

  /** Cierra el lote abierto: quien tiene el turno puja el precio inicial y el otro pasa. */
  sellToTurn(): Seat {
    const buyer = this.lot().turn;
    this.bid(buyer);
    this.pass(buyer === 1 ? 2 : 1);
    return buyer;
  }

  /** Avanza un lote: alterna entre comprar y que nadie puje, para llegar al final de cualquier forma. */
  sellToTurnOrNoBids(): void {
    if (this.lot().number % 2 === 0) this.noBids();
    else this.sellToTurn();
  }

  /** Cierra el lote abierto sin que nadie puje. */
  noBids(): void {
    const first = this.lot().turn;
    this.pass(first);
    this.pass(first === 1 ? 2 : 1);
  }
}
