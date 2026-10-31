import { AUCTION_SCENES, PLAYABLE_GAMES, type Seat, gameFromSlug } from "@pokemon-minigames/shared";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import { INACTIVITY_MS, INACTIVITY_WARNING_MS, STARTING_MONEY, TEAM_SIZE } from "../../src/game/auction/rules.js";
import { engineFor } from "../../src/game/game-engine.js";
import { AUCTION, AUCTION_TRAPS, AuctionHarness } from "./auction-harness.js";

const snapshot = JSON.parse(readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8")) as CatalogSnapshot;
const realCatalog = new PokemonCatalog(snapshot.pokemon.map((one) => ({ ...one, totalStats: totalStats(one.stats) })));

const started = (seed = 1, traps = false) => {
  const h = new AuctionHarness({ seed, catalog: realCatalog, config: traps ? AUCTION_TRAPS : AUCTION });
  h.startGame();
  return h;
};
const rivalOf = (seat: Seat): Seat => (seat === 1 ? 2 : 1);

/** Compra el lote abierto para ese asiento, que lo abre aunque el otro empiece. */
function buyFor(h: AuctionHarness, seat: Seat): void {
  if (h.lot().turn !== seat) h.pass(rivalOf(seat));
  h.bid(seat);
  if (h.state.bidding && h.state.bidding.leader === seat) h.pass(rivalOf(seat));
}

describe("subasta: sala y comienzo", () => {
  it("espera al segundo jugador, cuenta atrás, y abre el primer lote con el dinero para cada uno", () => {
    const h = new AuctionHarness({ catalog: realCatalog });
    expect(h.state.phase).toBe("waiting");
    h.startGame();
    expect(h.state.phase).toBe("auction");
    const view = h.view(1).auction!;
    expect(view.money).toEqual({ 1: STARTING_MONEY, 2: STARTING_MONEY });
    expect(view.lot).toMatchObject({ number: 1, currentBid: null, leader: null, warningUntil: null, auto: false, bids: [], retired: null });
    expect(view.lot!.silhouetteUrl).toMatch(/^\/silhouettes\/tok/);
  });

  it("hay 12 lotes", () => {
    expect(started().state.lots).toHaveLength(12);
  });

  it("engineFor lo reconoce", () => {
    expect(engineFor(AUCTION).create(AUCTION, { userId: "u1", username: "ash" }, 0, {}).state.phase).toBe("waiting");
  });

  it("sin trampas la silueta es la real; con ellas, a veces es de otro, y el token y el precio salen del mostrado", () => {
    expect(started(5).state.lots.every((lot) => lot.shownId === lot.realId)).toBe(true);
    let traps = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const h = started(seed, true);
      for (const lot of h.state.lots) if (lot.shownId !== lot.realId) traps++;
      expect(h.registered[0]).toMatchObject({ pokemonId: h.state.lots[0]!.shownId });
    }
    expect(traps).toBeGreaterThan(0);
  });

  it("registra la silueta solo cuando abre su lote, no antes", () => {
    const h = started();
    expect(h.registered).toHaveLength(1);
    h.sellToTurn();
    expect(h.registered).toHaveLength(2);
  });
});

describe("subasta: abierta a todos", () => {
  it("/jugar/subasta es un lobby y el menú la ofrece", () => {
    expect(gameFromSlug("subasta")).toBe("subasta");
    expect(gameFromSlug("silueta")).toBe("silueta");
    expect(PLAYABLE_GAMES).toContain("subasta");
  });
});

describe("subasta: el fondo de cada lote", () => {
  it("sale del azar, sin depender del Pokémon: el mismo Pokémon sale con fondos distintos", () => {
    const seen = new Map<number, Set<string>>();
    const scenes = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const lot of started(seed).state.lots) {
        scenes.add(lot.scene);
        const set = seen.get(lot.realId) ?? new Set<string>();
        set.add(lot.scene);
        seen.set(lot.realId, set);
      }
    }
    expect([...scenes].sort()).toEqual([...AUCTION_SCENES].sort());
    const repeated = [...seen.values()].filter((set) => set.size > 1);
    expect(repeated.length).toBeGreaterThan(100);
  });

  it("la pantalla recibe el fondo del lote", () => {
    const h = started();
    expect(h.lot().scene).toBe(h.state.lots[0]!.scene);
  });
});

