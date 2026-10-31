import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import { AUCTION, AUCTION_TRAPS, AuctionHarness } from "./auction-harness.js";

const snapshot = JSON.parse(readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8")) as CatalogSnapshot;
const catalog = new PokemonCatalog(snapshot.pokemon.map((one) => ({ ...one, totalStats: totalStats(one.stats) })));

/** Juega toda la subasta, comprobando en cada paso lo que `check` diga. */
function playAll(h: AuctionHarness, check: () => void = () => {}): void {
  check();
  while (h.state.phase === "auction") {
    h.sellToTurnOrNoBids();
    check();
  }
}

describe("subasta: nada se adelanta", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("con trampas (semilla %i), ningún evento ni estado dice el Pokémon real antes de la revelación", (seed) => {
    const h = new AuctionHarness({ seed, catalog, config: AUCTION_TRAPS });
    h.startGame();
    const reals = h.state.lots.flatMap((lot) => (lot.kind === "pokemon" ? [catalog.get(lot.realId)!] : []));
    const leaks = (text: string) => reals.filter((one) => text.includes(`"id":${one.id},`) || text.includes(one.names.es) || text.includes(one.names.en));
    playAll(h, () => {
      if (h.state.phase !== "auction") return;
      expect(leaks(JSON.stringify(h.view(1)))).toEqual([]);
      expect(leaks(JSON.stringify(h.view(2)))).toEqual([]);
      // Ni con otros nombres: el estado no lleva los campos internos del lote.
      expect(JSON.stringify(h.view(1))).not.toMatch(/realId|shownId|pokemonId/);
      const lotNow = h.state.lots[h.state.lotIndex];
      if (lotNow?.kind === "pokemon") expect(JSON.stringify(h.view(1).auction!.lot)).not.toMatch(new RegExp(`[^0-9]${lotNow.realId}[^0-9]*$|"id"`));
      const events = h.emitted.filter((e) => e.event.name !== "auction-reveal" && e.event.name !== "game-ended");
      expect(leaks(JSON.stringify(events))).toEqual([]);
    });
    expect(h.state.phase).not.toBe("auction");
  });

  it("la dirección de la silueta es un token opaco, no el número", () => {
    const h = new AuctionHarness({ catalog, config: AUCTION });
    h.startGame();
    expect(h.lot().silhouetteUrl).toBe("/silhouettes/tok1");
    expect(JSON.stringify(h.view(1).auction!.lot)).not.toContain("shownId");
  });
});

describe("subasta: revelación", () => {
  it("al acabar los lotes revela los 6 Pokémon reales de los dos, con la marca de trampa", () => {
    const h = new AuctionHarness({ seed: 3, catalog, config: AUCTION_TRAPS });
    h.startGame();
    const lots = h.state.lots.flatMap((lot) => (lot.kind === "pokemon" ? [lot] : []));
    playAll(h);
    const reveal = h.payloads("auction-reveal")[0]!.reveal;
    expect(reveal).toHaveLength(6);
    expect(reveal.map((entry) => entry.pokemon.id).sort()).toEqual(lots.map((lot) => lot.realId).sort());
    for (const entry of reveal) {
      const lot = lots.find((one) => one.realId === entry.pokemon.id)!;
      expect(entry.wasTrap).toBe(lot.shownId !== lot.realId);
    }
    expect(reveal.filter((entry) => entry.owner === 1)).toHaveLength(3);
    expect(reveal.filter((entry) => entry.owner === 2)).toHaveLength(3);
    expect(h.view(1).auction!.reveal).toEqual(reveal);
  });
});

describe("subasta: desconexiones", () => {
  it("recargar en plena puja devuelve el mismo estado", () => {
    const h = new AuctionHarness({ catalog, config: AUCTION });
    h.startGame();
    h.bid(h.lot().turn);
    const before = h.view(1).auction;
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    expect(h.view(1).auction).toEqual(before);
    expect(h.state.phase).toBe("auction");
  });

  it("si se cae quien tiene el turno, pasa al agotarse el reloj y la subasta sigue", () => {
    const h = new AuctionHarness({ catalog, config: AUCTION });
    h.startGame();
    const { turn, number } = h.lot();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: turn });
    h.advance(10_000);
    expect(h.state.phase).toBe("auction");
    expect(h.state.lotIndex + 1 === number || h.lot().turn !== turn).toBe(true);
  });

  it("si no vuelve a tiempo, pierde; irse a mitad de la subasta, también", () => {
    const dropped = new AuctionHarness({ catalog, config: AUCTION });
    dropped.startGame();
    dropped.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    dropped.advance(31_000);
    expect(dropped.state.outcome).toEqual({ winnerSeat: 1, reason: "disconnect" });

    const left = new AuctionHarness({ catalog, config: AUCTION });
    left.startGame();
    left.dispatch({ type: "LEAVE", seat: 1 });
    expect(left.state.outcome).toEqual({ winnerSeat: 2, reason: "forfeit" });
  });

  it("los eventos después de terminar no hacen nada", () => {
    const h = new AuctionHarness({ catalog, config: AUCTION });
    h.startGame();
    h.dispatch({ type: "LEAVE", seat: 1 });
    const state = h.state;
    h.dispatch({ type: "BID", seat: 2, step: null });
    expect(h.state).toBe(state);
  });
});
