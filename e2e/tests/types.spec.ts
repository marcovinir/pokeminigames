import { type Page, expect, test } from "@playwright/test";
import { newPlayer, playAsGuest, register } from "../support/app";

/** Encabezado en una sola fila, nada fuera de la ventana y solo la tabla se desplaza de lado. */
async function expectFits(page: Page, where: string): Promise<void> {
  const width = page.viewportSize()!.width;
  await expect(page.getByRole("heading", { level: 1, name: "Matriz de Tipos" })).toBeVisible();
  const header = await page.locator("header").first().boundingBox();
  expect(header!.height, `${where}: encabezado`).toBeLessThanOrEqual(72);
  for (const target of [page.getByRole("button", { name: "Menú", exact: true }), page.getByRole("combobox", { name: "Tipo 2" }), page.getByRole("region", { name: "Tabla de efectividad de tipos" })]) {
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
    await visitor.page.getByRole("link", { name: "Matriz de Tipos" }).click();
    await visitor.page.getByRole("combobox", { name: "Tipo 1" }).selectOption("fire");
    await visitor.page.getByRole("combobox", { name: "Tipo 2" }).selectOption("flying");
    await expect(visitor.page).toHaveURL(/\/tipos\?tipo1=fire&tipo2=flying$/);
    await expect(visitor.page.getByRole("heading", { name: "Daño que recibe" })).toBeVisible();
    await visitor.page.reload();
    await expect(visitor.page.getByRole("combobox", { name: "Tipo 2" })).toHaveValue("flying");
    await expect(visitor.page.getByRole("group", { name: "×4" }).getByText("roca")).toBeVisible();
    await visitor.page.getByRole("link", { name: "Entrar a jugar" }).click();
    await expect(visitor.page).toHaveURL(/\/login$/);
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

const WIDTHS = [320, 360, 375, 414, 640, 700, 768, 900, 1024, 1280];

/** Lo que más a la derecha queda del encabezado, por si la fila se parte o algo se sale sin ensanchar el documento. */
async function expectHeaderFits(page: Page, where: string): Promise<void> {
  const { scroll, client, right } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    right: Math.max(...[...document.querySelectorAll("header a, header button")].map((element) => element.getBoundingClientRect().right)),
  }));
  expect.soft(scroll, where + ": ancho de la página").toBe(client);
  expect.soft(right, where + ": lo último del encabezado").toBeLessThanOrEqual(client);
}

for (const theme of ["clasico", "pokedex"]) {
  test(`el encabezado cabe en todos los anchos con el tema ${theme}, sin sesión, como invitado y con cuenta`, async ({ browser }) => {
    test.setTimeout(120_000);
    const visitor = await newPlayer(browser, "visita");
    const account = await newPlayer(browser, "c".repeat(24));
    const guest = await playAsGuest(browser, "d".repeat(24));
    try {
      await register(account);
      for (const [page, who] of [[visitor.page, "sin sesión"], [guest.page, "invitado"], [account.page, "cuenta"]] as const) {
        await page.goto("/tipos");
        await page.evaluate((name) => localStorage.setItem("pokemon-minigames:theme", JSON.stringify({ theme: name, mode: "claro" })), theme);
        await page.reload();
        await expect(page.getByRole("heading", { level: 1, name: "Matriz de Tipos" })).toBeVisible();
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 740 });
          await expectHeaderFits(page, `${theme}, ${who}, ${width} px`);
        }
      }
    } finally {
      await visitor.context.close();
      await account.context.close();
      await guest.context.close();
    }
  });
}

for (const width of [360, 375]) {
  test(`a ${width} px el menú entra en la ventana y se llega a la Matriz de Tipos`, async ({ browser }) => {
    const visitor = await newPlayer(browser, "visita");
    try {
      await visitor.page.setViewportSize({ width, height: 560 });
      await visitor.page.goto("/login");
      await expect(visitor.page.getByRole("link", { name: "Matriz de Tipos" })).toHaveCount(0);
      await visitor.page.getByRole("button", { name: "Menú", exact: true }).click();
      const panel = visitor.page.getByRole("region", { name: "Menú", exact: true });
      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(560);
      await panel.getByRole("link", { name: "Iniciar sesión" }).scrollIntoViewIfNeeded();
      await expect(panel.getByRole("link", { name: "Iniciar sesión" })).toBeInViewport();
      await panel.getByRole("link", { name: "Matriz de Tipos" }).click();
      await expect(visitor.page).toHaveURL(/\/tipos$/);
      await expect(panel).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });
}
