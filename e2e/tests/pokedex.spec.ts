import { type Page, expect, test } from "@playwright/test";
import { newPlayer } from "../support/app";

async function expectNoSideScroll(page: Page, where: string): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect.soft(scroll, `${where}: ancho de la página`).toBe(client);
}

test("sin sesión: buscar, filtrar por dos tipos, abrir la ficha y volver con los filtros", async ({ browser }) => {
  const visitor = await newPlayer(browser, "visita");
  const { page } = visitor;
  try {
    await page.goto("/login");
    await page.getByRole("link", { name: "Pokédex" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Pokédex" })).toBeVisible();

    await page.getByRole("searchbox", { name: "Buscar" }).fill("charizard");
    await expect(page.getByRole("list", { name: "Pokémon" }).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Buscar" }).fill("");

    await page.getByRole("combobox", { name: "Tipo 1" }).selectOption("fire");
    await page.getByRole("combobox", { name: "Tipo 2" }).selectOption("flying");
    await expect(page).toHaveURL(/\/pokedex\?tipo1=fire&tipo2=flying$/);
    const list = page.getByRole("list", { name: "Pokémon" });
    for (const name of ["Charizard", "Moltres", "Ho-Oh"]) await expect(list.getByRole("link", { name: new RegExp(name) })).toBeVisible();

    await list.getByRole("link", { name: /Charizard/ }).click();
    await expect(page).toHaveURL(/\/pokedex\/6$/);
    await expect(page.getByRole("heading", { level: 1, name: "Charizard" })).toBeVisible();
    await expect(page.getByRole("group", { name: "×4" }).getByText("roca")).toBeVisible();
    await expect(page.getByRole("region", { name: "Evoluciones" }).getByRole("link", { name: "Charmander" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/pokedex\?tipo1=fire&tipo2=flying$/);
    await expect(page.getByRole("combobox", { name: "Tipo 2" })).toHaveValue("flying");

    // Recargar una ficha funciona: la dirección es de la página, no de la API.
    await page.goto("/pokedex/6");
    await expect(page.getByRole("heading", { level: 1, name: "Charizard" })).toBeVisible();
    await page.goto("/pokedex/9999");
    await expect(page.getByText("Ese Pokémon no existe.")).toBeVisible();
  } finally {
    await visitor.context.close();
  }
});

test("desde la Matriz de Tipos se llega a esos Pokémon en la Pokédex", async ({ browser }) => {
  const visitor = await newPlayer(browser, "visita");
  try {
    await visitor.page.goto("/tipos?tipo1=fire&tipo2=flying");
    await visitor.page.getByRole("link", { name: "Ver estos Pokémon en la Pokédex" }).click();
    await expect(visitor.page.getByRole("list", { name: "Pokémon" }).getByRole("link", { name: /Moltres/ })).toBeVisible();
  } finally {
    await visitor.context.close();
  }
});

for (const theme of ["clasico", "pokedex"]) {
  for (const width of [360, 375]) {
    test(`a ${width} px en ${theme} caben la lista y las fichas, también la de más ramas y el nombre más largo`, async ({ browser }) => {
      const visitor = await newPlayer(browser, "visita");
      const { page } = visitor;
      try {
        await page.setViewportSize({ width, height: 740 });
        await page.goto("/pokedex");
        await page.evaluate((name) => localStorage.setItem("pokemon-minigames:theme", JSON.stringify({ theme: name, mode: "claro" })), theme);
        await page.reload();
        await expect(page.getByRole("list", { name: "Pokémon" }).getByRole("listitem").first()).toBeVisible();
        await expectNoSideScroll(page, `${theme}, ${width} px, lista`);
        // Eevee (8 ramas), Crabominable (el nombre más largo) y Wurmple (cadena con ramas de varias etapas).
        for (const id of [133, 740, 265]) {
          await page.goto(`/pokedex/${id}`);
          await expect(page.getByRole("region", { name: "Evoluciones" })).toBeVisible();
          await expectNoSideScroll(page, `${theme}, ${width} px, #${id}`);
          for (const link of await page.getByRole("region", { name: "Evoluciones" }).getByRole("link").all()) {
            const box = await link.boundingBox();
            expect.soft(box!.x, `#${id}`).toBeGreaterThanOrEqual(0);
            expect.soft(box!.x + box!.width, `#${id}`).toBeLessThanOrEqual(width);
          }
        }
      } finally {
        await visitor.context.close();
      }
    });
  }
}

test("en el teléfono, los filtros plegados dejan ver las primeras tarjetas y se despliegan al tocar", async ({ browser }) => {
  const visitor = await newPlayer(browser, "visita");
  const { page } = visitor;
  try {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto("/pokedex");
    const firstTile = page.getByRole("list", { name: "Pokémon" }).getByRole("listitem").first();
    await expect(firstTile).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Tipo 1" })).toBeHidden();
    const box = await firstTile.boundingBox();
    expect(box!.y).toBeLessThan(740);
    await page.getByRole("button", { name: /^Filtros/ }).click();
    await page.getByRole("combobox", { name: "Tipo 1" }).selectOption("fire");
    await expect(page.getByRole("button", { name: "Filtros (1)" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole("button", { name: /^Filtros/ })).toBeHidden();
    await expect(page.getByRole("combobox", { name: "Tipo 1" })).toBeVisible();
  } finally {
    await visitor.context.close();
  }
});

test("a 360 px la tabla de la Matriz mantiene los nombres de las columnas al bajar", async ({ browser }) => {
  const visitor = await newPlayer(browser, "visita");
  const { page } = visitor;
  try {
    await page.setViewportSize({ width: 360, height: 500 });
    await page.goto("/tipos");
    const box = page.getByRole("region", { name: "Tabla de efectividad de tipos" });
    const header = box.getByRole("columnheader").nth(1);
    await box.evaluate((element) => { element.scrollTop = 200; });
    const [boxArea, headerArea] = [await box.boundingBox(), await header.boundingBox()];
    expect(Math.abs(headerArea!.y - boxArea!.y)).toBeLessThan(2);
  } finally {
    await visitor.context.close();
  }
});
