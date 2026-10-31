import { Router } from "express";
import { buildFacts } from "./facts.js";
import { AppError } from "../http/errors.js";
import type { PokedexStore } from "./pokedex-store.js";
import type { PokemonCatalog } from "./pokemon-catalog.js";

export interface CatalogRouterDeps {
  catalog: PokemonCatalog;
  pokedex: PokedexStore;
}

/**
 * Datos públicos del catálogo. No requiere sesión: la lista de nombres y los datos curiosos. Con `?types=1` cada Pokémon lleva también
 * sus tipos (el cliente solo lo pide en las salas con pistas de tipos; sin pistas, los tipos ni viajan).
 */
export function createCatalogRouter({ catalog, pokedex }: CatalogRouterDeps): Router {
  const router = Router();
  // El catálogo no cambia mientras el servidor está en marcha: se arma una sola vez.
  const names = catalog.names();
  const namesWithTypes = catalog.namesWithTypes();
  const facts = buildFacts(catalog);

  router.get("/names", (req, res) => {
    res.set("Cache-Control", "public, max-age=86400").json(req.query.types === "1" ? namesWithTypes : names);
  });

  // Datos curiosos para la pantalla de espera de la revancha: del catálogo, sin nada privado.
  router.get("/facts", (_req, res) => {
    res.set("Cache-Control", "public, max-age=86400").json({ facts });
  });

  // La Pokédex, bajo /pokemon: en /pokedex están las páginas del cliente, y al recargar chocarían.
  router.get("/dex", (_req, res) => {
    res.set("Cache-Control", "public, max-age=86400").json({ pokemon: pokedex.entries() });
  });

  router.get("/dex/:id", (req, res) => {
    const detail = /^\d+$/.test(req.params.id) ? pokedex.detail(Number(req.params.id)) : undefined;
    if (!detail) throw new AppError(404, "POKEMON_NOT_FOUND", "Ese Pokémon no existe");
    res.set("Cache-Control", "public, max-age=86400").json(detail);
  });

  return router;
}
