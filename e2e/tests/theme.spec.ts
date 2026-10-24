import { expect, test } from "@playwright/test";
import { PASSWORD, logIn, newPlayer, register } from "../support/app";

test("el tema guardado en el perfil se aplica en un navegador nuevo tras iniciar sesión", async ({ browser }) => {
  const first = await newPlayer(browser, "tema");
  const second = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": first.ip } });
  try {
    await register(first);
    // El tema y el modo se eligen desde el menú de apariencia del encabezado (botones segmentados).
    await first.page.getByRole("button", { name: "Apariencia" }).click();
    const saved = first.page.waitForResponse((r) => r.url().endsWith("/auth/me/preferences") && r.request().method() === "PUT");
    await first.page.getByText("Pokédex", { exact: true }).click();
    await saved;
    const savedMode = first.page.waitForResponse((r) => r.url().endsWith("/auth/me/preferences") && r.request().method() === "PUT");
    await first.page.getByText("Oscuro", { exact: true }).click();
    expect((await savedMode).status()).toBe(200);

    // Otro navegador (sin nada guardado): al iniciar sesión se aplica la preferencia del perfil.
    const page = await second.newPage();
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "clasico");
    await logIn(page, first.email, PASSWORD);
    await expect(page.getByRole("heading", { name: "¿A qué jugamos?" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "pokedex");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "oscuro");
    await page.getByRole("button", { name: "Apariencia" }).click();
    await expect(page.getByRole("radio", { name: "Pokédex" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Oscuro" })).toBeChecked();
  } finally {
    await first.context.close();
    await second.close();
  }
});
