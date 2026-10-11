import { Router } from "express";
import type { PokemonCatalog } from "./pokemon-catalog.js";

export interface CatalogRouterDeps {
  catalog: PokemonCatalog;
}

/**
 * Datos públicos del catálogo. No requiere sesión: es solo la lista de nombres. Con `?types=1` cada Pokémon lleva también
 * sus tipos (el cliente solo lo pide en las salas con pistas de tipos; sin pistas, los tipos ni viajan).
 */
export function createCatalogRouter({ catalog }: CatalogRouterDeps): Router {
  const router = Router();
  // El catálogo no cambia mientras el servidor está en marcha: se arma una sola vez.
  const names = catalog.names();
  const namesWithTypes = catalog.namesWithTypes();

  router.get("/names", (req, res) => {
    res.set("Cache-Control", "public, max-age=86400").json(req.query.types === "1" ? namesWithTypes : names);
  });

  return router;
}
