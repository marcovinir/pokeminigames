import { type Page, expect, test } from "@playwright/test";
import { newPlayer, playAsGuest, register } from "../support/app";

/** Encabezado en una sola fila, nada fuera de la ventana y solo la tabla se desplaza de lado. */
async function expectFits(page: Page, where: string): Promise<void> {
  const width = page.viewportSize()!.width;
  await expect(page.getByRole("heading", { level: 1, name: "Tabla de tipos" })).toBeVisible();
  const header = await page.locator("header").first().boundingBox();
  expect(header!.height, `${where}: encabezado`).toBeLessThanOrEqual(72);
  for (const target of [page.getByRole("link", { name: "Tipos" }), page.getByRole("combobox", { name: "Tipo 2" }), page.getByRole("region", { name: "Tabla de efectividad de tipos" })]) {
    const box = await target.boundingBox();
    expect(box!.x, where).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, where).toBeLessThanOrEqual(width);
  }
  const sizes = await page.evaluate(() => {
    const box = document.querySelector('[role="region"][aria-label="Tabla de efectividad de tipos"]')!;
    return { page: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, box: box.scrollWidth, boxClient: box.clientWidth };
  });
  expect(sizes.page, `${where}: la página no se desplaza de lado`).toBe(sizes.client);
  expect(sizes.box, `${where}: la tabla sí`).toBeGreaterThan(sizes.boxClient);
}

test("sin sesión se abre desde el encabezado, se elige una combinación y recargar la conserva", async ({ browser }) => {
  const visitor = await newPlayer(browser, "visita");
  try {
    await visitor.page.goto("/login");
    await visitor.page.getByRole("link", { name: "Tipos" }).click();
    await visitor.page.getByRole("combobox", { name: "Tipo 1" }).selectOption("fire");
    await visitor.page.getByRole("combobox", { name: "Tipo 2" }).selectOption("flying");
    await expect(visitor.page).toHaveURL(/\/tipos\?tipo1=fire&tipo2=flying$/);
    await expect(visitor.page.getByRole("heading", { name: "Daño que recibe" })).toBeVisible();
    await visitor.page.reload();
    await expect(visitor.page.getByRole("combobox", { name: "Tipo 2" })).toHaveValue("flying");
    await expect(visitor.page.getByRole("group", { name: "×4" }).getByText("roca")).toBeVisible();
  } finally {
    await visitor.context.close();
  }
});

for (const width of [360, 375]) {
  test(`a ${width} px cabe todo con un nombre de 30 letras, como cuenta y como invitado`, async ({ browser }) => {
    const account = await newPlayer(browser, "a".repeat(24));
    const guest = await playAsGuest(browser, "b".repeat(24));
    try {
      await register(account);
      for (const [page, who] of [[account.page, "cuenta"], [guest.page, "invitado"]] as const) {
        await page.setViewportSize({ width, height: 740 });
        await page.goto("/tipos?tipo1=fire&tipo2=flying");
        await expectFits(page, `${width} px, ${who}`);
      }
    } finally {
      await account.context.close();
      await guest.context.close();
    }
  });
}
