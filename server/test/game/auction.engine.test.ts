import { PLAYABLE_GAMES, gameFromSlug } from "@pokemon-minigames/shared";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import { STARTING_MONEY } from "../../src/game/auction/rules.js";
import { engineFor } from "../../src/game/game-engine.js";
import { AUCTION, AUCTION_TRAPS, AuctionHarness } from "./auction-harness.js";

const snapshot = JSON.parse(readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8")) as CatalogSnapshot;
const realCatalog = new PokemonCatalog(snapshot.pokemon.map((one) => ({ ...one, totalStats: totalStats(one.stats) })));

const started = (seed = 1, traps = false) => {
  const h = new AuctionHarness({ seed, catalog: realCatalog, config: traps ? AUCTION_TRAPS : AUCTION });
  h.startGame();
  return h;
};

describe("subasta: sala y comienzo", () => {
  it("espera al segundo jugador, cuenta atrás, y abre el primer lote con 1.000.000 para cada uno", () => {
    const h = new AuctionHarness({ catalog: realCatalog });
    expect(h.state.phase).toBe("waiting");
    h.startGame();
    expect(h.state.phase).toBe("auction");
    const view = h.view(1).auction!;
    expect(view.money).toEqual({ 1: STARTING_MONEY, 2: STARTING_MONEY });
    expect(view.lot).toMatchObject({ number: 1, kind: "pokemon", currentBid: null, leader: null, deadline: h.now + 10_000 });
    expect(view.lot!.silhouetteUrl).toMatch(/^\/silhouettes\/tok/);
  });

  it("los lotes van L L O L L O L L O: 6 Pokémon y 3 objetos", () => {
    expect(started().state.lots.map((lot) => lot.kind[0])).toEqual(["p", "p", "i", "p", "p", "i", "p", "p", "i"]);
  });

  it("engineFor lo reconoce", () => {
    expect(engineFor(AUCTION).create(AUCTION, { userId: "u1", username: "ash" }, 0, {}).state.phase).toBe("waiting");
  });

  it("sin trampas la silueta es la real; con ellas, a veces es de otro, y el token y el precio salen del mostrado", () => {
    expect(started(5).state.lots.flatMap((lot) => (lot.kind === "pokemon" ? [lot.shownId === lot.realId] : [])).every(Boolean)).toBe(true);
    let traps = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const h = started(seed, true);
      for (const lot of h.state.lots) if (lot.kind === "pokemon" && lot.shownId !== lot.realId) traps++;
      const opened = h.state.lots[0]!;
      if (opened.kind === "pokemon") expect(h.registered[0]).toMatchObject({ pokemonId: opened.shownId });
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

describe("subasta: oculta hasta que tenga combate", () => {
  it("/jugar/subasta es un lobby, pero el juego no está entre los que ofrece el menú", () => {
    expect(gameFromSlug("subasta")).toBe("subasta");
    expect(gameFromSlug("silueta")).toBe("silueta");
    expect(PLAYABLE_GAMES).not.toContain("subasta");
  });
});

describe("subasta: pujas por turnos", () => {
  it("la primera puja es el precio inicial; el turno pasa y el reloj se reinicia", () => {
    const h = started();
    const { turn, price } = h.lot();
    const rival = turn === 1 ? 2 : 1;
    h.advance(3000);
    h.bid(turn);
    expect(h.lot()).toMatchObject({ currentBid: price, leader: turn, turn: rival, deadline: h.now + 10_000 });
  });

  it("se sube 10.000, 50.000 o 100.000; quien pasa tras una puja se lo deja al otro, que paga", () => {
    const h = started();
    const { turn, price } = h.lot();
    const rival = turn === 1 ? 2 : 1;
    h.bid(turn);
    h.bid(rival, 50_000);
    h.bid(turn, 100_000);
    h.bid(rival, 10_000);
    h.pass(turn);
    const final = price + 160_000;
    expect(h.view(1).auction!.money[rival]).toBe(STARTING_MONEY - final);
    expect(h.view(1).auction!.money[turn]).toBe(STARTING_MONEY);
    expect(h.view(1).auction!.teamSizes[rival]).toBe(1);
    expect(h.payloads("auction-sale")[0]).toEqual({ lot: 1, kind: "pokemon", winner: rival, paid: final });
    expect(h.lot().number).toBe(2);
  });

  it("empieza un jugador distinto en cada lote", () => {
    const h = started();
    const first = h.lot().turn;
    h.sellToTurn();
    expect(h.lot().turn).not.toBe(first);
  });

  it.each([
    ["fuera de turno", (h: AuctionHarness, _turn: 1 | 2, rival: 1 | 2) => h.bid(rival), "NOT_YOUR_TURN"],
    ["pasar fuera de turno", (h: AuctionHarness, _turn: 1 | 2, rival: 1 | 2) => h.pass(rival), "NOT_YOUR_TURN"],
    ["un salto al abrir", (h: AuctionHarness, turn: 1 | 2) => h.bid(turn, 10_000), "INVALID_BID"],
  ] as const)("rechaza %s sin cambiar nada", (_name, act, code) => {
    const h = started();
    const { turn } = h.lot();
    const before = h.lot();
    act(h, turn, turn === 1 ? 2 : 1);
    expect(h.errorCodes(turn).concat(h.errorCodes(turn === 1 ? 2 : 1))).toEqual([code]);
    expect(h.lot()).toEqual(before);
  });

  it("subir sin salto, o con uno que no existe, se rechaza", () => {
    const h = started();
    const { turn } = h.lot();
    const rival = turn === 1 ? 2 : 1;
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
    expect(h.view(turn).auction!.lot!.myLimit).toBe(STARTING_MONEY - 100_000);
    h.state.money[turn] = 100_000;
    h.bid(turn);
    expect(h.errorCodes(turn)).toEqual(["INVALID_BID"]);
    expect(h.lot().currentBid).toBeNull();
  });

  it("sin responder en 10 s cuenta como pasar; un temporizador viejo no hace nada", () => {
    const h = started();
    const { turn, number } = h.lot();
    const rival = turn === 1 ? 2 : 1;
    h.advance(6000);
    h.bid(turn);
    h.advance(6000);
    expect(h.lot()).toMatchObject({ number, turn: rival });
    h.advance(4000);
    expect(h.view(1).auction!.teamSizes[turn]).toBe(1);
    expect(h.lot().number).toBe(number + 1);
  });

  it("si los dos pasan, se lo lleva quien empezó (empatados), a precio inicial", () => {
    const h = started();
    const { turn, price } = h.lot();
    h.noBids();
    expect(h.view(1).auction!.teamSizes[turn]).toBe(1);
    expect(h.view(1).auction!.money[turn]).toBe(STARTING_MONEY - price);
  });

  it("si los dos pasan y hay diferencia, se lo lleva quien tiene menos", () => {
    const h = started();
    const buyer = h.lot().turn;
    h.bid(buyer);
    h.pass(buyer === 1 ? 2 : 1);
    const other = buyer === 1 ? 2 : 1;
    h.noBids();
    expect(h.view(1).auction!.teamSizes).toEqual({ [buyer]: 1, [other]: 1 });
    h.noBids(); // El objeto, sin dueño.
    // Ahora el comprador lleva otro más, y el siguiente sin pujas debe ir al otro.
    if (h.lot().turn === buyer) {
      h.bid(buyer);
      h.pass(other);
    } else {
      h.pass(other);
      h.bid(buyer);
      h.pass(other);
    }
    expect(h.view(1).auction!.teamSizes[buyer]).toBe(2);
    h.noBids();
    expect(h.view(1).auction!.teamSizes).toEqual({ [buyer]: 2, [other]: 2 });
  });

  it("si no le alcanza, se lo lleva gratis", () => {
    const h = started();
    const { turn } = h.lot();
    h.state.money[turn] = 1000;
    h.noBids();
    expect(h.view(1).auction!.money[turn]).toBe(1000);
    expect(h.view(1).auction!.teamSizes[turn]).toBe(1);
  });

  it("los objetos no pagan tope de hueco, y si los dos pasan nadie se lo lleva", () => {
    const h = started();
    h.sellToTurn();
    h.sellToTurn();
    expect(h.lot().kind).toBe("item");
    expect(h.lot().item).toBeDefined();
    const { turn } = h.lot();
    expect(h.view(turn).auction!.lot!.myLimit).toBe(h.view(turn).auction!.money[turn]);
    h.noBids();
    const view = h.view(1).auction!;
    expect([...view.items[1], ...view.items[2]]).toEqual([]);
    expect(h.payloads("auction-sale").at(-1)).toMatchObject({ kind: "item", winner: null, paid: 0 });
  });

  it("un objeto vendido queda en la lista del ganador", () => {
    const h = started();
    h.sellToTurn();
    h.sellToTurn();
    const item = h.lot().item!;
    const buyer = h.sellToTurn();
    expect(h.view(1).auction!.items[buyer]).toEqual([item]);
  });

  it("con 3 Pokémon, los lotes restantes van al otro sin pujar", () => {
    const h = started();
    // Siempre compra el asiento 1: el otro pasa.
    const buyFor1 = () => {
      if (h.lot().turn === 1) {
        h.bid(1);
        h.pass(2);
      } else {
        h.pass(2);
        h.bid(1);
        h.pass(2);
      }
    };
    for (let bought = 0; bought < 3; ) {
      if (h.lot().kind === "item") {
        h.noBids();
      } else {
        buyFor1();
        bought++;
      }
    }
    while (h.state.phase === "auction" && h.lot().kind === "item") h.noBids();
    const sizes = h.state.phase === "auction" ? h.view(1).auction! : null;
    if (sizes) expect(sizes.teamSizes[1]).toBe(3);
    while (h.state.phase === "auction") h.noBids();
    expect(h.state.teams[1]).toHaveLength(3);
    expect(h.state.teams[2]).toHaveLength(3);
  });
});

describe("subasta: precio de las trampas y máximo de 3", () => {
  it("el precio sale del Pokémon mostrado: la trampa también engaña en el precio", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const lot of started(seed, true).state.lots) {
        if (lot.kind !== "pokemon" || lot.shownId === lot.realId) continue;
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

  it("quien ya tiene 3 no vuelve a tener turno en un Pokémon: se abren solo objetos y el resto va al otro", () => {
    const h = started();
    const buyFor1 = () => {
      if (h.lot().turn === 2) h.pass(2);
      h.bid(1);
      h.pass(2);
    };
    let bought = 0;
    while (bought < 3) {
      if (h.lot().kind === "item") {
        h.noBids();
      } else {
        buyFor1();
        bought++;
      }
    }
    expect(h.state.teams[1]).toHaveLength(3);
    while (h.state.phase === "auction") {
      expect(h.lot().kind).toBe("item");
      h.noBids();
    }
    expect(h.state.teams[1]).toHaveLength(3);
    expect(h.state.teams[2]).toHaveLength(3);
  });
});

describe("subasta: lo que se aprendió de la revisión", () => {
  it("un lote que nadie llegó a ver no cuenta como trampa en la revelación", () => {
    const h = started();
    const pokemonLots = h.state.lots.filter((lot) => lot.kind === "pokemon");
    const last = pokemonLots.at(-1)!;
    if (last.kind === "pokemon") last.shownId = last.realId === 1 ? 2 : 1;
    let bought = 0;
    while (bought < 3) {
      if (h.lot().kind === "item") {
        h.noBids();
      } else {
        if (h.lot().turn === 2) h.pass(2);
        h.bid(1);
        h.pass(2);
        bought++;
      }
    }
    while (h.state.phase === "auction") h.noBids();
    const reveal = h.payloads("auction-reveal")[0]!.reveal;
    expect(reveal.find((entry) => last.kind === "pokemon" && entry.pokemon.id === last.realId)!.wasTrap).toBe(false);
  });

  it("una silueta trampa nunca es la de otro lote: ver la misma dos veces delataría la trampa", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const lots = started(seed, true).state.lots.flatMap((lot) => (lot.kind === "pokemon" ? [lot] : []));
      const reals = lots.map((lot) => lot.realId);
      for (const lot of lots) if (lot.shownId !== lot.realId) expect(reals).not.toContain(lot.shownId);
      expect(new Set(lots.map((lot) => lot.shownId)).size).toBe(6);
    }
  });
});

describe("subasta: una acción tardía no cae en otro turno", () => {
  it("un segundo «Pasar» no pasa el lote siguiente sin haberlo visto", () => {
    const h = new AuctionHarness();
    h.startGame();
    const buyer = h.lot().turn;
    const other = buyer === 1 ? 2 : 1;
    h.bid(buyer);
    const turnId = h.lot().turnId;
    h.dispatch({ type: "PASS", seat: other, turnId });
    const next = h.lot();
    expect(next.number).toBe(2);
    h.dispatch({ type: "PASS", seat: next.turn, turnId });
    expect(h.errorCodes(next.turn)).toEqual(["NOT_YOUR_TURN"]);
    expect(h.lot()).toEqual(next);
  });

  it("una puja de un turno que venció no abre el lote siguiente", () => {
    const h = new AuctionHarness();
    h.startGame();
    const first = h.lot().turn;
    h.pass(first);
    const late = h.lot();
    h.advance(10_000);
    const next = h.lot();
    h.dispatch({ type: "BID", seat: next.turn, step: null, turnId: late.turnId });
    expect(h.lot().currentBid).toBeNull();
    expect(h.errorCodes(next.turn)).toEqual(["NOT_YOUR_TURN"]);
  });

  it("con el turno vigente sí vale", () => {
    const h = new AuctionHarness();
    h.startGame();
    const lot = h.lot();
    h.dispatch({ type: "BID", seat: lot.turn, step: null, turnId: lot.turnId });
    expect(h.lot().currentBid).toBe(lot.price);
  });
});
