import { existsSync } from "node:fs";
import { extname, join, relative } from "node:path";
import express, { type Router } from "express";
import { API_PREFIXES } from "./api-paths.js";

const NOT_CLIENT = [...API_PREFIXES, "/health", "/socket.io"];
const IMMUTABLE = "public, max-age=31536000, immutable";

const isServerPath = (path: string): boolean => NOT_CLIENT.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/**
 * Sirve el cliente construido (`client/dist`) desde el mismo servicio que la API: un solo origen. Devuelve `null` si
 * no hay cliente construido (desarrollo y pruebas), y entonces todo sigue como antes.
 * - Los archivos con hash de `/assets` se cachean para siempre; el resto (index.html, el icono) siempre se revalida.
 * - Una ruta que no es de la API ni es un archivo (`/perfil`, `/sala/ABC234`) devuelve `index.html`, para que React Router
 *   la resuelva. Un archivo que no existe (`/assets/viejo.js`) no: daría un HTML donde se esperaba JavaScript.
 * - Las rutas de la API, `/health` y `/socket.io` nunca llegan aquí.
 */
export function createClientApp(distDir: string): Router | null {
  const index = join(distDir, "index.html");
  if (!existsSync(index)) return null;

  const router = express.Router();
  router.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        const inAssets = relative(distDir, filePath).split(/[\\/]/)[0] === "assets";
        res.setHeader("Cache-Control", inAssets ? IMMUTABLE : "no-cache");
      },
    }),
  );
  router.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || isServerPath(req.path) || extname(req.path) !== "") return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(index);
  });
  return router;
}
