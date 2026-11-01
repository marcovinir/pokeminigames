import type { MoveData } from "@pokemon-minigames/shared";
// Va dentro del paquete del servidor, como un módulo más: jugar no depende de rutas ni de PokéAPI.
import snapshot from "../../../data/moves.snapshot.json" with { type: "json" };
import { FILLER_MOVES } from "./move-selection.js";

export interface MoveSet {
  moves: string[];
  ability: string | null;
}

export interface MoveBook {
  moves: Record<string, MoveData>;
  abilities: Record<string, { es: string; en: string }>;
  sets: Record<string, MoveSet>;
}

const book = snapshot as unknown as MoveBook;

/** Los movimientos y habilidades reales: `npm run moves:fetch -w server` los genera. */
export const getMoveBook = (): MoveBook => book;

/** Los 4 de un Pokémon. Un número fuera de la instantánea pelea con los básicos. */
export const moveSetOf = (id: number): MoveSet => book.sets[id] ?? { moves: FILLER_MOVES.slice(0, 4), ability: null };
