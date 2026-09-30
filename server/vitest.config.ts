import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

function loadTestEnv(): Record<string, string> {
  try {
    return parse(readFileSync(new URL("./.env.test", import.meta.url)));
  } catch {
    throw new Error(
      "Falta server/.env.test. Cópialo desde server/.env.test.example y ajusta la contraseña de PostgreSQL.",
    );
  }
}

export default defineConfig({
  test: {
    // Las pruebas usan su propia base de datos (.env.test), nunca la de desarrollo.
    env: loadTestEnv(),
    globalSetup: ["./test/global-setup.ts"],
    // Todas las pruebas comparten una base de datos: los archivos corren de uno en uno.
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
  },
});
