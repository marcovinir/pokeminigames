import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { answer, fact, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

/**
 * Genera las capturas del README (`docs/img/*.jpg`). No es una prueba: solo corre si se pide a propósito,
 *
 *   E2E_SCREENSHOTS=1 npm run e2e -w e2e -- screenshots
 *
 * Juega una partida entera de 3 rondas con dos personas y fotografía cada pantalla (1280 × 720, tema Clásico oscuro,
 * salvo la del tema Pokédex).
 */
test.skip(!process.env.E2E_SCREENSHOTS, "Solo para generar las capturas del README (E2E_SCREENSHOTS=1)");

const OUT = fileURLToPath(new URL("../../docs/img/", import.meta.url));
const VIEWPORT = { width: 1280, height: 720 };

async function useTheme(context: BrowserContext, theme: "clasico" | "pokedex", mode: "claro" | "oscuro"): Promise<void> {
  await context.addInitScript(
    ([value]) => localStorage.setItem("pokemon-minigames:theme", value as string),
    [JSON.stringify({ theme, mode })],
  );
}

/** Espera a que se carguen las tipografías y terminen las animaciones de entrada, y guarda la imagen. */
async function shoot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: "jpeg", quality: 82 });
}

test("captura las pantallas principales para el README", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  const visitor = await newPlayer(browser, "visitante");
  try {
    for (const player of [ash, misty, visitor]) {
      await player.page.setViewportSize(VIEWPORT);
      await useTheme(player.context, "clasico", "oscuro");
    }

    // Acceso: alguien que todavía no ha entrado.
    await visitor.page.goto("/login");
    await expect(visitor.page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await shoot(visitor.page, "login");

    await register(ash);
    await register(misty);
    await shoot(ash.page, "lobby");

    // Una partida de 3 rondas: Ash acierta siempre y Misty responde algo que no existe.
    await ash.page.getByRole("button", { name: "Crear sala" }).click();
    const code = ((await ash.page.getByLabel("Código de la sala").textContent()) ?? "").trim();
    await joinRoom(misty.page, code);

    for (let round = 1; round <= 3; round++) {
      const types = await roundTypes(ash.page);
      expect(await roundTypes(misty.page)).toEqual(types);
      const solution = validAnswerFor(types);

      if (round === 1) {
        // Ronda en juego, con el campo de respuesta a medio escribir y sus sugerencias.
        await ash.page.getByRole("combobox", { name: "Nombre del Pokémon" }).fill(solution.slice(0, 3));
        await expect(ash.page.getByRole("listbox", { name: "Sugerencias" })).toBeVisible();
        await shoot(ash.page, "ronda");
      }

      await answer(ash.page, solution);
      await answer(misty.page, "zzzzzz");

      if (round === 1) {
        // El resultado de la ronda, con el arte oficial del Pokémon ganado.
        await expect(ash.page.getByRole("heading", { name: "Resultado de la ronda 1" })).toBeVisible({ timeout: 30_000 });
        await ash.page.locator("section[data-result='VALID'] img").first().waitFor();
        await ash.page.waitForFunction(() => {
          const image = document.querySelector("section[data-result='VALID'] img") as HTMLImageElement | null;
          return image?.complete && image.naturalWidth > 0;
        });
        await shoot(ash.page, "resultado");
      }
    }

    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 40_000 });
    await ash.page.waitForFunction(() => [...document.images].every((image) => image.complete));
    await shoot(ash.page, "resumen");

    await ash.page.getByRole("link", { name: "Mi perfil" }).click();
    await expect(ash.page.getByRole("heading", { name: "Tu perfil" })).toBeVisible();
    await expect(fact(ash.page, "Partidas")).toHaveText("1");
    await ash.page.waitForFunction(() => [...document.images].every((image) => image.complete));
    await shoot(ash.page, "perfil");

    // El otro tema: Pokédex (claro), elegido desde el menú de apariencia (el del perfil manda al iniciar sesión).
    await ash.page.goto("/");
    await expect(ash.page.getByRole("heading", { name: "Lobby" })).toBeVisible();
    await ash.page.getByRole("button", { name: "Apariencia" }).click();
    await ash.page.getByText("Pokédex", { exact: true }).click();
    await ash.page.getByText("Claro", { exact: true }).click();
    await ash.page.keyboard.press("Escape");
    await expect(ash.page.locator("html")).toHaveAttribute("data-theme", "pokedex");
    await shoot(ash.page, "pokedex");
  } finally {
    await ash.context.close();
    await misty.context.close();
    await visitor.context.close();
  }
});
