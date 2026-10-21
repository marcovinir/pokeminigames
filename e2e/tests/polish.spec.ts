import { type Page, expect, test } from "@playwright/test";
import { answer, createRoom, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

/**
 * Etapa 8 en un navegador de verdad: iconos oficiales de tipo, sugerencias con imagen (y tipos solo con la opción de la
 * sala), el ejemplo tras una ronda sin acierto y el equipo del rival. Las imágenes vienen de GitHub (PokeAPI): aquí se
 * comprueban sus direcciones, no que la red del equipo las descargue.
 */

const TYPE_ICON = /\/sprites\/types\/generation-ix\/scarlet-violet\/(\d+)\.png$/;

interface SuggestionRow {
  text: string;
  /** Cuántas imágenes del Pokémon (o su respaldo) lleva la fila. */
  arts: number;
  types: string[];
  height: number;
  /** Los chips caben dentro de la fila (nada se sale por la derecha). */
  chipsInside: boolean;
  /** En el centro de la fila lo que se ve encima es la propia fila (nada la tapa). */
  onTop: boolean;
}

interface SuggestionsReading {
  rows: SuggestionRow[];
  list: { left: number; right: number };
  page: { scrollWidth: number; clientWidth: number };
}

/**
 * Escribe en el campo de respuesta (sin enviar) y lee la lista de sugerencias DE UNA SOLA VEZ. La ronda dura 15 s: ir
 * fila por fila, con una espera por cada dato, la agotaba en un equipo lento (o con la batería) y la lista desaparecía a
 * mitad de la comprobación.
 */
async function readSuggestions(page: Page, text: string): Promise<SuggestionsReading> {
  await page.getByRole("combobox", { name: "Nombre del Pokémon" }).fill(text);
  return page.getByRole("listbox", { name: "Sugerencias" }).evaluate((list) => {
    const rows = [...list.querySelectorAll("[role=option]")].map((row) => {
      row.scrollIntoView({ block: "nearest" });
      const box = row.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      const chips = [...row.querySelectorAll("[data-type]")];
      return {
        text: row.textContent ?? "",
        arts: row.querySelectorAll("[data-state]").length,
        types: chips.map((chip) => (chip as HTMLElement).dataset.type ?? ""),
        height: box.height,
        chipsInside: chips.every((chip) => chip.getBoundingClientRect().right <= box.right + 0.5),
        onTop: top !== null && row.contains(top),
      };
    });
    const box = list.getBoundingClientRect();
    return {
      rows,
      list: { left: box.left, right: box.right },
      page: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    };
  });
}

test("el selector de tipo muestra los 18 iconos oficiales, cada uno con su nombre", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    const code = await createRoom(ash.page, { chosenTypes: true });
    await joinRoom(misty.page, code);

    // Las dos pantallas a la vez y con una sola lectura cada una: «Elegir tipo» dura 15 s y, en un equipo lento (o en CI),
    // comprobar una pantalla tras otra dejaba que se acabara el plazo de la segunda.
    await Promise.all(
      [ash, misty].map(async ({ page }) => {
        await expect(page.getByRole("heading", { name: "Elige un tipo" })).toBeVisible({ timeout: 30_000 });
        const tiles = await page.getByRole("group", { name: "Tipos" }).evaluate((group) =>
          [...group.querySelectorAll("button")].map((button) => {
            const image = button.querySelector("img");
            const box = image?.parentElement;
            const rect = box?.getBoundingClientRect();
            const style = box ? getComputedStyle(box) : null;
            return {
              name: button.textContent?.trim() ?? "",
              src: image?.getAttribute("src") ?? "",
              w: Math.round(rect?.width ?? 0),
              h: Math.round(rect?.height ?? 0),
              clip: style?.overflow,
              round: parseFloat(style?.borderTopLeftRadius ?? "0") >= 12,
            };
          }),
        );
        expect(tiles).toHaveLength(18);
        // Un icono por botón, del 1 al 18 y en el orden de los tipos de PokeAPI.
        expect(tiles.map((tile) => Number(TYPE_ICON.exec(tile.src)?.[1]))).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
        // La imagen de PokeAPI es una píldora ancha (200 × 40): se recorta a un círculo de 24 px con su símbolo.
        for (const tile of tiles) expect({ w: tile.w, h: tile.h, clip: tile.clip, round: tile.round }).toEqual({ w: 24, h: 24, clip: "hidden", round: true });
        // El icono es decorativo: el botón se sigue llamando como el tipo.
        expect(tiles.map((tile) => tile.name)).toContain("fuego");
      }),
    );
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

    // El resultado solo dura 6 s: las dos pantallas a la vez y la lectura de una sola vez (esperar a que sea visible y
    // leerlo después dejaba, en un equipo lento, que la pantalla ya hubiera pasado a la ronda siguiente).
    const shown = await Promise.all(
      [ash, misty].map(({ page }) =>
        page
          .getByRole("region", { name: /^Un Pokémon que servía: / })
          .evaluate((region) => [...region.querySelectorAll("[data-type]")].map((chip) => (chip as HTMLElement).dataset.type), undefined, { timeout: 30_000 }),
      ),
    );
    // Tiene los dos tipos del par (en cualquier orden).
    for (const typesShown of shown) expect([...typesShown].sort()).toEqual([...types].sort());

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

    // Una sola lectura de la pantalla de resultado (dura 6 s): quién acertó y si hay tarjeta de ejemplo.
    const result = await ash.page
      .getByRole("heading", { name: /Resultado de la ronda 1/ })
      .evaluate(
        () => ({
          verdicts: [...document.querySelectorAll("section[data-result]")].map((card) => card.getAttribute("data-result")),
          examples: document.querySelectorAll("section[aria-label^='Un Pokémon que servía']").length,
        }),
        undefined,
        { timeout: 30_000 },
      );
    expect(result).toEqual({ verdicts: ["VALID", "VALID"], examples: 0 });
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
    const readings = await Promise.all([ash, misty].map(({ page }) => readSuggestions(page, "pi")));
    for (const { rows } of readings) {
      expect(rows.length).toBeGreaterThan(0);
      // Cada fila lleva sus tipos, su imagen (o la de respaldo), el número de Pokédex y mide al menos 44 px.
      expect(rows[0]!.types.length).toBeGreaterThan(0);
      expect(rows[0]!.arts).toBe(1);
      expect(rows[0]!.text).toContain("#");
      expect(rows[0]!.height).toBeGreaterThanOrEqual(44);
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
    const readings = await Promise.all([ash, misty].map(({ page }) => readSuggestions(page, "pi")));
    for (const { rows } of readings) {
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.arts).toBe(1);
        expect(row.text).toContain("#");
        expect(row.types).toEqual([]);
      }
    }
    expect(typedRequests).toEqual([]);
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("a 375 px las sugerencias con tipos caben a lo ancho, sin que nada las tape ni se salga", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    const code = await createRoom(ash.page, { rounds: 1, typeHints: true });
    await joinRoom(misty.page, code);
    await ash.page.setViewportSize({ width: 375, height: 667 });

    await roundTypes(ash.page);
    const { rows, list, page } = await readSuggestions(ash.page, "a");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(6);
    expect(list.left).toBeGreaterThanOrEqual(-0.5);
    expect(list.right).toBeLessThanOrEqual(375.5);
    // Ninguna fila queda tapada por otro elemento (por ejemplo el panel del rival, que debajo de la arena se pintaba
    // encima), ningún chip se sale de su fila y la página no se desplaza en horizontal.
    for (const row of rows) {
      expect(row.onTop, "una fila de las sugerencias queda tapada por otro elemento").toBe(true);
      expect(row.chipsInside, "un chip se sale de su fila").toBe(true);
    }
    expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});
