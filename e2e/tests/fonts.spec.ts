import { expect, test } from "@playwright/test";
import { newPlayer } from "../support/app";

/**
 * Las tipografías se declaran a mano (solo latino y latino extendido) apuntando a los archivos del paquete: si Vite no
 * los resolviera, la página saldría con la letra del sistema y ninguna prueba de clases lo notaría.
 */
test("las tipografías salen del propio servidor y solo se descargan las del alfabeto latino", async ({ browser }) => {
  const visitor = await newPlayer(browser, "letras");
  try {
    const fonts: string[] = [];
    visitor.page.on("request", (request) => {
      if (request.resourceType() === "font") fonts.push(request.url());
    });
    await visitor.page.goto("/login");
    await expect(visitor.page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await visitor.page.evaluate(() => document.fonts.ready);

    expect(fonts.length, "no se pidió ninguna tipografía").toBeGreaterThan(0);
    const origin = new URL(visitor.page.url()).origin;
    for (const url of fonts) {
      expect(new URL(url).origin, url).toBe(origin);
      expect(url, url).toMatch(/-latin(?:-ext)?-wght-normal-[\w-]+\.woff2$/);
    }

    // Clásico usa Fredoka (títulos y números) y Nunito (texto): las dos quedan cargadas, no solo declaradas.
    const loaded = await visitor.page.evaluate(() => [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family));
    expect(loaded.join(" ")).toContain("Fredoka Variable");
    expect(loaded.join(" ")).toContain("Nunito Variable");
  } finally {
    await visitor.context.close();
  }
});
