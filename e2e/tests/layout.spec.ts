import { type Locator, type Page, expect, test } from "@playwright/test";
import { answer, createRoomWithRounds, fact, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

/**
 * El diseño se mide en un navegador de verdad: jsdom no calcula tamaños y las pruebas de clases no ven que el menú de
 * apariencia se salga por la izquierda. Se usan nombres de usuario de 30 letras (el máximo que acepta el servidor) y una
 * respuesta de 100 letras seguidas, que son lo peor que puede llegar a la pantalla.
 */

/** `newPlayer` le añade «_12345»: 24 + 6 = 30 caracteres. */
const longName = (letter: string): string => letter.repeat(24);

/** La página no se desplaza en horizontal. */
async function expectNoSideScroll(page: Page, where: string): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect.soft(scroll, `${where}: la página se desplaza en horizontal (${scroll} px de contenido en ${client} px)`).toBeLessThanOrEqual(client);
}

/** La caja entera cabe en la pantalla: lo que se sale por la izquierda no se puede desplazar y `scrollWidth` no lo ve. */
async function expectInsideViewport(page: Page, target: Locator, where: string): Promise<void> {
  const box = await target.boundingBox();
  expect(box, `${where}: no se ve`).not.toBeNull();
  const width = page.viewportSize()!.width;
  expect.soft(box!.x, `${where}: se sale por la izquierda (x = ${box!.x})`).toBeGreaterThanOrEqual(-0.5);
  expect.soft(box!.x + box!.width, `${where}: se sale por la derecha (llega a ${box!.x + box!.width} de ${width} px)`).toBeLessThanOrEqual(width + 0.5);
}

/** El encabezado de la aplicación (el perfil tiene otro <header> propio, por eso el primero). */
const appHeader = (page: Page): Locator => page.locator("header").first();

/** El encabezado sigue siendo una sola fila (si se parte en dos líneas mide más del doble). */
async function expectOneRowHeader(page: Page, where: string): Promise<void> {
  const box = await appHeader(page).boundingBox();
  expect.soft(box!.height, `${where}: el encabezado se parte en varias líneas (${box!.height} px de alto)`).toBeLessThan(70);
}

/** Abre el menú de apariencia y comprueba que el panel y cada una de sus opciones se alcanzan, y lo cierra. */
async function expectThemeMenuReachable(page: Page, where: string): Promise<void> {
  const toggle = page.getByRole("button", { name: "Apariencia" });
  await toggle.click();
  const panel = page.locator(`[id="${await toggle.getAttribute("aria-controls")}"]`);
  await expect(panel).toBeVisible();
  await expectInsideViewport(page, panel, `${where}: el menú de apariencia`);
  for (const option of ["Clásico", "Pokédex", "Automático", "Claro", "Oscuro"]) {
    await expectInsideViewport(page, panel.getByText(option, { exact: true }), `${where}: la opción «${option}»`);
  }
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
}

const WIDTHS = [360, 375, 414, 640, 700, 768, 900, 1024, 1280];

