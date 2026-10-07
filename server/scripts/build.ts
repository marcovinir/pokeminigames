import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
};

/**
 * Todo lo que se instala desde npm queda fuera del archivo (en el despliegue ya está en node_modules), salvo el paquete
 * compartido: su código es TypeScript (`shared/` exporta sus .ts) y tiene que ir dentro.
 */
export const EXTERNAL = Object.keys(pkg.dependencies).filter((name) => name !== "@pokemon-minigames/shared");

/** Empaqueta el servidor en un solo archivo ejecutable con `node` (arranca más rápido y gasta menos memoria que `tsx`). */
export async function buildServer(options: { outfile?: string } = {}): Promise<string> {
  const outfile = options.outfile ?? fileURLToPath(new URL("../dist/index.js", import.meta.url));
  await build({
    entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    outfile,
    external: EXTERNAL,
    sourcemap: true,
    logLevel: "warning",
  });
  return outfile;
}

if (import.meta.filename === process.argv[1]) {
  const outfile = await buildServer();
  console.log(`Servidor empaquetado en ${outfile}`);
}
