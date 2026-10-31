import { writeFileSync } from "node:fs";
import { POKEAPI_BASE_URL } from "../src/catalog/pokeapi.js";
import { fetchPokedex } from "../src/catalog/pokedex-snapshot.js";

const MAX_ATTEMPTS = 4;

async function fetchJson(path: string): Promise<unknown> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${POKEAPI_BASE_URL}/${path}`);
      if (response.ok) return await response.json();
      // Un 404 no se arregla reintentando.
      if (response.status === 404) throw new Error(`404 ${path}`);
      throw new Error(`HTTP ${response.status} en ${path}`);
    } catch (error) {
      const permanent = error instanceof Error && error.message.startsWith("404");
      if (permanent || attempt === MAX_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error("inalcanzable");
}

console.log("Descargando la Pokédex de PokéAPI (puede tardar unos minutos)...");
const pokemon = await fetchPokedex({
  fetchJson,
  onProgress: (stage, done, total) => {
    if (done % 100 === 0 || done === total) console.log(`  ${stage}: ${done}/${total}`);
  },
});

const outputUrl = new URL("../data/pokedex.snapshot.json", import.meta.url);
writeFileSync(outputUrl, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: POKEAPI_BASE_URL, pokemon })}\n`);

const count = (test: (detail: (typeof pokemon)[number]) => boolean) => pokemon.filter(test).length;
console.log(`Listo: ${pokemon.length} Pokémon.`);
console.log(`Lore en español: ${count((p) => p.lore?.language === "es")}, en inglés: ${count((p) => p.lore?.language === "en")}, sin lore: ${count((p) => p.lore === null)}.`);
