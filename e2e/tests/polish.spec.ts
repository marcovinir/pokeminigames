import { type Locator, type Page, expect, test } from "@playwright/test";
import { answer, createRoom, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

/**
 * Etapa 8 en un navegador de verdad: iconos oficiales de tipo, sugerencias con imagen (y tipos solo con la opción de la
 * sala), el ejemplo tras una ronda sin acierto y el equipo del rival. Las imágenes vienen de GitHub (PokeAPI): aquí se
 * comprueban sus direcciones, no que la red del equipo las descargue.
 */

const TYPE_ICON = /\/sprites\/types\/generation-ix\/scarlet-violet\/(\d+)\.png$/;

/** Escribe en el campo de respuesta (sin enviar) y devuelve la lista de sugerencias. */
async function suggestionsFor(page: Page, text: string): Promise<Locator> {
  const field = page.getByRole("combobox", { name: "Nombre del Pokémon" });
  await field.fill(text);
  const options = page.getByRole("listbox", { name: "Sugerencias" }).getByRole("option");
  await expect(options.first()).toBeVisible();
  return options;
}

test("el selector de tipo muestra los 18 iconos oficiales, cada uno con su nombre", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    const code = await createRoom(ash.page, { chosenTypes: true });
    await joinRoom(misty.page, code);

    for (const { page } of [ash, misty]) {
      await expect(page.getByRole("heading", { name: "Elige un tipo" })).toBeVisible({ timeout: 30_000 });
      const buttons = page.getByRole("group", { name: "Tipos" }).getByRole("button");
      await expect(buttons).toHaveCount(18);
      const numbers = await buttons.evaluateAll((all) =>
        all.map((button) => button.querySelector("img")?.getAttribute("src") ?? ""),
      );
      // Un icono por botón, del 1 al 18 y en el orden de los tipos de PokeAPI.
      expect(numbers.map((src) => Number(TYPE_ICON.exec(src)?.[1]))).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
      // La imagen de PokeAPI es una píldora ancha (200 × 40): se recorta a un círculo de 24 px con su símbolo.
      const boxes = await buttons.evaluateAll((all) =>
        all.map((button) => {
          const box = button.querySelector("img")!.parentElement!;
          const { width, height } = box.getBoundingClientRect();
          const style = getComputedStyle(box);
          return { w: Math.round(width), h: Math.round(height), clip: style.overflow, round: parseFloat(style.borderTopLeftRadius) >= 12 };
        }),
      );
      for (const box of boxes) expect(box).toEqual({ w: 24, h: 24, clip: "hidden", round: true });
      // El icono es decorativo: el botón se sigue llamando como el tipo.
      await expect(page.getByRole("group", { name: "Tipos" }).getByRole("button", { name: "fuego" })).toBeVisible();
    }
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

// Opt-in (necesita red): vigila la suposición que justifica el recorte, que PokeAPI siga sirviendo las 18 píldoras de 200 × 40.
test("los 18 iconos reales de PokeAPI existen y son píldoras de 200 × 40", async ({ page }) => {
  test.skip(!process.env.E2E_REAL_IMAGES, "solo con E2E_REAL_IMAGES=1 (usa la red)");
  await page.goto("/login");
  const sizes = await page.evaluate(async () => {
    const base = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet";
    const load = (n: number) =>
      new Promise<string>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(`${image.naturalWidth}x${image.naturalHeight}`);
        image.onerror = () => resolve("error");
        image.src = `${base}/${n}.png`;
      });
    return Promise.all(Array.from({ length: 18 }, (_, i) => load(i + 1)));
  });
  expect(sizes).toEqual(Array(18).fill("200x40"));
});

