import { readFileSync } from "node:fs";
import type { BattleMove, Seat } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import { STARTING_MONEY } from "../../src/game/auction/rules.js";
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
  it("tras la subasta se ve la revelación, ya observable, y dura 36 s", () => {
    const h = toReveal();
    expect(h.state.phase).toBe("reveal");
    expect(h.view(1).auction!.reveal).toHaveLength(12);
    h.advance(35_999);
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
    expect(battle(h, 1).deadline).toBe(h.now + 30_000);
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
    const mine = h.state.teams[1];
    const first = mine[0]!;
    for (const order of [mine.slice(0, 2), [first, first, ...mine.slice(2)], [...mine.slice(0, 5), h.state.teams[2][0]!], [...mine, 9], "x" as unknown as number[]]) {
      h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order });
    }
    expect(h.errorCodes(1)).toEqual(Array(5).fill("INVALID_CHOICE"));
    expect(battle(h, 1).confirmed).toBe(false);
  });

  it("sin confirmar en 30 s queda el orden de compra", () => {
    const h = toLineup();
    h.advance(30_000);
    expect(h.state.phase).toBe("battle");
    expect(battle(h, 1).myTitular).toBe(h.state.teams[1][0]);
  });
});

describe("turnos", () => {
  it("se elige sin reloj; si el rival ya eligió no se dice, y se resuelve en cuanto eligen los dos", () => {
    const h = toBattle();
    expect(battle(h, 1)).toMatchObject({ deadline: null, choosing: true, warningUntil: null });
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
    expect(battle(h, 1).choosing).toBe(false);
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    expect(h.errorCodes(1)).toEqual(["WRONG_PHASE"]);
    h.advance(3000);
    expect(battle(h, 1)).toMatchObject({ turn: 2, confirmed: false, choosing: true });
  });

  it("quien no elige usa el más efectivo; un temporizador viejo no hace nada", () => {
    const h = toBattle();
    for (const fighter of h.state.battle!.fighters[1].concat(h.state.battle!.fighters[2])) {
      fighter.hp = 5000;
      fighter.maxHp = 5000;
    }
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: moveOf(h, 1) });
    h.advance(59_000);
    expect(h.payloads("battle-turn")).toEqual([]);
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: moveOf(h, 2) });
    expect(h.payloads("battle-turn")).toHaveLength(1);
    // El temporizador del turno 1 vence durante la animación: no cierra nada.
    h.advance(3000);
    expect(battle(h, 1).turn).toBe(2);
    h.advance(74_999);
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
    h.dispatch({ type: "PAUSE_CONFIRM", seat: winner, choice: { titular: other } });
    expect(h.state.phase).toBe("battle_pause");
    h.dispatch({ type: "PAUSE_CONFIRM", seat: loser, choice: { titular: next } });
    expect(h.state.phase).toBe("battle");
    expect(h.state.battle!.titular).toEqual({ [winner]: other, [loser]: next });
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
    expect(ended.teams[1]).toHaveLength(6);
    expect(ended.auction!.reveal).toHaveLength(12);
    expect(ended.auction!.damage[winner]).toBeGreaterThan(0);
    const spent = ended.auction!.spent;
    expect(spent[1]).toBe(STARTING_MONEY - h.state.money[1]);
    expect(spent[2]).toBe(STARTING_MONEY - h.state.money[2]);
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
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    h.advance(50_000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.advance(25_000);
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
    onlyTo(pause.dispatch({ type: "PAUSE_CONFIRM", seat: loser, choice: { titular: next } }), loser);
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
    expect(battle(h, 1).choosing).toBe(false);
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
        else if (pick === 6) h.dispatch({ type: "PAUSE_CONFIRM", seat, choice: { titular: h.state.teams[seat][rng.int(6)] ?? 0 } });
        else if (pick === 7) h.dispatch({ type: "PAUSE_CONFIRM", seat, choice: { titular: 0 } });
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
    const garbage: unknown[] = [null, undefined, 7, "x", {}, { titular: "1" }, { titular: null }];
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
          () => h.dispatch({ type: "PAUSE_CONFIRM", seat, choice: { titular: down } }),
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

/** Con mucha vida: nadie cae por accidente en estas pruebas. */
function sturdy(h: AuctionHarness): AuctionHarness {
  for (const fighter of h.state.battle!.fighters[1].concat(h.state.battle!.fighters[2])) {
    fighter.hp = 5000;
    fighter.maxHp = 5000;
  }
  return h;
}

describe("sin reloj para elegir", () => {
  it("a los 60 s avisa solo a quien no eligió, y el otro sabe que espera", () => {
    const h = sturdy(toBattle());
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    h.advance(59_999);
    expect(battle(h, 2).warningUntil).toBeNull();
    h.advance(1);
    expect(battle(h, 2).warningUntil).toBe(h.now + 15_000);
    expect(battle(h, 2).rivalIdle).toBe(false);
    expect(battle(h, 1).warningUntil).toBeNull();
    expect(battle(h, 1).rivalIdle).toBe(true);
  });

  it("quien aún elige no sabe si el rival ya eligió: también a él solo le sale su aviso", () => {
    const h = sturdy(toBattle());
    h.advance(60_000);
    for (const seat of [1, 2] as const) expect(battle(h, seat)).toMatchObject({ warningUntil: h.now + 15_000, rivalIdle: false });
  });

  it("cada uno tiene su aviso: si el rival responde, a mí no me llega nada ni cambia lo que veo", () => {
    const h = sturdy(toBattle());
    h.advance(60_000);
    const before = JSON.stringify(h.view(1));
    const effects = h.dispatch({ type: "STILL_HERE", seat: 2, turnId: battle(h, 2).stepId });
    expect(effects.filter((one) => one.kind === "send_state" || one.kind === "emit")).toEqual([{ kind: "send_state", to: 2 }]);
    expect(JSON.stringify(h.view(1))).toBe(before);
    expect(battle(h, 2).warningUntil).toBeNull();
  });

  it("agotar mis respuestas no gasta las del rival", () => {
    const h = sturdy(toBattle());
    h.advance(60_000);
    h.dispatch({ type: "STILL_HERE", seat: 1, turnId: battle(h, 1).stepId });
    h.dispatch({ type: "STILL_HERE", seat: 2, turnId: battle(h, 2).stepId });
    h.advance(60_000);
    h.dispatch({ type: "STILL_HERE", seat: 2, turnId: battle(h, 2).stepId });
    h.dispatch({ type: "STILL_HERE", seat: 1, turnId: battle(h, 1).stepId });
    expect(h.errorCodes(1)).toEqual([]);
    expect(h.errorCodes(2)).toEqual([]);
  });

  it("si a uno se le acaba el aviso, juega solo él: el otro conserva su tiempo y puede elegir", () => {
    const h = sturdy(toBattle());
    h.advance(60_000);
    h.dispatch({ type: "STILL_HERE", seat: 2, turnId: battle(h, 2).stepId });
    h.advance(15_000);
    expect(h.payloads("battle-turn")).toEqual([]);
    expect(battle(h, 1).confirmed).toBe(true);
    expect(battle(h, 2).confirmed).toBe(false);
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: "forcejeo" });
    expect(h.payloads("battle-turn")).toHaveLength(1);
  });

  it("sin responder al aviso juega su mejor ataque, y sigue otro turno", () => {
    const h = sturdy(toBattle());
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    h.advance(74_999);
    expect(h.payloads("battle-turn")).toEqual([]);
    h.advance(1);
    const [turn] = h.payloads("battle-turn");
    expect(turn!.actions.find((one) => one.actor === 2)!.move).not.toBe("recuperar");
    h.advance(3000);
    expect(battle(h, 1)).toMatchObject({ turn: 2, warningUntil: null, choosing: true });
  });

  it("«Sigo aquí» vuelve a dar 60 s, como mucho dos veces en un turno", () => {
    const h = sturdy(toBattle());
    for (const answer of [1, 2]) {
      h.advance(60_000);
      const { stepId, warningUntil } = battle(h, 1);
      expect(warningUntil, `aviso ${answer}`).toBe(h.now + 15_000);
      h.dispatch({ type: "STILL_HERE", seat: 1, turnId: stepId });
      expect(battle(h, 1).warningUntil).toBeNull();
    }
    h.advance(59_999);
    expect(h.payloads("battle-turn")).toEqual([]);
    h.advance(1);
    expect(h.payloads("battle-turn")).toHaveLength(1);
  });

  it("el temporizador del aviso respondido ya no vale", () => {
    const h = sturdy(toBattle());
    h.advance(60_000);
    h.dispatch({ type: "STILL_HERE", seat: 1, turnId: battle(h, 1).stepId });
    h.advance(15_000);
    expect(h.payloads("battle-turn")).toEqual([]);
    expect(battle(h, 1).warningUntil).toBeNull();
  });

  it("«Sigo aquí» de otro paso, o de quien ya eligió, no vale", () => {
    const h = sturdy(toBattle());
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    h.advance(60_000);
    const { stepId } = battle(h, 2);
    h.dispatch({ type: "STILL_HERE", seat: 1, turnId: stepId });
    h.dispatch({ type: "STILL_HERE", seat: 2, turnId: stepId - 1 });
    expect(h.errorCodes(1)).toEqual(["NOT_YOUR_TURN"]);
    expect(h.errorCodes(2)).toEqual(["NOT_YOUR_TURN"]);
    expect(battle(h, 2).warningUntil).not.toBeNull();
  });

  it("elegir durante el aviso resuelve el turno", () => {
    const h = sturdy(toBattle());
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    h.advance(60_000);
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: "forcejeo" });
    expect(h.payloads("battle-turn")).toHaveLength(1);
  });

  it("recargar no alarga el turno", () => {
    const h = sturdy(toBattle());
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: "forcejeo" });
    h.advance(59_000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    h.advance(1000);
    expect(battle(h, 1).warningUntil).toBe(h.now + 15_000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    h.advance(15_000);
    expect(h.payloads("battle-turn")).toHaveLength(1);
  });
});