describe("subasta: pujas por turnos", () => {
  it("la primera puja es el precio inicial, el turno pasa y queda en el historial", () => {
    const h = started();
    const { turn, price } = h.lot();
    h.advance(3000);
    h.bid(turn);
    expect(h.lot()).toMatchObject({ currentBid: price, leader: turn, turn: rivalOf(turn), bids: [{ seat: turn, amount: price }] });
  });

  it("se sube 10.000, 50.000 o 100.000; quien se retira tras una puja se lo deja al otro, que paga", () => {
    const h = started();
    const { turn, price } = h.lot();
    const rival = rivalOf(turn);
    h.bid(turn);
    h.bid(rival, 50_000);
    h.bid(turn, 100_000);
    h.bid(rival, 10_000);
    h.pass(turn);
    const final = price + 160_000;
    expect(h.view(1).auction!.money[rival]).toBe(STARTING_MONEY - final);
    expect(h.view(1).auction!.money[turn]).toBe(STARTING_MONEY);
    expect(h.view(1).auction!.teamSizes[rival]).toBe(1);
    expect(h.payloads("auction-sale")[0]).toEqual({ lot: 1, winner: rival, paid: final });
    expect(h.lot().number).toBe(2);
  });

  it("empieza un jugador distinto en cada lote", () => {
    const h = started();
    const first = h.lot().turn;
    h.sellToTurn();
    expect(h.lot().turn).not.toBe(first);
  });

  it.each([
    ["fuera de turno", (h: AuctionHarness, _turn: Seat, rival: Seat) => h.bid(rival), "NOT_YOUR_TURN"],
    ["retirarse fuera de turno", (h: AuctionHarness, _turn: Seat, rival: Seat) => h.pass(rival), "NOT_YOUR_TURN"],
    ["un salto al abrir", (h: AuctionHarness, turn: Seat) => h.bid(turn, 10_000), "INVALID_BID"],
  ] as const)("rechaza %s sin cambiar nada", (_name, act, code) => {
    const h = started();
    const { turn } = h.lot();
    const before = h.lot();
    act(h, turn, rivalOf(turn));
    expect(h.errorCodes(turn).concat(h.errorCodes(rivalOf(turn)))).toEqual([code]);
    expect(h.lot()).toEqual(before);
  });

  it("subir sin salto, o con uno que no existe, se rechaza", () => {
    const h = started();
    const { turn } = h.lot();
    const rival = rivalOf(turn);
    h.bid(turn);
    const before = h.lot();
    h.bid(rival);
    h.dispatch({ type: "BID", seat: rival, step: 12_345 as never });
    expect(h.errorCodes(rival)).toEqual(["INVALID_BID", "INVALID_BID"]);
    expect(h.lot()).toEqual(before);
  });

  it("no se puede pujar por encima del tope, que reserva 50.000 por hueco", () => {
    const h = started();
    const { turn } = h.lot();
    expect(h.view(turn).auction!.lot!.myLimit).toBe(STARTING_MONEY - 250_000);
    h.state.money[turn] = 100_000;
    h.bid(turn);
    expect(h.errorCodes(turn)).toEqual(["INVALID_BID"]);
    expect(h.lot().currentBid).toBeNull();
  });
});

