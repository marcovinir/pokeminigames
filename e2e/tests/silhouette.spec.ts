import { type Locator, type Page, expect, test } from "@playwright/test";
import { answer, enterLobby, joinRoom, newPlayer, register } from "../support/app";

/**
 * «¿Quién es ese Pokémon?» en dos navegadores reales. El servidor sortea de verdad y el navegador no puede saber la
 * respuesta (es justo lo que se busca), así que la partida comprueba la estructura: silueta, una respuesta fallida, otra
 * sin responder, la revelación, las rondas y el resumen. Los puntos con acierto los prueba el servidor con azar fijo.
 */

test.setTimeout(240_000);

const longName = (letter: string): string => letter.repeat(24);
const silhouetteImg = (page: Page) => page.getByRole("img", { name: "Silueta de un Pokémon" });

async function createSilhouetteRoom(page: Page, rounds = 10): Promise<string> {
  await page.goto("/");
  await enterLobby(page, "silueta");
  await page.getByLabel("Rondas").selectOption(String(rounds));
  await page.getByRole("button", { name: "Crear sala" }).click();
  const code = page.getByLabel("Código de la sala");
  await expect(code).toBeVisible();
  await expect(page.getByLabel("Configuración de la sala")).toHaveText(`${rounds} rondas · 1.ª (Kanto)`);
  return ((await code.textContent()) ?? "").trim();
}

async function expectInsideViewport(page: Page, target: Locator, where: string): Promise<void> {
  const box = await target.boundingBox();
  expect(box, `${where}: no se ve`).not.toBeNull();
  const width = page.viewportSize()!.width;
  expect.soft(box!.x, `${where}: se sale por la izquierda`).toBeGreaterThanOrEqual(-0.5);
  expect.soft(box!.x + box!.width, `${where}: se sale por la derecha (${box!.x + box!.width} de ${width})`).toBeLessThanOrEqual(width + 0.5);
}

async function expectNoSideScroll(page: Page, where: string): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect.soft(scroll, `${where}: desplazamiento horizontal`).toBeLessThanOrEqual(client);
}

test("dos navegadores juegan una silueta de 5 rondas desde el menú", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  await register(ash);
  await register(misty);
  const code = await createSilhouetteRoom(ash.page, 5);
  await joinRoom(misty.page, code);

  for (let round = 1; round <= 5; round++) {
    for (const page of [ash.page, misty.page]) {
      await expect(page.getByText(`Ronda ${round} de 5`)).toBeVisible({ timeout: 30_000 });
      await expect(silhouetteImg(page)).toHaveAttribute("src", /^\/silhouettes\/[A-Za-z0-9_-]{22}$/);
    }
    await answer(ash.page, "zzzzzz");
    await expect(ash.page.getByText(/^Respondiste en \d+,\d s$/)).toBeVisible();

    for (const page of [ash.page, misty.page]) {
      await expect(page.getByRole("heading", { name: /^¡Es .+!$/ })).toBeVisible({ timeout: 30_000 });
    }
    const ashRows = ash.page.getByRole("list", { name: "Respuestas" });
    await expect(ashRows.getByRole("listitem", { name: "Tú" })).toContainText("zzzzzz");
    await expect(ashRows.getByRole("listitem", { name: "Tú" })).toContainText("+0");
    await expect(ashRows.getByRole("listitem", { name: misty.name })).toContainText("sin respuesta");
  }

  for (const page of [ash.page, misty.page]) {
    await expect(page.getByRole("heading", { name: "Empate" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("0 – 0", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Pokémon de la partida" }).getByRole("listitem")).toHaveCount(5);
  }
});

test("un código de silueta en el lobby de Doble tipo lleva a la sala de silueta", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  await register(ash);
  await register(misty);
  const code = await createSilhouetteRoom(ash.page);
  // `register` deja a misty en el lobby de «Doble tipo».
  await expect(misty.page.getByRole("heading", { level: 1, name: "Doble tipo" })).toBeVisible();
  await joinRoom(misty.page, code);
  await expect(misty.page).toHaveURL(new RegExp(`/sala/${code}$`));
  await expect(silhouetteImg(misty.page)).toBeVisible({ timeout: 30_000 });
});

test("a 375 px caben el menú, el formulario y la ronda", async ({ browser }) => {
  const ash = await newPlayer(browser, longName("s"));
  const misty = await newPlayer(browser, "misty");
  await ash.page.setViewportSize({ width: 375, height: 812 });
  await register(ash);
  await register(misty);

  await ash.page.goto("/");
  for (const card of await ash.page.getByRole("article").all()) await expectInsideViewport(ash.page, card, "tarjeta del menú");
  await expectNoSideScroll(ash.page, "menú");

  await enterLobby(ash.page, "silueta");
  for (const box of await ash.page.getByRole("group", { name: "Generaciones" }).getByRole("checkbox").all()) {
    await expectInsideViewport(ash.page, box.locator("xpath=.."), "casilla de generación");
  }
  await expectNoSideScroll(ash.page, "formulario de la silueta");

  await ash.page.getByRole("button", { name: "Crear sala" }).click();
  const code = ((await ash.page.getByLabel("Código de la sala").textContent()) ?? "").trim();
  await joinRoom(misty.page, code);
  await expect(silhouetteImg(ash.page)).toBeVisible({ timeout: 30_000 });
  await expectInsideViewport(ash.page, silhouetteImg(ash.page), "silueta");
  await expectInsideViewport(ash.page, ash.page.getByRole("combobox", { name: "Nombre del Pokémon" }), "campo de respuesta");
  await expectInsideViewport(ash.page, ash.page.getByLabel("Marcador"), "marcador");
  await expectNoSideScroll(ash.page, "ronda");
});