describe("cambiar de Pokémon", () => {
  const reserve = (h: AuctionHarness, seat: Seat): number => h.state.battle!.fighters[seat].find((one) => one.pokemon.id !== h.state.battle!.titular[seat] && one.hp > 0)!.pokemon.id;

  it("gasta el turno: entra primero, recibe el golpe del rival y no ataca", () => {
    const h = sturdy(toBattle());
    const before = h.state.battle!.titular[1];
    const next = reserve(h, 1);
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: next });
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: "forcejeo" });
    expect(h.state.battle!.titular[1]).toBe(next);
    const [turn] = h.payloads("battle-turn");
    expect(turn!.switches).toEqual([{ seat: 1, pokemonId: next }]);
    expect(turn!.actions.map((one) => one.actor)).toEqual([2]);
    const fighters = h.state.battle!.fighters[1];
    expect(fighters.find((one) => one.pokemon.id === next)!.hp).toBeLessThan(5000);
    expect(fighters.find((one) => one.pokemon.id === before)!.hp).toBe(5000);
  });

  it("el rival no sabe nada hasta que se resuelve", () => {
    const h = sturdy(toBattle());
    const before = JSON.stringify(h.view(2));
    const effects = h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: reserve(h, 1) });
    expect(effects.filter((one) => one.kind === "send_state" || one.kind === "emit")).toEqual([{ kind: "send_state", to: 1 }]);
    expect(JSON.stringify(h.view(2))).toBe(before);
  });

  it("quien cambia lo ve al recargar, y lo último que elige es lo que vale", () => {
    const h = sturdy(toBattle());
    const next = reserve(h, 1);
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: next });
    expect(battle(h, 1)).toMatchObject({ mySwitch: next, myMove: null, confirmed: true });
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    expect(battle(h, 1)).toMatchObject({ mySwitch: null, myMove: "forcejeo" });
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: next });
    expect(battle(h, 1)).toMatchObject({ mySwitch: next, myMove: null });
  });

  it("si cambian los dos no hay golpes, y sigue otro turno", () => {
    const h = sturdy(toBattle());
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: reserve(h, 1) });
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 2, pokemonId: reserve(h, 2) });
    const [turn] = h.payloads("battle-turn");
    expect(turn!.actions).toEqual([]);
    expect(turn!.switches).toHaveLength(2);
    h.advance(3000);
    expect(battle(h, 1)).toMatchObject({ turn: 2, choosing: true, mySwitch: null });
  });

  it("si el que entra cae con el golpe, termina el asalto", () => {
    const h = sturdy(toBattle());
    const next = reserve(h, 1);
    const entering = h.state.battle!.fighters[1].find((one) => one.pokemon.id === next)!;
    entering.hp = 1;
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: next });
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: "forcejeo" });
    expect(h.payloads("battle-round-ended")[0]).toMatchObject({ loser: 1, atLimit: false });
  });

  it("rechaza al que ya pelea, a un debilitado, a uno ajeno y la basura", () => {
    const h = sturdy(toBattle());
    const fallen = h.state.battle!.fighters[1].find((one) => one.pokemon.id !== h.state.battle!.titular[1])!;
    fallen.hp = 0;
    for (const pokemonId of [h.state.battle!.titular[1]!, fallen.pokemon.id, h.state.teams[2][0]!, "x" as unknown as number]) h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId });
    expect(h.errorCodes(1)).toEqual(Array(4).fill("INVALID_CHOICE"));
    expect(battle(h, 1).confirmed).toBe(false);
  });

  it("no se puede fuera de elegir: ni en la alineación ni mientras se anima", () => {
    const early = toLineup();
    early.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: early.state.teams[1][1]! });
    expect(early.errorCodes(1)).toEqual(["WRONG_PHASE"]);
    const h = sturdy(toBattle());
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "forcejeo" });
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: "forcejeo" });
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: reserve(h, 1) });
    expect(h.errorCodes(1)).toEqual(["WRONG_PHASE"]);
  });

  it("cambiar sin parar no alarga el asalto: lo cierra el límite de turnos", () => {
    const h = sturdy(toBattle());
    for (let turn = 0; turn < 20; turn++) {
      h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: reserve(h, 1) });
      h.dispatch({ type: "CHOOSE_SWITCH", seat: 2, pokemonId: reserve(h, 2) });
      h.advance(3000);
    }
    expect(h.payloads("battle-round-ended")[0]).toMatchObject({ round: 1, atLimit: true });
    expect(h.state.phase).toBe("battle_pause");
  });
});

describe("el escenario", () => {
  it("se sortea uno por combate: los dos ven el mismo y no cambia entre asaltos", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const h = toPause(seed);
      const scene = battle(h, 1).scene;
      expect(["bosque", "volcan", "playa", "noche"]).toContain(scene);
      expect(battle(h, 2).scene).toBe(scene);
      h.advance(15_000);
      expect(battle(h, 1).scene).toBe(scene);
      seen.add(scene);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
