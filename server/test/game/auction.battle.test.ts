import { readFileSync } from "node:fs";
import type { BattleMove, Seat } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import { seededRng } from "../../src/game/auction/simulation.js";
import { AUCTION, AUCTION_TRAPS, AuctionHarness } from "./auction-harness.js";

const snapshot = JSON.parse(readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8")) as CatalogSnapshot;
const catalog = new PokemonCatalog(snapshot.pokemon.map((one) => ({ ...one, totalStats: totalStats(one.stats) })));

/** Termina la subasta: se reparten los lotes sin pujar. */
function toReveal(seed = 1, traps = false): AuctionHarness {
  const h = new AuctionHarness({ seed, catalog, config: traps ? AUCTION_TRAPS : AUCTION });
  h.startGame();
  while (h.state.phase === "auction") h.noBids();
  return h;
}

function toLineup(seed = 1): AuctionHarness {
  const h = toReveal(seed);
  h.dispatch({ type: "READY", seat: 1 });
  h.dispatch({ type: "READY", seat: 2 });
  return h;
}

function toBattle(seed = 1): AuctionHarness {
  const h = toLineup(seed);
  for (const seat of [1, 2] as const) h.dispatch({ type: "CHOOSE_LINEUP", seat, order: [...h.state.teams[seat]] });
  return h;
}

const battle = (h: AuctionHarness, seat: Seat) => h.view(seat).auction!.battle!;
const moveOf = (h: AuctionHarness, seat: Seat) => battle(h, seat).moves.find((one) => one.move !== "recuperar")!.move;

/** Elige los dos y deja pasar la animación. */
function playTurn(h: AuctionHarness, a?: BattleMove, b?: BattleMove): void {
  h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: a ?? moveOf(h, 1) });
  h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: b ?? moveOf(h, 2) });
  h.advance(3000);
}

function toPause(seed = 1): AuctionHarness {
  const h = toBattle(seed);
  for (let turn = 0; turn < 25 && h.state.phase === "battle"; turn++) playTurn(h);
  expect(h.state.phase).toBe("battle_pause");
  return h;
}

/** Quién perdió el titular en la pausa actual. */
const loserOf = (h: AuctionHarness): Seat => (h.state.battle!.titular[1] === null ? 1 : 2);

describe("revelación y alineación", () => {
  it("tras la subasta se ve la revelación, ya observable, y dura 18 s", () => {
    const h = toReveal();
    expect(h.state.phase).toBe("reveal");
    expect(h.view(1).auction!.reveal).toHaveLength(6);
    h.advance(17_999);
    expect(h.state.phase).toBe("reveal");
    h.advance(1);
    expect(h.state.phase).toBe("lineup");
  });

  it("se salta en cuanto los dos confirman; con uno solo, no", () => {
    const h = toReveal();
    h.dispatch({ type: "READY", seat: 1 });
    expect(h.state.phase).toBe("reveal");
    h.dispatch({ type: "READY", seat: 2 });
    expect(h.state.phase).toBe("lineup");
    expect(battle(h, 1).deadline).toBe(h.now + 20_000);
  });

  it("confirmar dos veces la misma persona no salta la revelación", () => {
    const h = toReveal();
    h.dispatch({ type: "READY", seat: 1 });
    h.dispatch({ type: "READY", seat: 1 });
    expect(h.state.phase).toBe("reveal");
  });

  it("recargar en la revelación la conserva", () => {
    const h = toReveal();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    expect(h.view(1).phase).toBe("reveal");
  });

  it("irse en la revelación o en la alineación es abandono", () => {
    const a = toReveal();
    a.dispatch({ type: "LEAVE", seat: 1 });
    expect(a.state.outcome).toEqual({ winnerSeat: 2, reason: "forfeit" });
    const b = toLineup();
    b.dispatch({ type: "LEAVE", seat: 2 });
    expect(b.state.outcome).toEqual({ winnerSeat: 1, reason: "forfeit" });
  });

  it("el titular rival no se ve hasta que los dos confirman; luego sí", () => {
    const h = toLineup();
    const mine = [...h.state.teams[1]].reverse();
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: mine });
    expect(battle(h, 1).confirmed).toBe(true);
    expect(battle(h, 2).confirmed).toBe(false);
    expect(battle(h, 2).rivalTitular).toBeNull();
    expect(h.state.phase).toBe("lineup");
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 2, order: [...h.state.teams[2]] });
    expect(h.state.phase).toBe("battle");
    expect(battle(h, 2).rivalTitular).toBe(mine[0]);
    expect(battle(h, 1).myTitular).toBe(mine[0]);
    expect(h.payloads("battle-turn")).toEqual([]);
  });

  it("rechaza una alineación con Pokémon ajenos, repetidos o incompleta", () => {
    const h = toLineup();
    const [a, b, c] = h.state.teams[1] as [number, number, number];
    for (const order of [[a, b], [a, a, b], [a, b, h.state.teams[2][0]!], [a, b, c, 9], "x" as unknown as number[]]) {
      h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order });
    }
    expect(h.errorCodes(1)).toEqual(Array(5).fill("INVALID_CHOICE"));
    expect(battle(h, 1).confirmed).toBe(false);
  });

  it("sin confirmar en 20 s queda el orden de compra", () => {
    const h = toLineup();
    h.advance(20_000);
    expect(h.state.phase).toBe("battle");
    expect(battle(h, 1).myTitular).toBe(h.state.teams[1][0]);
  });
});

