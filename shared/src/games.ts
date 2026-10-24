import type { DobleTipoConfig, RoomConfig, SilhouetteConfig } from "./types.js";

/** Los minijuegos de PokeMiniGames. */
export const GAME_KINDS = ["doble_tipo", "silueta"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

/** El trozo de ruta de cada juego (`/jugar/:slug`). */
export const GAME_SLUGS: Record<GameKind, string> = { doble_tipo: "doble-tipo", silueta: "silueta" };

export function gameFromSlug(slug: string): GameKind | null {
  return GAME_KINDS.find((game) => GAME_SLUGS[game] === slug) ?? null;
}

/** El juego de una configuración. Sin `game` (salas y clientes de antes de que hubiera varios) es «Doble tipo». */
export function gameOf(config: { game?: GameKind }): GameKind {
  return config.game ?? "doble_tipo";
}

/** Las generaciones con su región y su rango de números de Pokédex. */
export const GENERATIONS: readonly { n: number; region: string; from: number; to: number }[] = [
  { n: 1, region: "Kanto", from: 1, to: 151 },
  { n: 2, region: "Johto", from: 152, to: 251 },
  { n: 3, region: "Hoenn", from: 252, to: 386 },
  { n: 4, region: "Sinnoh", from: 387, to: 493 },
  { n: 5, region: "Teselia", from: 494, to: 649 },
  { n: 6, region: "Kalos", from: 650, to: 721 },
  { n: 7, region: "Alola", from: 722, to: 809 },
  { n: 8, region: "Galar", from: 810, to: 905 },
  { n: 9, region: "Paldea", from: 906, to: 1025 },
];

export function generationOf(id: number): number | null {
  return GENERATIONS.find((g) => id >= g.from && id <= g.to)?.n ?? null;
}

/** Rondas que se pueden elegir en la silueta. */
export const SILHOUETTE_ROUNDS = [5, 10, 15] as const;
export type SilhouetteRounds = (typeof SILHOUETTE_ROUNDS)[number];
export const SILHOUETTE_DEFAULT_ROUNDS: SilhouetteRounds = 10;
/** Por defecto solo Kanto: que de entrada no salgan los 1025. */
export const SILHOUETTE_DEFAULT_GENERATIONS: readonly number[] = [1];

/** La configuración es de una silueta. */
export function isSilhouetteConfig(config: RoomConfig): config is SilhouetteConfig {
  return config.game === "silueta";
}

/** La configuración si es de «Doble tipo»; nulo si es de otro juego (o no hay). */
export function asDobleTipo(config: RoomConfig | null): DobleTipoConfig | null {
  return config && !isSilhouetteConfig(config) ? config : null;
}
