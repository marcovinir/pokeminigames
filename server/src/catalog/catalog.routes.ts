import { Router } from "express";
import type { PokemonCatalog } from "./pokemon-catalog.js";

export interface CatalogRouterDeps {
  catalog: PokemonCatalog;
}

/** Datos públicos del catálogo. No requiere sesión: es solo la lista de nombres. */
export function createCatalogRouter({ catalog }: CatalogRouterDeps): Router {
  const router = Router();
  // El catálogo no cambia mientras el servidor está en marcha: se arma una sola vez.
  const names = catalog.names();

  router.get("/names", (_req, res) => {
    res.set("Cache-Control", "public, max-age=86400").json(names);
  });

  return router;
}