describe("turnos", () => {
  it("se elige en 8 s; si el rival ya eligió no se dice, y se resuelve en cuanto eligen los dos", () => {
    const h = toBattle();
    expect(battle(h, 1).deadline).toBe(h.now + 8000);
    const before = JSON.stringify(h.view(2));
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: moveOf(h, 1) });
    expect(battle(h, 1).confirmed).toBe(true);
    expect(JSON.stringify(h.view(2))).toBe(before);
    expect(h.payloads("battle-turn")).toEqual([]);
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: moveOf(h, 2) });
    const [event] = h.payloads("battle-turn");
    expect(event).toMatchObject({ round: 1, turn: 1 });
    expect(event!.actions.length).toBeGreaterThan(0);
  });

  it("mientras se anima no se puede elegir, y luego empieza el turno siguiente", () => {
    const h = toBattle(2);
    for (const fighter of h.state.battle!.fighters[1].concat(h.state.battle!.fighters[2])) {
      fighter.hp = 5000;
      fighter.maxHp = 5000;
    }
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: moveOf(h, 1) });
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: moveOf(h, 2) });
    expect(battle(h, 1).deadline).toBeNull();
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    expect(h.errorCodes(1)).toEqual(["WRONG_PHASE"]);
    h.advance(3000);
    expect(battle(h, 1)).toMatchObject({ turn: 2, confirmed: false, deadline: h.now + 8000 });
  });

  it("quien no elige usa el más efectivo; un temporizador viejo no hace nada", () => {
    const h = toBattle();
    for (const fighter of h.state.battle!.fighters[1].concat(h.state.battle!.fighters[2])) {
      fighter.hp = 5000;
      fighter.maxHp = 5000;
    }
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: moveOf(h, 1) });
    h.advance(7000);
    expect(h.payloads("battle-turn")).toEqual([]);
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: moveOf(h, 2) });
    expect(h.payloads("battle-turn")).toHaveLength(1);
    // El temporizador del turno 1 vence durante la animación: no cierra nada.
    h.advance(3000);
    expect(battle(h, 1).turn).toBe(2);
    h.advance(7999);
    expect(h.payloads("battle-turn")).toHaveLength(1);
    h.advance(1);
    expect(h.payloads("battle-turn")).toHaveLength(2);
    expect(battle(h, 1).turn).toBe(2);
  });

  it("rechaza un movimiento que no tiene, fuera de fase, o Recuperar repetido", () => {
    const h = toBattle();
    const notMine: BattleMove = battle(h, 1).moves.some((one) => one.move === "dragon") ? "fairy" : "dragon";
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: notMine });
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "hax" as BattleMove });
    expect(h.errorCodes(1)).toEqual(["INVALID_CHOICE", "INVALID_CHOICE"]);
    const early = toLineup();
    early.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    expect(early.errorCodes(1)).toEqual(["WRONG_PHASE"]);

    const heal = toBattle();
    playTurn(heal, "recuperar", "recuperar");
    expect(battle(heal, 1).moves.find((one) => one.move === "recuperar")!.used).toBe(true);
    heal.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "recuperar" });
    expect(heal.errorCodes(1)).toEqual(["INVALID_CHOICE"]);
  });

  it("los movimientos dicen su eficacia contra el rival", () => {
    const h = toBattle();
    for (const move of battle(h, 1).moves) expect(typeof move.effectiveness).toBe("number");
  });

  it("al debilitarse un Pokémon, avisa y tras la animación abre la pausa", () => {
    const h = toBattle();
    for (let turn = 0; turn < 25 && h.payloads("battle-round-ended").length === 0; turn++) {
      h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: moveOf(h, 1) });
      h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: moveOf(h, 2) });
      if (h.payloads("battle-round-ended").length === 0) h.advance(3000);
    }
    expect(h.payloads("battle-round-ended")[0]).toMatchObject({ round: 1, atLimit: false });
    expect(h.state.phase).toBe("battle");
    h.advance(3000);
    expect(h.state.phase).toBe("battle_pause");
  });

  it("el límite de 20 turnos también cierra el asalto, sin dejarlo eterno", () => {
    const h = toBattle();
    for (const seat of [1, 2] as const) {
      for (const fighter of h.state.battle!.fighters[seat]) {
        fighter.hp = 5000;
        fighter.maxHp = 5000;
      }
    }
    for (let turn = 0; turn < 20; turn++) playTurn(h, "forcejeo", "forcejeo");
    expect(h.payloads("battle-round-ended")[0]).toMatchObject({ round: 1, atLimit: true });
    expect(h.state.phase).toBe("battle_pause");
    expect(battle(h, 1).round).toBe(1);
  });
});

