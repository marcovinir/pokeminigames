import type { SilhouetteRegistry } from "../game/ports.js";

/**
 * Qué Pokémon dibuja cada silueta, en memoria: token opaco → número de Pokédex. Lleno, olvida los más viejos (una sala
 * solo necesita los de su partida; un token olvidado da 404 y la pantalla muestra su respaldo).
 */
export function createSilhouetteRegistry(options: { maxEntries?: number } = {}): SilhouetteRegistry {
  const maxEntries = options.maxEntries ?? 5000;
  const entries = new Map<string, number>();
  return {
    register(token, pokemonId) {
      entries.delete(token);
      entries.set(token, pokemonId);
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    },
    lookup(token) {
      return entries.get(token);
    },
  };
}
