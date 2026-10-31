import { readFileSync } from "node:fs";
import { type AuctionPokemon, STRATEGIES, type SimulationOptions, seededRng, simulateGame } from "../src/game/auction/simulation.js";

/** Informe de balance de Subasta Pokémon: `npm run auction:simulate -w server [partidas por duelo]`. */
const { pokemon } = JSON.parse(readFileSync(new URL("../data/pokedex.snapshot.json", import.meta.url), "utf8")) as { pokemon: AuctionPokemon[] };
const GAMES = Number(process.argv[2] ?? 2000);
const names = Object.keys(STRATEGIES) as (keyof typeof STRATEGIES)[];

/** Segundos estimados por acción de una persona. No es una medición: sirve para comparar. */
const SECONDS = { bidTurn: 4, reveal: 3, lineup: 15, combatTurn: 7, pause: 10 };

const percent = (part: number, total: number) => `${((part / total) * 100).toFixed(0)} %`;
const percentile = (sorted: number[], share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]!;

function report(title: string, options: SimulationOptions): void {
  console.log(`\n## ${title}`);
  const wins = Object.fromEntries(names.map((name) => [name, 0])) as Record<(typeof names)[number], number>;
  const played = { ...wins };
  const minutes: number[] = [];
  const turns: number[] = [];
  let rounds = 0;
  let atLimit = 0;
  let criticals = 0;
  let traps = 0;
  let games = 0;
  let firstSeatWins = 0;
  let seed = 1;

  console.log(`Fila contra columna, % de victorias de la fila (${GAMES} partidas por duelo):`);
  console.log(["", ...names].map((name) => name.padEnd(14)).join(""));
  for (const a of names) {
    const cells: string[] = [a.padEnd(14)];
    for (const b of names) {
      let won = 0;
      for (let game = 0; game < GAMES; game++) {
        const result = simulateGame(pokemon, [STRATEGIES[a], STRATEGIES[b]], options, seededRng(seed++));
        if (result.winner === 0) won++;
        if (a !== b) {
          wins[a] += result.winner === 0 ? 1 : 0;
          wins[b] += result.winner === 1 ? 1 : 0;
          played[a]++;
          played[b]++;
        } else if (result.winner === 0) {
          firstSeatWins++;
        }
        games++;
        rounds += result.rounds;
        atLimit += result.roundsAtLimit;
        criticals += result.criticals;
        traps += result.traps;
        turns.push(...result.turnsPerRound);
        const combatTurns = result.turnsPerRound.reduce((sum, count) => sum + count, 0);
        minutes.push((result.bidTurns * SECONDS.bidTurn + 12 * SECONDS.reveal + SECONDS.lineup + combatTurns * SECONDS.combatTurn + (result.rounds - 1) * SECONDS.pause) / 60);
      }
      cells.push(percent(won, GAMES).padEnd(14));
    }
    console.log(cells.join(""));
  }

  console.log("\nVictorias contra las otras estrategias:");
  for (const name of names) console.log(`  ${name.padEnd(14)}${percent(wins[name], played[name])}`);
  minutes.sort((a, b) => a - b);
  turns.sort((a, b) => a - b);
  console.log(`\nEspejo (misma estrategia), gana el asiento 1: ${percent(firstSeatWins, GAMES * names.length)}`);
  console.log(`Turnos por asalto: mediana ${percentile(turns, 0.5)}, p90 ${percentile(turns, 0.9)}`);
  console.log(`Asaltos por partida: ${(rounds / games).toFixed(1)}; llegan al límite: ${percent(atLimit, rounds)}`);
  console.log(`Críticos por partida: ${(criticals / games).toFixed(1)}; trampas por partida: ${(traps / games).toFixed(1)}`);
  console.log(`Duración estimada: mediana ${percentile(minutes, 0.5).toFixed(1)} min, p90 ${percentile(minutes, 0.9).toFixed(1)} min`);
}

report("Con trampas y con críticos", { traps: true });
report("Sin trampas", { traps: false });
report("Sin críticos", { traps: true, criticals: false });