describe("la pausa", () => {
  it("dura 15 s para los dos, y el titular rival se oculta mientras se decide", () => {
    const h = toPause();
    expect(battle(h, 1).deadline).toBe(h.now + 15_000);
    expect(battle(h, 1).rivalTitular).toBeNull();
    expect(battle(h, 2).rivalTitular).toBeNull();
  });

  it("sin confirmar, sale el primer vivo en orden; quien ganó sigue si no cambia", () => {
    const h = toPause();
    const loser = loserOf(h);
    const winner: Seat = loser === 1 ? 2 : 1;
    const stays = h.state.battle!.titular[winner];
    h.advance(15_000);
    expect(h.state.phase).toBe("battle");
    expect(battle(h, 1)).toMatchObject({ round: 2, turn: 1 });
    expect(h.state.battle!.titular[winner]).toBe(stays);
    expect(h.state.battle!.titular[loser]).toBe(h.state.battle!.fighters[loser].find((one) => one.hp > 0)!.pokemon.id);
  });

  it("se cierra en cuanto confirman los dos; el ganador también puede cambiar de titular", () => {
    const h = toPause();
    const loser = loserOf(h);
    const winner: Seat = loser === 1 ? 2 : 1;
    const other = h.state.battle!.fighters[winner].find((one) => one.pokemon.id !== h.state.battle!.titular[winner] && one.hp > 0)!.pokemon.id;
    const next = h.state.battle!.fighters[loser].find((one) => one.hp > 0)!.pokemon.id;
    h.dispatch({ type: "PAUSE_CONFIRM", seat: winner, choice: { items: [], titular: other } });
    expect(h.state.phase).toBe("battle_pause");
    h.dispatch({ type: "PAUSE_CONFIRM", seat: loser, choice: { items: [], titular: next } });
    expect(h.state.phase).toBe("battle");
    expect(h.state.battle!.titular).toEqual({ [winner]: other, [loser]: next });
  });

  it("rechaza objetos que no tiene, objetivos inválidos y un titular debilitado o ajeno", () => {
    const h = toPause();
    const loser = loserOf(h);
    const rival: Seat = loser === 1 ? 2 : 1;
    const down = h.state.battle!.fighters[loser].find((one) => one.hp <= 0)!.pokemon.id;
    const up = h.state.battle!.fighters[loser].find((one) => one.hp > 0)!.pokemon.id;
    const send = (choice: unknown) => h.dispatch({ type: "PAUSE_CONFIRM", seat: loser, choice: choice as never });
    send({ items: [], titular: down });
    send({ items: [], titular: h.state.battle!.fighters[rival][0]!.pokemon.id });
    h.state.items[loser] = [];
    send({ items: [{ item: "revivir", target: down }], titular: up });
    h.state.items[loser] = ["revivir", "pocion"];
    send({ items: [{ item: "revivir", target: up }], titular: up });
    send({ items: [{ item: "pocion", target: down }], titular: up });
    send({ items: [{ item: "revivir", target: down }, { item: "revivir", target: down }], titular: up });
    send("basura");
    expect(h.errorCodes(loser)).toEqual(Array(7).fill("INVALID_CHOICE"));
    expect(battle(h, loser).confirmed).toBe(false);
    expect(h.state.items[loser]).toEqual(["revivir", "pocion"]);
  });

  it("los objetos se aplican al cerrar la pausa, no antes: el rival no los ve", () => {
    const h = toPause();
    const loser = loserOf(h);
    const down = h.state.battle!.fighters[loser].find((one) => one.hp <= 0)!;
    h.state.items[loser] = ["revivir"];
    const rival: Seat = loser === 1 ? 2 : 1;
    const before = JSON.stringify(h.view(rival).auction!.battle);
    h.dispatch({ type: "PAUSE_CONFIRM", seat: loser, choice: { items: [{ item: "revivir", target: down.pokemon.id }], titular: down.pokemon.id } });
    expect(JSON.stringify(h.view(rival).auction!.battle)).toBe(before);
    expect(h.state.battle!.fighters[loser].find((one) => one.pokemon.id === down.pokemon.id)!.hp).toBe(0);
    h.advance(15_000);
    expect(h.state.battle!.fighters[loser].find((one) => one.pokemon.id === down.pokemon.id)!.hp).toBe(Math.round(down.maxHp / 2));
    expect(h.state.items[loser]).toEqual([]);
    expect(h.state.battle!.titular[loser]).toBe(down.pokemon.id);
  });

  it("la Cinta dura un asalto", () => {
    const h = toPause();
    const loser = loserOf(h);
    h.state.items[loser] = ["cinta"];
    const up = h.state.battle!.fighters[loser].find((one) => one.hp > 0)!.pokemon.id;
    h.dispatch({ type: "PAUSE_CONFIRM", seat: loser, choice: { items: [{ item: "cinta", target: null }], titular: up } });
    h.advance(15_000);
    expect(battle(h, 1).cinta[loser]).toBe(true);
    for (let turn = 0; turn < 25 && h.state.phase === "battle"; turn++) playTurn(h);
    expect(battle(h, 1).cinta[loser]).toBe(false);
  });

  it("Recuperar vuelve a estar disponible en el asalto siguiente", () => {
    const h = toPause();
    h.state.battle!.healed = { 1: true, 2: true };
    h.advance(15_000);
    expect(battle(h, 1).moves.find((one) => one.move === "recuperar")!.used).toBe(false);
  });
});

