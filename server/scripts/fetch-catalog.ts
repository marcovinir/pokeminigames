import { mkdirSync, writeFileSync } from "node:fs";
import { POKEAPI_BASE_URL, fetchCatalog } from "../src/catalog/pokeapi.js";
import { validateSnapshot } from "../src/catalog/snapshot.js";

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

const outputUrl = new URL("../data/catalog.snapshot.json", import.meta.url);

console.log("Descargando el catálogo de PokéAPI (puede tardar un par de minutos)...");
const snapshot = await fetchCatalog({
  fetchJson,
  onProgress: (done, total) => {
    if (done % 100 === 0 || done === total) console.log(`  ${done}/${total}`);
  },
});

const problems = validateSnapshot(snapshot);
if (problems.length > 0) {
  console.error("El snapshot descargado tiene problemas y no se guardó:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
writeFileSync(outputUrl, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Listo: ${snapshot.pokemon.length} Pokémon guardados en server/data/catalog.snapshot.json`);