describe("subasta: retirarse es definitivo", () => {
  it("si el primero se retira sin pujas, el otro decide; si abre, se lo lleva en ese momento a precio inicial", () => {
    const h = started();
    const { turn, price } = h.lot();
    const rival = rivalOf(turn);
    h.pass(turn);
    expect(h.lot()).toMatchObject({ number: 1, turn: rival, retired: turn, currentBid: null });
    h.bid(rival);
    expect(h.view(1).auction!.teamSizes[rival]).toBe(1);
    expect(h.view(1).auction!.money[rival]).toBe(STARTING_MONEY - price);
    expect(h.lot().number).toBe(2);
  });

  it("quien se retiró no vuelve a tener el turno de ese lote", () => {
    const h = started();
    const { turn } = h.lot();
    h.pass(turn);
    h.bid(turn);
    expect(h.errorCodes(turn)).toEqual(["NOT_YOUR_TURN"]);
  });

  it("si los dos se retiran, se lo lleva quien empezó (empatados), a precio inicial", () => {
    const h = started();
    const { turn, price } = h.lot();
    h.noBids();
    expect(h.view(1).auction!.teamSizes[turn]).toBe(1);
    expect(h.view(1).auction!.money[turn]).toBe(STARTING_MONEY - price);
  });

  it("si los dos se retiran y hay diferencia, se lo lleva quien tiene menos", () => {
    const h = started();
    buyFor(h, 1);
    h.noBids();
    expect(h.view(1).auction!.teamSizes).toEqual({ 1: 1, 2: 1 });
    buyFor(h, 1);
    h.noBids();
    expect(h.view(1).auction!.teamSizes).toEqual({ 1: 2, 2: 2 });
  });

  it("si no le alcanza, se lo lleva gratis", () => {
    const h = started();
    const { turn } = h.lot();
    h.state.money[turn] = 1000;
    h.noBids();
    expect(h.view(1).auction!.money[turn]).toBe(1000);
    expect(h.view(1).auction!.teamSizes[turn]).toBe(1);
  });
});