describe("el final", () => {
  const killAll = (h: AuctionHarness, seat: Seat) => {
    for (const fighter of h.state.battle!.fighters[seat]) fighter.hp = 0;
    h.state.battle!.titular[seat] = null;
  };

  it("sin nadie vivo al acabar la pausa, pierde, con el resumen de daño y gasto", () => {
    const h = toPause();
    const loser = loserOf(h);
    killAll(h, loser);
    h.advance(15_000);
    const winner: Seat = loser === 1 ? 2 : 1;
    expect(h.state.outcome).toEqual({ winnerSeat: winner, reason: "completed" });
    const ended = h.payloads("game-ended")[0]!;
    expect(ended.winnerSeat).toBe(winner);
    expect(ended.teams[1]).toHaveLength(3);
    expect(ended.auction!.reveal).toHaveLength(6);
    expect(ended.auction!.damage[winner]).toBeGreaterThan(0);
    const spent = ended.auction!.spent;
    expect(spent[1].pokemon + spent[1].items).toBe(1_000_000 - h.state.money[1]);
    expect(spent[2].pokemon + spent[2].items).toBe(1_000_000 - h.state.money[2]);
  });

  it("con un Revivir aún puede volver: tiene la pausa para usarlo", () => {
    const h = toPause();
    const loser = loserOf(h);
    killAll(h, loser);
    h.state.items[loser] = ["revivir"];
    const target = h.state.battle!.fighters[loser][0]!.pokemon.id;
    h.dispatch({ type: "PAUSE_CONFIRM", seat: loser, choice: { items: [{ item: "revivir", target }], titular: target } });
    h.advance(15_000);
    expect(h.state.phase).toBe("battle");
    expect(h.state.battle!.titular[loser]).toBe(target);
  });

  it("con un Revivir sin usar, pierde igual", () => {
    const h = toPause();
    const loser = loserOf(h);
    killAll(h, loser);
    h.state.items[loser] = ["revivir"];
    h.advance(15_000);
    expect(h.state.phase).toBe("finished");
  });

  it("irse en pleno combate es abandono", () => {
    const h = toBattle();
    h.dispatch({ type: "LEAVE", seat: 1 });
    expect(h.state.outcome).toEqual({ winnerSeat: 2, reason: "forfeit" });
    expect(h.payloads("game-ended")[0]!.auction).toBeDefined();
  });
});

