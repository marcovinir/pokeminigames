import { Router } from "express";
import type { SilhouetteRegistry } from "../game/ports.js";
import { AppError } from "../http/errors.js";
import type { SilhouetteRenderer } from "./renderer.js";

export interface SilhouettesRouterDeps {
  registry: SilhouetteRegistry;
  renderer: SilhouetteRenderer;
}

/**
 * `GET /silhouettes/:token`: la silueta en negro de la ronda de ese token. Pública a propósito (la ve quien tenga la URL
 * de su ronda) y sin nada en la URL ni en la imagen que diga qué Pokémon es.
 */
export function createSilhouettesRouter({ registry, renderer }: SilhouettesRouterDeps): Router {
  const router = Router();
  router.get("/:token", async (req, res) => {
    const pokemonId = registry.lookup(req.params.token);
    if (pokemonId === undefined) throw new AppError(404, "SILHOUETTE_NOT_FOUND", "Esa silueta no existe");
    let png: Buffer;
    try {
      png = await renderer.render(pokemonId);
    } catch {
      throw new AppError(502, "SILHOUETTE_UNAVAILABLE", "No se pudo cargar la silueta");
    }
    res.type("png").set("Cache-Control", "private, max-age=3600").send(png);
  });
  return router;
}
