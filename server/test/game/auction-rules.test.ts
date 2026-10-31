import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bidCap, combatHp, damage, drawLots, moveCategory, movesFor, startingPrice } from "../../src/game/auction/rules.js";
import { type AuctionPokemon, STRATEGIES, openingBid, seededRng, simulateGame } from "../../src/game/auction/simulation.js";

const { pokemon: raw } = JSON.parse(readFileSync(new URL("../../data/pokedex.snapshot.json", import.meta.url), "utf8")) as { pokemon: AuctionPokemon[] };
const fixedRng = (value: number) => ({ int: (max: number) => Math.min(value, max - 1) });

describe("fórmulas", () => {
  it("los PS de combate suman 60 a los base", () => {
    expect(combatHp(80)).toBe(140);
    expect(combatHp(1)).toBe(61);
  });

  it.each([
    ["normal: 80 contra 80", 30, 80, 80, 1, 30],
    ["Shuckle contra Shuckle: el cociente se limita a 0,25", 30, 10, 230, 1, 15],
    ["100 contra Defensa 5: el cociente se limita a 4", 30, 100, 5, 1, 60],
    ["×4 con 80 contra 80", 30, 80, 80, 4, 120],
    ["×½", 30, 80, 80, 0.5, 15],
    ["inmunidad", 30, 200, 10, 0, 0],
    ["el mínimo es 5", 20, 10, 230, 0.25, 5],
  ])("daño, %s", (_name, power, attack, defense, effectiveness, expected) => {
    expect(damage({ power, attack, defense, effectiveness })).toBe(expected);
  });

  it("el crítico multiplica por 1,5, pero no vence una inmunidad", () => {
    expect(damage({ power: 30, attack: 80, defense: 80, effectiveness: 1, critical: true })).toBe(45);
    expect(damage({ power: 30, attack: 80, defense: 80, effectiveness: 0, critical: true })).toBe(0);
  });

  it("físico o especial según el tipo, con la regla clásica", () => {
    for (const type of ["normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel"] as const) expect(moveCategory(type)).toBe("physical");
    for (const type of ["fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark", "fairy"] as const) expect(moveCategory(type)).toBe("special");
  });

  it("un ataque por tipo, y Forcejeo siempre", () => {
    expect(movesFor(["fire", "flying"]).map((move) => move.name)).toEqual(["fire", "flying", "forcejeo"]);
    expect(movesFor(["normal"]).map((move) => move.name)).toEqual(["normal", "forcejeo"]);
    expect(movesFor(["normal"]).find((move) => move.name === "forcejeo")).toMatchObject({ type: null, power: 20, category: "physical" });
  });

  it("el precio inicial va de ±20 % y redondeado a miles", () => {
    expect(startingPrice(500, fixedRng(0))).toBe(120_000);
    expect(startingPrice(500, fixedRng(40))).toBe(180_000);
    expect(startingPrice(500, fixedRng(20))).toBe(150_000);
  });

  it("el tope de puja reserva 50.000 por cada hueco que quede después de este lote", () => {
    expect(bidCap(1_000_000, 0)).toBe(750_000);
    expect(bidCap(1_000_000, 5)).toBe(1_000_000);
    expect(bidCap(200_000, 0)).toBe(0);
  });

  it("los lotes son 4 débiles, 4 medios y 4 fuertes, sin repetir", () => {
    const lots = drawLots(raw, seededRng(7));
    expect(new Set(lots.map((lot) => lot.id)).size).toBe(12);
    const sorted = [...raw].sort((a, b) => a.total - b.total || a.id - b.id);
    const rank = (one: AuctionPokemon) => Math.floor((sorted.findIndex((other) => other.id === one.id) * 3) / sorted.length);
    expect(lots.map(rank).sort()).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
  });
});

describe("retirarse es definitivo", () => {
  const options = { traps: false };

  it("si el primero se retira sin pujas y el otro abre, se lo lleva al precio inicial: no hay más pujas", () => {
    expect(openingBid(100_000, { first: 0, second: 500_000 }, [10_000])).toEqual({ winner: 1, paid: 100_000 });
  });

  it("si nadie abre, no hay venta", () => {
    expect(openingBid(100_000, { first: 0, second: 0 }, [10_000])).toBeNull();
  });

  it("si los dos pueden, suben hasta que uno no llega", () => {
    expect(openingBid(100_000, { first: 125_000, second: 125_000 }, [10_000])).toEqual({ winner: 0, paid: 120_000 });
  });

  it("los números permiten completar los 6 pagando, sin regalar por falta de dinero en partidas normales", () => {
    const result = simulateGame(raw, [STRATEGIES.equilibrada, STRATEGIES.equilibrada], options, seededRng(3));
    expect(Math.min(...result.spent)).toBeGreaterThan(0);
  });
});

describe("simulación de una partida", () => {
  const names = Object.keys(STRATEGIES) as (keyof typeof STRATEGIES)[];

  it("siempre termina, con 6 y 6 Pokémon, sin dinero negativo y con ganador, sea cual sea la estrategia", () => {
    let seed = 1;
    for (const a of names) {
      for (const b of names) {
        for (let game = 0; game < 40; game++) {
          const result = simulateGame(raw, [STRATEGIES[a], STRATEGIES[b]], { traps: game % 2 === 0 }, seededRng(seed++));
          expect(result.teamSizes).toEqual([6, 6]);
          expect(Math.min(...result.moneyLeft)).toBeGreaterThanOrEqual(0);
          expect([0, 1]).toContain(result.winner);
          expect(result.rounds).toBeGreaterThan(0);
          expect(result.turnsPerRound.every((turns) => turns <= 20)).toBe(true);
        }
      }
    }
  });

  it("con la misma semilla da lo mismo", () => {
    const run = () => simulateGame(raw, [STRATEGIES.equilibrada, STRATEGIES.derrochadora], { traps: true }, seededRng(99));
    expect(run()).toEqual(run());
  });

  it("sin trampas nunca muestra otro Pokémon; con ellas, a veces", () => {
    let withTraps = 0;
    for (let seed = 1; seed <= 60; seed++) {
      expect(simulateGame(raw, [STRATEGIES.equilibrada, STRATEGIES.equilibrada], { traps: false }, seededRng(seed)).traps).toBe(0);
      withTraps += simulateGame(raw, [STRATEGIES.equilibrada, STRATEGIES.equilibrada], { traps: true }, seededRng(seed)).traps;
    }
    expect(withTraps).toBeGreaterThan(0);
  });

  it("los críticos salen a veces, y se pueden apagar para comparar", () => {
    let on = 0;
    for (let seed = 1; seed <= 40; seed++) {
      on += simulateGame(raw, [STRATEGIES.equilibrada, STRATEGIES.equilibrada], { traps: false }, seededRng(seed)).criticals;
      expect(simulateGame(raw, [STRATEGIES.equilibrada, STRATEGIES.equilibrada], { traps: false, criticals: false }, seededRng(seed)).criticals).toBe(0);
    }
    expect(on).toBeGreaterThan(0);
  });

  it("un duelo de dos inmunes también termina", () => {
    const immune = (id: number, type: "ghost" | "normal"): AuctionPokemon => ({ id, types: [type], total: 300, stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 } });
    const pool = Array.from({ length: 30 }, (_, index) => immune(index + 1, index % 2 ? "ghost" : "normal"));
    const result = simulateGame(pool, [STRATEGIES.equilibrada, STRATEGIES.equilibrada], { traps: false }, seededRng(3));
    expect([0, 1]).toContain(result.winner);
  });
});