describe("desconexiones", () => {
  it("si se cae, se usa su movimiento por defecto y el combate sigue", () => {
    const h = toBattle();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: moveOf(h, 2) });
    h.advance(8000);
    expect(h.payloads("battle-turn")).toHaveLength(1);
    expect(h.state.outcome).toBeNull();
  });

  it("recargar en cada fase devuelve el estado", () => {
    for (const make of [toLineup, toBattle, toPause]) {
      const h = make();
      const before = h.view(1).auction;
      h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
      h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
      expect(h.view(1).auction).toEqual(before);
    }
  });

  it("si se caen los dos, cada uno tiene sus 30 s completos", () => {
    const h = toBattle();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.advance(29_000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(1000);
    expect(h.state.outcome).toBeNull();
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
    expect(h.state.outcome).toEqual({ winnerSeat: 2, reason: "disconnect" });
  });

  it("si no vuelve ninguno, se abandona", () => {
    const h = toBattle();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(31_000);
    expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "abandoned" });
  });
});

describe("nada se adelanta en el combate", () => {
  it("lo que un jugador envía no llega al rival hasta resolverse", () => {
    const h = toBattle();
    const sentBefore = h.emitted.length;
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    expect(h.emitted.slice(sentBefore).filter((e) => e.to === 2 || e.to === "all")).toEqual([]);
  });

  it("al decidir solo se actualiza quien decidió: al rival no le llega ni un aviso", () => {
    const onlyTo = (effects: ReturnType<AuctionHarness["dispatch"]>, seat: Seat) => {
      const sent = effects.filter((one) => one.kind === "send_state" || one.kind === "emit");
      expect(sent).toEqual([{ kind: "send_state", to: seat }]);
    };
    const lineup = toLineup();
    onlyTo(lineup.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: [...lineup.state.teams[1]] }), 1);
    const fight = toBattle();
    onlyTo(fight.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: "forcejeo" }), 2);
    const pause = toPause();
    const loser = loserOf(pause);
    const next = pause.state.battle!.fighters[loser].find((one) => one.hp > 0)!.pokemon.id;
    onlyTo(pause.dispatch({ type: "PAUSE_CONFIRM", seat: loser, choice: { items: [], titular: next } }), loser);
  });
});