test("sin sesión el encabezado y el menú de apariencia caben en todos los anchos", async ({ browser }) => {
  const visitor = await newPlayer(browser, "visita");
  try {
    for (const width of WIDTHS) {
      await visitor.page.setViewportSize({ width, height: 740 });
      await visitor.page.goto("/login");
      await expect(visitor.page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
      const where = `${width} px, acceso`;
      await expectNoSideScroll(visitor.page, where);
      await expectOneRowHeader(visitor.page, where);
      await expectThemeMenuReachable(visitor.page, where);
      await visitor.page.goto("/registro");
      await expect(visitor.page.getByRole("heading", { name: "Crear cuenta" })).toBeVisible();
      await expectNoSideScroll(visitor.page, `${width} px, registro`);
    }
  } finally {
    await visitor.context.close();
  }
});

for (const [kind, label] of [
  ["corto", "ash"],
  ["de 30 letras", longName("a")],
] as const) {
  test(`con sesión iniciada el encabezado y el menú de apariencia caben en todos los anchos con un nombre ${kind}`, async ({ browser }) => {
    const ash = await newPlayer(browser, label);
    try {
      await register(ash);
      for (const width of WIDTHS) {
        await ash.page.setViewportSize({ width, height: 740 });
        const where = `${width} px, lobby`;
        await expectNoSideScroll(ash.page, where);
        await expectOneRowHeader(ash.page, where);
        await expectThemeMenuReachable(ash.page, where);
      }
    } finally {
      await ash.context.close();
    }
  });
}

for (const width of [360, 375]) {
  test(`a ${width} px la sala de espera cabe con un nombre de 30 letras`, async ({ browser }) => {
    const ash = await newPlayer(browser, longName("a"));
    try {
      await ash.page.setViewportSize({ width, height: 740 });
      await register(ash);
      await createRoomWithRounds(ash.page, 2);
      await expect(ash.page.getByRole("heading", { name: "Sala de espera" })).toBeVisible();
      await expectNoSideScroll(ash.page, `${width} px, sala de espera`);
      const card = ash.page.locator("section", { has: ash.page.getByRole("heading", { name: "Sala de espera" }) });
      await expectInsideViewport(ash.page, card, `${width} px, sala de espera: la tarjeta`);
      await expectInsideViewport(ash.page, ash.page.getByLabel("Código de la sala"), `${width} px, sala de espera: el código`);
      await expectInsideViewport(ash.page, ash.page.getByRole("list", { name: "Jugadores" }), `${width} px, sala de espera: los jugadores`);
    } finally {
      await ash.context.close();
    }
  });
}

test("a 375 px toda la partida cabe con nombres de 30 letras y una respuesta de 100 letras seguidas", async ({ browser }) => {
  const ash = await newPlayer(browser, longName("a"));
  const misty = await newPlayer(browser, longName("b"));
  try {
    for (const player of [ash, misty]) await player.page.setViewportSize({ width: 375, height: 740 });
    await register(ash);
    await register(misty);

    const code = await createRoomWithRounds(ash.page, 2);
    await joinRoom(misty.page, code);

    // La cuenta atrás de inicio: el título lleva el nombre del rival entero.
    for (const player of [ash, misty]) {
      await expect(player.page.getByRole("timer", { name: "Inicio de la partida" })).toBeVisible({ timeout: 15_000 });
      await expectNoSideScroll(player.page, "375 px, cuenta atrás");
      const title = player.page.getByRole("heading", { name: /^Partida contra / });
      await expectInsideViewport(player.page, title, "375 px, cuenta atrás: el título");
    }

    // La ronda: con una pantalla baja el marcador de la barra se queda pegado bajo el encabezado al desplazarse.
    const types = await roundTypes(ash.page);
    await roundTypes(misty.page);
    for (const player of [ash, misty]) await expectNoSideScroll(player.page, "375 px, ronda");
    await ash.page.setViewportSize({ width: 375, height: 380 });
    await ash.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const [header, bar] = [await appHeader(ash.page).boundingBox(), await ash.page.getByLabel("Marcador").boundingBox()];
    expect(bar, "375 px, ronda: el marcador no se ve al desplazarse").not.toBeNull();
    expect.soft(bar!.y, `375 px, ronda: el marcador no queda fijo bajo el encabezado (y = ${bar!.y})`).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
    expect.soft(bar!.y, `375 px, ronda: el marcador se separó del encabezado (y = ${bar!.y})`).toBeLessThan(header!.y + header!.height + 12);
    await ash.page.setViewportSize({ width: 375, height: 740 });

    // Ash acierta; Misty escribe 100 letras seguidas, que no existen y cierran la ronda al instante.
    await answer(ash.page, validAnswerFor(types));
    await answer(misty.page, "z".repeat(100));
    for (const player of [ash, misty]) {
      await expect(player.page.getByRole("heading", { name: "Resultado de la ronda 1" })).toBeVisible({ timeout: 30_000 });
      await expectNoSideScroll(player.page, "375 px, resultado de la ronda");
    }

    // La segunda ronda cierra la partida (el resultado de la última ronda no llega a mostrarse: pasa directo al resumen).
    await expect(ash.page.getByRole("heading", { name: "Ronda 2 de 2" })).toBeVisible({ timeout: 30_000 });
    await answer(ash.page, validAnswerFor(await roundTypes(ash.page)));
    await answer(misty.page, "zzzzzz");

    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });
    await expect(misty.page.getByRole("heading", { name: "Perdiste" })).toBeVisible({ timeout: 30_000 });
    for (const player of [ash, misty]) await expectNoSideScroll(player.page, "375 px, resumen");

    // El perfil, con el nombre largo en distintos anchos.
    await ash.page.getByRole("link", { name: "Mi perfil" }).click();
    await expect(ash.page.getByRole("heading", { name: "Tu perfil" })).toBeVisible();
    await expect(fact(ash.page, "Partidas")).toHaveText("1");
    for (const width of [375, 640, 700, 768, 1024]) {
      await ash.page.setViewportSize({ width, height: 740 });
      const where = `${width} px, perfil`;
      await expectNoSideScroll(ash.page, where);
      await expectOneRowHeader(ash.page, where);

      // El porcentaje de victorias no se monta sobre el anillo de su ficha.
      const overlap = await fact(ash.page, "Victorias").evaluate((value) => {
        const tile = value.parentElement!;
        const range = document.createRange();
        range.selectNodeContents(value);
        const text = range.getBoundingClientRect();
        const ring = tile.querySelector("svg")!.getBoundingClientRect();
        const across = Math.min(text.right, ring.right) - Math.max(text.left, ring.left);
        const down = Math.min(text.bottom, ring.bottom) - Math.max(text.top, ring.top);
        return across > 0.5 && down > 0.5 ? across : 0;
      });
      expect.soft(overlap, `${where}: el porcentaje se monta ${overlap} px sobre el anillo`).toBe(0);
    }
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});