describe("subasta: sin reloj, con aviso de inactividad", () => {
  it("nada ocurre hasta los 60 s; entonces se avisa solo a quien tiene el turno", () => {
    const h = started();
    const { turn } = h.lot();
    h.advance(INACTIVITY_MS - 1);
    expect(h.view(turn).auction!.lot!.warningUntil).toBeNull();
    h.advance(1);
    expect(h.view(turn).auction!.lot!.warningUntil).toBe(h.now + INACTIVITY_WARNING_MS);
    expect(h.view(rivalOf(turn)).auction!.lot).toMatchObject({ warningUntil: null, rivalIdle: true });
    expect(h.view(turn).auction!.lot!.rivalIdle).toBe(false);
  });

  it("si no responde en 15 s, se retira", () => {
    const h = started();
    const { turn } = h.lot();
    h.advance(INACTIVITY_MS + INACTIVITY_WARNING_MS);
    expect(h.lot()).toMatchObject({ retired: turn, turn: rivalOf(turn), warningUntil: null });
  });

  it("«Sigo aquí» reinicia los 60 s, y con otro turnId se rechaza", () => {
    const h = started();
    const { turn, turnId } = h.lot();
    h.advance(INACTIVITY_MS);
    h.dispatch({ type: "STILL_HERE", seat: turn, turnId: turnId + 99 });
    expect(h.errorCodes(turn)).toEqual(["NOT_YOUR_TURN"]);
    h.dispatch({ type: "STILL_HERE", seat: turn, turnId });
    expect(h.view(turn).auction!.lot!.warningUntil).toBeNull();
    h.advance(INACTIVITY_MS - 1);
    expect(h.view(turn).auction!.lot!.warningUntil).toBeNull();
    expect(h.lot().retired).toBeNull();
  });

  it("vale 2 veces por turno: a la tercera se retira", () => {
    const h = started();
    const { turn, turnId } = h.lot();
    for (let time = 0; time < 2; time++) {
      h.advance(INACTIVITY_MS);
      h.dispatch({ type: "STILL_HERE", seat: turn, turnId });
    }
    h.advance(INACTIVITY_MS);
    expect(h.lot()).toMatchObject({ retired: turn, turn: rivalOf(turn) });
  });

  it("un turno nuevo empieza de cero; un temporizador viejo no hace nada", () => {
    const h = started();
    const { turn } = h.lot();
    h.advance(INACTIVITY_MS - 1000);
    h.bid(turn);
    h.advance(INACTIVITY_MS - 1);
    expect(h.lot()).toMatchObject({ turn: rivalOf(turn), warningUntil: null });
    expect(h.view(rivalOf(turn)).auction!.lot!.warningUntil).toBeNull();
  });

  it("«Sigo aquí» sin aviso abierto no hace nada", () => {
    const h = started();
    const before = h.lot();
    h.dispatch({ type: "STILL_HERE", seat: before.turn, turnId: before.turnId });
    expect(h.lot()).toEqual(before);
    expect(h.errorCodes(before.turn)).toEqual([]);
  });

  it("caído no se retira; si vuelve con el plazo vencido, tiene un último aviso que no cuenta", () => {
    const h = started();
    const { turn } = h.lot();
    h.advance(INACTIVITY_MS - 10_000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: turn });
    h.advance(20_000);
    expect(h.lot()).toMatchObject({ turn, retired: null, warningUntil: null });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: turn });
    expect(h.view(turn).auction!.lot!.warningUntil).toBe(h.now + INACTIVITY_WARNING_MS);
    expect(h.state.bidding!.stillHere).toBe(0);
  });

  it("caído con el aviso abierto: tampoco se retira al vencer", () => {
    const h = started();
    const { turn } = h.lot();
    h.advance(INACTIVITY_MS);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: turn });
    h.advance(INACTIVITY_WARNING_MS);
    expect(h.lot()).toMatchObject({ turn, retired: null });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: turn });
    expect(h.view(turn).auction!.lot!.warningUntil).toBe(h.now + INACTIVITY_WARNING_MS);
  });

  it("recargar con el aviso abierto lo conserva", () => {
    const h = started();
    const { turn } = h.lot();
    h.advance(INACTIVITY_MS);
    const before = h.view(turn).auction!.lot!.warningUntil;
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: turn });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: turn });
    expect(h.view(turn).auction!.lot!.warningUntil).toBe(before);
  });

  it("dos que nunca responden también llegan al final de la subasta", () => {
    const h = started();
    for (let tick = 0; tick < 400 && h.state.phase === "auction"; tick++) h.advance(15_000);
    expect(h.state.phase).not.toBe("auction");
    expect(h.state.teams[1]).toHaveLength(TEAM_SIZE);
    expect(h.state.teams[2]).toHaveLength(TEAM_SIZE);
  });

  it("pulsar «Sigo aquí» sin parar no alarga un lote más allá del máximo", () => {
    const h = started();
    const { number } = h.lot();
    for (let tick = 0; tick < 200 && h.lot().number === number; tick++) {
      const lot = h.lot();
      h.dispatch({ type: "STILL_HERE", seat: lot.turn, turnId: lot.turnId });
      h.advance(INACTIVITY_MS);
    }
    expect(h.lot().number).toBe(number + 1);
  });
});