describe("recargar tras decidir", () => {
  it("quien confirmó la alineación la recupera; el rival no", () => {
    const h = toLineup();
    const order = [...h.state.teams[1]].reverse();
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order });
    expect(battle(h, 1).myLineup).toEqual(order);
    expect(battle(h, 2).myLineup).toBeNull();
  });

  it("quien eligió movimiento lo recupera; el rival no, y se olvida al resolver", () => {
    const h = toBattle();
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    expect(battle(h, 1).myMove).toBe("forcejeo");
    expect(battle(h, 2).myMove).toBeNull();
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: "forcejeo" });
    expect(battle(h, 1).myMove).toBeNull();
  });

  it("quien confirmó la pausa recupera objetos y titular; el rival no", () => {
    const h = toPause();
    const loser = loserOf(h);
    const rival: Seat = loser === 1 ? 2 : 1;
    const next = h.state.battle!.fighters[loser].find((one) => one.hp > 0)!.pokemon.id;
    const choice = { items: [], titular: next };
    h.dispatch({ type: "PAUSE_CONFIRM", seat: loser, choice });
    expect(battle(h, loser).myPause).toEqual(choice);
    expect(battle(h, rival).myPause).toBeNull();
  });

  it("la revelación dice si ya confirmé, solo a mí", () => {
    const h = toReveal();
    const effects = h.dispatch({ type: "READY", seat: 1 });
    expect(effects.filter((one) => one.kind === "send_state" || one.kind === "emit")).toEqual([{ kind: "send_state", to: 1 }]);
    expect(battle(h, 1).confirmed).toBe(true);
    expect(battle(h, 2).confirmed).toBe(false);
  });

  it("mientras se anima no se ofrecen movimientos", () => {
    const h = toBattle();
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: "forcejeo" });
    expect(battle(h, 1).deadline).toBeNull();
    expect(battle(h, 1).moves).toEqual([]);
  });
});

describe("partidas al azar, con mensajes inválidos", () => {
  it("siempre terminan, sin PS ni dinero negativos", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rng = seededRng(seed * 7);
      const h = new AuctionHarness({ seed, catalog, config: AUCTION_TRAPS });
      h.startGame();
      for (let step = 0; step < 4000 && h.state.phase !== "finished"; step++) {
        const seat = (rng.int(2) + 1) as Seat;
        const pick = rng.int(10);
        if (pick === 0) h.advance(1000 + rng.int(20_000));
        else if (pick === 1) h.dispatch({ type: "BID", seat, step: [null, 10_000, 50_000, 100_000][rng.int(4)] as never });
        else if (pick === 2) h.dispatch({ type: "PASS", seat });
        else if (pick === 3) h.dispatch({ type: "READY", seat });
        else if (pick === 4) h.dispatch({ type: "CHOOSE_LINEUP", seat, order: [...h.state.teams[seat]].reverse() });
        else if (pick === 5) h.dispatch({ type: "CHOOSE_MOVE", seat, move: (["forcejeo", "recuperar", "fire", "hax"] as BattleMove[])[rng.int(4)]! });
        else if (pick === 6) h.dispatch({ type: "PAUSE_CONFIRM", seat, choice: { items: [], titular: h.state.teams[seat][rng.int(3)] ?? 0 } });
        else if (pick === 7) h.dispatch({ type: "PAUSE_CONFIRM", seat, choice: { items: [{ item: "revivir", target: h.state.teams[seat][0] ?? 0 }], titular: 0 } });
        else h.advance(500);
        expect(Math.min(h.state.money[1], h.state.money[2])).toBeGreaterThanOrEqual(0);
        for (const s of [1, 2] as const) for (const fighter of h.state.battle?.fighters[s] ?? []) expect(fighter.hp).toBeGreaterThanOrEqual(0);
      }
      for (let tick = 0; tick < 600 && h.state.phase !== "finished"; tick++) h.advance(20_000);
      expect(h.state.phase).toBe("finished");
      expect(h.state.outcome?.reason).toBe("completed");
    }
  }, 120_000);
});

