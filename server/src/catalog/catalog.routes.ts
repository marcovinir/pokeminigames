import { Router } from "express";
import { buildFacts } from "./facts.js";
import type { PokemonCatalog } from "./pokemon-catalog.js";

export interface CatalogRouterDeps {
  catalog: PokemonCatalog;
}

/**
 * Datos públicos del catálogo. No requiere sesión: la lista de nombres y los datos curiosos. Con `?types=1` cada Pokémon lleva también
 * sus tipos (el cliente solo lo pide en las salas con pistas de tipos; sin pistas, los tipos ni viajan).
 */
export function createCatalogRouter({ catalog }: CatalogRouterDeps): Router {
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

  return router;
}