describe("subasta: lotes que se reparten solos", () => {
  const fillFor1 = (h: AuctionHarness) => {
    for (let bought = 0; bought < TEAM_SIZE; bought++) buyFor(h, 1);
  };

  it("con 6, los demás van al otro, de uno en uno y a la vista, sin botones", () => {
    const h = started();
    fillFor1(h);
    expect(h.state.teams[1]).toHaveLength(6);
    const shown = h.lot();
    expect(shown).toMatchObject({ number: 7, auto: true, currentBid: null });
    expect(shown.silhouetteUrl).toMatch(/^\/silhouettes\/tok/);
    h.bid(shown.turn);
    expect(h.errorCodes(shown.turn)).toEqual(["WRONG_PHASE"]);
    h.advance(1999);
    expect(h.lot().number).toBe(7);
    h.advance(1);
    expect(h.lot().number).toBe(8);
    expect(h.state.teams[2]).toHaveLength(1);
  });

  it("cuentan como trampa si lo eran, y la partida llega a la revelación", () => {
    const h = started();
    const last = h.state.lots.at(-1)!;
    last.shownId = last.realId === 1 ? 2 : 1;
    fillFor1(h);
    for (let tick = 0; tick < 20 && h.state.phase === "auction"; tick++) h.advance(2000);
    expect(h.state.phase).toBe("reveal");
    expect(h.state.teams[2]).toHaveLength(6);
    expect(h.payloads("auction-reveal")[0]!.reveal.find((entry) => entry.pokemon.id === last.realId)!.wasTrap).toBe(true);
  });

  it("recargar durante uno lo conserva", () => {
    const h = started();
    fillFor1(h);
    const before = h.lot();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    expect(h.lot()).toEqual(before);
  });
});

describe("subasta: precio de las trampas", () => {
  it("el precio sale del Pokémon mostrado: la trampa también engaña en el precio", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const lot of started(seed, true).state.lots) {
        if (lot.shownId === lot.realId) continue;
        const shown = totalStats(realCatalog.get(lot.shownId)!.stats);
        const real = totalStats(realCatalog.get(lot.realId)!.stats);
        // Solo cuenta si los dos rangos de precio no se tocan: ahí el precio delata de cuál salió.
        if (shown * 0.8 <= real * 1.2 && real * 0.8 <= shown * 1.2) continue;
        expect(lot.price).toBeGreaterThanOrEqual(Math.floor(shown * 300 * 0.8) - 500);
        expect(lot.price).toBeLessThanOrEqual(Math.ceil(shown * 300 * 1.2) + 500);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("una silueta trampa nunca es la de otro lote: ver la misma dos veces delataría la trampa", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { lots } = started(seed, true).state;
      const reals = lots.map((lot) => lot.realId);
      for (const lot of lots) if (lot.shownId !== lot.realId) expect(reals).not.toContain(lot.shownId);
      expect(new Set(lots.map((lot) => lot.shownId)).size).toBe(12);
    }
  });
});

describe("subasta: las siluetas compradas", () => {
  it("cada jugador ve las suyas y las del rival, por su dirección opaca", () => {
    const h = started();
    const url = h.lot().silhouetteUrl;
    buyFor(h, 1);
    expect(h.view(2).auction!.purchases).toEqual({ 1: [url], 2: [] });
  });
});

describe("subasta: una acción tardía no cae en otro turno", () => {
  it("un segundo «Retirarme» no retira del lote siguiente sin haberlo visto", () => {
    const h = started();
    const buyer = h.lot().turn;
    h.bid(buyer);
    const turnId = h.lot().turnId;
    h.dispatch({ type: "PASS", seat: rivalOf(buyer), turnId });
    const next = h.lot();
    expect(next.number).toBe(2);
    h.dispatch({ type: "PASS", seat: next.turn, turnId });
    expect(h.errorCodes(next.turn)).toEqual(["NOT_YOUR_TURN"]);
    expect(h.lot()).toEqual(next);
  });

  it("una puja de un turno que venció no abre el lote siguiente", () => {
    const h = started();
    const first = h.lot().turn;
    h.pass(first);
    const late = h.lot();
    h.advance(INACTIVITY_MS + INACTIVITY_WARNING_MS);
    const next = h.lot();
    h.dispatch({ type: "BID", seat: next.turn, step: null, turnId: late.turnId });
    expect(h.lot().currentBid).toBeNull();
    expect(h.errorCodes(next.turn)).toEqual(["NOT_YOUR_TURN"]);
  });

  it("con el turno vigente sí vale", () => {
    const h = started();
    const lot = h.lot();
    h.dispatch({ type: "BID", seat: lot.turn, step: null, turnId: lot.turnId });
    expect(h.lot().currentBid).toBe(lot.price);
  });
});