describe("«Listo» tardío", () => {
  it("si la revelación ya terminó se ignora, sin error", () => {
    const h = toLineup();
    h.dispatch({ type: "READY", seat: 1 });
    expect(h.errorCodes(1)).toEqual([]);
    expect(h.state.phase).toBe("lineup");
  });
});

describe("el orden del rival", () => {
  it("no se ve: su equipo va en orden de compra, y el mío en mi orden", () => {
    const h = toLineup();
    const bought = [...h.state.teams[1]];
    const order = [...bought].reverse();
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order });
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 2, order: [...h.state.teams[2]] });
    expect(battle(h, 2).rivalTeam.map((one) => one.pokemon.id)).toEqual(bought);
    expect(battle(h, 1).myTeam.map((one) => one.pokemon.id)).toEqual(order);
  });
});

describe("partidas al azar, con basura y desconexiones", () => {
  it("siempre terminan, sin excepciones", () => {
    const garbage: unknown[] = [null, undefined, 7, "x", {}, { items: null, titular: 1 }, { items: [null], titular: 1 }, { items: [{ item: "cinta", target: { a: 1 } }], titular: "1" }];
    for (let seed = 1; seed <= 60; seed++) {
      const rng = seededRng(seed * 13);
      const h = new AuctionHarness({ seed, catalog, config: AUCTION_TRAPS });
      h.startGame();
      for (let step = 0; step < 1500 && h.state.phase !== "finished"; step++) {
        const seat = (rng.int(2) + 1) as Seat;
        const junk = garbage[rng.int(garbage.length)] as never;
        const down = h.state.battle?.fighters[seat].find((one) => one.hp <= 0)?.pokemon.id ?? 0;
        const events = [
          () => h.advance(1000 + rng.int(20_000)),
          () => h.dispatch({ type: "PLAYER_DISCONNECTED", seat }),
          () => h.dispatch({ type: "PLAYER_CONNECTED", seat }),
          () => h.dispatch({ type: "CHOOSE_LINEUP", seat, order: junk }),
          () => h.dispatch({ type: "CHOOSE_MOVE", seat, move: junk }),
          () => h.dispatch({ type: "PAUSE_CONFIRM", seat, choice: junk }),
          () => h.dispatch({ type: "PAUSE_CONFIRM", seat, choice: { items: [{ item: "revivir", target: down }], titular: down } }),
          () => h.dispatch({ type: "BID", seat, step: null }),
        ];
        events[rng.int(events.length)]!();
      }
      for (let tick = 0; tick < 600 && h.state.phase !== "finished"; tick++) h.advance(20_000);
      expect(h.state.phase).toBe("finished");
      expect(h.state.outcome).not.toBeNull();
    }
  }, 120_000);
});

describe("volver recargando con el rival ya vencido", () => {
  it("recibe su estado además del final: si no, su pantalla no sabría quién es", () => {
    const h = toBattle();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.advance(10_000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(25_000);
    const effects = h.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
    expect(h.state.outcome).toEqual({ winnerSeat: 2, reason: "disconnect" });
    const stateAt = effects.findIndex((one) => one.kind === "send_state" && one.to === 2);
    const endedAt = effects.findIndex((one) => one.kind === "emit" && one.event.name === "game-ended");
    expect(stateAt).toBeGreaterThanOrEqual(0);
    expect(stateAt).toBeLessThan(endedAt);
  });
});