test("una ronda que nadie acierta, o solo una persona, muestra un Pokémon que servía; y el rival ve el equipo", async ({
  browser,
}) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    const code = await createRoom(ash.page, { rounds: 2 });
    await joinRoom(misty.page, code);

    const types = await roundTypes(ash.page);
    await roundTypes(misty.page);
    // Ash acierta, Misty no: acertó una sola persona, así que hay ejemplo.
    await answer(ash.page, validAnswerFor(types));
    await answer(misty.page, "zzzzzz");

    for (const { page } of [ash, misty]) {
      const example = page.getByRole("region", { name: /^Un Pokémon que servía: / });
      await expect(example).toBeVisible({ timeout: 30_000 });
      const typesShown = await example.locator("[data-type]").evaluateAll((chips) => chips.map((chip) => (chip as HTMLElement).dataset.type));
      // Tiene los dos tipos del par (en cualquier orden).
      expect([...typesShown].sort()).toEqual([...types].sort());
    }

    // En la ronda siguiente el panel de Misty ya lista el Pokémon que ganó Ash: equipo del rival visible.
    await expect(misty.page.getByRole("heading", { name: "Ronda 2 de 2" })).toBeVisible({ timeout: 30_000 });
    const rivalPanel = misty.page.getByRole("region", { name: "Tu rival" });
    await expect(rivalPanel.getByRole("listitem")).toHaveCount(1);
    await expect(rivalPanel).toContainText("1 Pokémon");
    const revealed = (await rivalPanel.getByRole("listitem").first().textContent()) ?? "";

    // Y se conserva al recargar: llega en el estado de la sala.
    await misty.page.reload();
    const afterReload = misty.page.getByRole("region", { name: "Tu rival" });
    await expect(afterReload.getByRole("listitem")).toHaveCount(1);
    await expect(afterReload.getByRole("listitem").first()).toHaveText(revealed);

    // Ash no ve el equipo de Misty (no ganó ninguno): solo el aviso.
    await expect(ash.page.getByRole("region", { name: "Tu rival" })).toContainText("Se revelan al cerrar cada ronda.");
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("una ronda en la que aciertan los dos no muestra ejemplo", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    const code = await createRoom(ash.page, { rounds: 2 });
    await joinRoom(misty.page, code);

    const types = await roundTypes(ash.page);
    await roundTypes(misty.page);
    // Los dos aciertan, cada uno con un Pokémon distinto del par (si nombraran el mismo, solo el primero se lo queda).
    await answer(ash.page, validAnswerFor(types));
    await answer(misty.page, validAnswerFor(types, 1));

    await expect(ash.page.getByRole("heading", { name: /Resultado de la ronda 1/ })).toBeVisible({ timeout: 30_000 });
    await expect(ash.page.getByRole("region", { name: "Resultado de Tú" })).toHaveAttribute("data-result", "VALID");
    await expect(ash.page.getByRole("region", { name: /^Resultado de misty/ })).toHaveAttribute("data-result", "VALID");
    await expect(ash.page.getByRole("region", { name: /^Un Pokémon que servía/ })).toHaveCount(0);
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("con «Pistas de tipos» las sugerencias muestran tipos y la lista con tipos se pide; sin ellas, ni viajan", async ({
  browser,
}) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  const typedRequests: string[] = [];
  for (const { page } of [ash, misty]) {
    page.on("request", (request) => {
      if (request.url().includes("/pokemon/names") && request.url().includes("types=1")) typedRequests.push(request.url());
    });
  }
  try {
    await register(ash);
    await register(misty);
    const code = await createRoom(ash.page, { rounds: 1, typeHints: true });
    // La sala de espera muestra la insignia junto al resto de la configuración.
    await expect(ash.page.getByLabel("Configuración de la sala")).toContainText("Pistas de tipos");
    await joinRoom(misty.page, code);

    await roundTypes(ash.page);
    await roundTypes(misty.page);
    for (const { page } of [ash, misty]) {
      const options = await suggestionsFor(page, "pi");
      await expect(options.first().locator("[data-type]").first()).toBeVisible();
      // Cada fila lleva su imagen (o la de respaldo), el número de Pokédex y mide al menos 44 px.
      await expect(options.first().locator("[data-state]")).toHaveCount(1);
      await expect(options.first()).toContainText("#");
      const box = await options.first().boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(typedRequests.length).toBeGreaterThan(0);
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("sin «Pistas de tipos» las sugerencias llevan imagen y número, pero ningún tipo, y nunca se pide la lista con tipos", async ({
  browser,
}) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  const typedRequests: string[] = [];
  for (const { page } of [ash, misty]) {
    page.on("request", (request) => {
      if (request.url().includes("/pokemon/names") && request.url().includes("types=1")) typedRequests.push(request.url());
    });
  }
  try {
    await register(ash);
    await register(misty);
    const code = await createRoom(ash.page, { rounds: 1 });
    await expect(ash.page.getByLabel("Configuración de la sala")).not.toContainText("Pistas de tipos");
    await joinRoom(misty.page, code);

    await roundTypes(ash.page);
    await roundTypes(misty.page);
    for (const { page } of [ash, misty]) {
      const options = await suggestionsFor(page, "pi");
      await expect(options.first().locator("[data-state]")).toHaveCount(1);
      await expect(options.first()).toContainText("#");
      expect(await options.locator("[data-type]").count()).toBe(0);
    }
    expect(typedRequests).toEqual([]);
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("a 375 px las sugerencias con tipos caben a lo ancho, con el nombre y los chips legibles", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    const code = await createRoom(ash.page, { rounds: 1, typeHints: true });
    await joinRoom(misty.page, code);
    await ash.page.setViewportSize({ width: 375, height: 667 });

    await roundTypes(ash.page);
    const options = await suggestionsFor(ash.page, "a");
    const list = ash.page.getByRole("listbox", { name: "Sugerencias" });
    await list.scrollIntoViewIfNeeded();
    const listBox = (await list.boundingBox())!;
    expect(listBox.x).toBeGreaterThanOrEqual(-0.5);
    expect(listBox.x + listBox.width).toBeLessThanOrEqual(375.5);
    expect(await options.count()).toBeLessThanOrEqual(6);

    // Ninguna fila de la lista queda tapada por otro elemento (por ejemplo el panel del rival, que debajo de la arena
    // se pintaba encima): en el centro de cada fila lo que hay encima es la propia fila.
    for (const row of await options.all()) {
      await row.scrollIntoViewIfNeeded();
      const onTop = await row.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return top !== null && element.contains(top);
      });
      expect(onTop, "una fila de las sugerencias queda tapada por otro elemento").toBe(true);
    }

    // Nada se sale de su fila por la derecha y la página no se desplaza en horizontal.
    for (const row of await options.all()) {
      const rowBox = (await row.boundingBox())!;
      for (const chip of await row.locator("[data-type]").all()) {
        const chipBox = (await chip.boundingBox())!;
        expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
      }
    }
    const { scroll, client } = await ash.page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client);
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});
