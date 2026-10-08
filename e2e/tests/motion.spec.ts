import { type Page, expect, test } from "@playwright/test";
import { newPlayer } from "../support/app";

/**
 * «Reducir movimiento» se mide en un navegador de verdad. Una sola regla global lo apaga todo: ni las animaciones de
 * entrada duran, ni esperan su turno (si no, las tarjetas escalonadas seguirían invisibles hasta que les llegara).
 */
async function timings(page: Page): Promise<{ delay: string; duration: string }[]> {
  return page.locator(".animate-rise").evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return { delay: style.animationDelay, duration: style.animationDuration };
    }),
  );
}

test("las pantallas entran escalonadas, y con «reducir movimiento» ya no esperan ni duran", async ({ browser }) => {
  const visitor = await newPlayer(browser, "calma");
  try {
    const page = visitor.page;
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();

    // Sin la preferencia: el lema entra primero y el formulario 60 ms después (--i = 1).
    const normal = await timings(page);
    expect(normal.map((t) => t.delay)).toEqual(expect.arrayContaining(["0s", "0.06s"]));
    expect(normal.every((t) => t.duration === "0.22s")).toBe(true);

    // Con la preferencia: nada espera y todo dura un instante.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const calm = await timings(page);
    expect(calm.length).toBeGreaterThan(0);
    for (const t of calm) {
      expect(t.delay).toBe("0s");
      expect(Number.parseFloat(t.duration)).toBeLessThan(0.001);
    }
  } finally {
    await visitor.context.close();
  }
});
