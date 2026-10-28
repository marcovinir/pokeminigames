import { type Locator, type Page, expect, test } from "@playwright/test";
import { answer, fact, newPlayer, playAsGuest, playOneRoundGame, register, roomCodeOf, roundTypes, validAnswerFor } from "../support/app";
import { gamesWithRoomCode } from "../support/db";

/**
 * La revancha en dos navegadores reales: pedirla desde el resumen, el récord y los datos curiosos de la espera, la
 * pantalla «¡Revancha!» y la sala nueva, los cierres (rechazar, cancelar, salir, plazo) y la recarga durante la espera.
 */

/** `newPlayer` le añade «_12345»: 24 + 6 = 30 caracteres, el máximo que acepta el servidor. */
const longName = (letter: string): string => letter.repeat(24);

async function expectInsideViewport(page: Page, target: Locator, where: string): Promise<void> {
  const box = await target.boundingBox();
  expect(box, `${where}: no se ve`).not.toBeNull();
  const width = page.viewportSize()!.width;
  expect.soft(box!.x, `${where}: se sale por la izquierda (x = ${box!.x})`).toBeGreaterThanOrEqual(-0.5);
  expect.soft(box!.x + box!.width, `${where}: se sale por la derecha (llega a ${box!.x + box!.width} de ${width} px)`).toBeLessThanOrEqual(width + 0.5);
}

async function expectNoSideScroll(page: Page, where: string): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect.soft(scroll, `${where}: la página se desplaza en horizontal (${scroll} px de contenido en ${client} px)`).toBeLessThanOrEqual(client);
}

const rematchButton = (page: Page) => page.getByRole("button", { name: "Revancha" });

test("dos cuentas aceptan la revancha: pasan solas a una sala nueva, juegan otra partida y las dos cuentan", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    const firstCode = await playOneRoundGame(ash, misty);

    await rematchButton(ash.page).click();
    // La espera: el récord grande (su primera partida juntos, ganada por ash), el plazo y un dato curioso.
    const record = ash.page.getByRole("region", { name: `Récord contra ${misty.name}` });
    await expect(record.getByText("1 – 0")).toBeVisible();
    await expect(record.getByText("Es su primera partida juntos")).toBeVisible();
    await expect(ash.page.getByRole("heading", { name: `Esperando a ${misty.name}…` })).toBeVisible();
    await expect(ash.page.locator("[data-fact]")).toBeVisible();
    await expect(misty.page.getByRole("heading", { name: `${ash.name} quiere la revancha` })).toBeVisible();

    await misty.page.getByRole("button", { name: "Aceptar" }).click();
    await expect(ash.page).not.toHaveURL(new RegExp(`/sala/${firstCode}$`));
    await expect(misty.page).toHaveURL(ash.page.url());
    await expect(ash.page.getByRole("heading", { name: new RegExp(`Partida contra ${misty.name}`) })).toBeVisible();

    const types = await roundTypes(ash.page);
    await roundTypes(misty.page);
    await answer(ash.page, validAnswerFor(types));
    await answer(misty.page, "zzzzzz");
    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });

    for (const player of [ash, misty]) {
      await player.page.goto("/perfil");
      await expect(fact(player.page, "Partidas")).toHaveText("2");
    }
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("rechazar: quien la pidió ve «… ya no quiere la revancha.» y solo «Volver al lobby»", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    await playOneRoundGame(ash, misty);
    await rematchButton(ash.page).click();
    await misty.page.getByRole("button", { name: "Rechazar" }).click();
    await expect(ash.page.getByRole("status").getByText(`${misty.name} ya no quiere la revancha.`, { exact: true })).toBeVisible();
    await expect(rematchButton(ash.page)).toHaveCount(0);
    await expect(ash.page.getByRole("button", { name: "Volver al lobby" })).toBeVisible();
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("cancelar: el rival ve «… ya no quiere la revancha.» y pierde los botones de aceptar", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    await playOneRoundGame(ash, misty);
    await rematchButton(ash.page).click();
    await expect(misty.page.getByRole("button", { name: "Aceptar" })).toBeVisible();
    await ash.page.getByRole("button", { name: "Cancelar" }).click();
    await expect(misty.page.getByRole("status").getByText(`${ash.name} ya no quiere la revancha.`, { exact: true })).toBeVisible();
    await expect(misty.page.getByRole("button", { name: "Aceptar" })).toHaveCount(0);
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("«Volver al lobby» del rival: quien se queda ve «… se fue.»", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    await playOneRoundGame(ash, misty);
    await expect(rematchButton(ash.page)).toBeVisible();
    await misty.page.getByRole("button", { name: "Volver al lobby" }).click();
    await expect(ash.page.getByRole("status").getByText(`${misty.name} se fue.`, { exact: true })).toBeVisible();
    await expect(rematchButton(ash.page)).toHaveCount(0);
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("recargar durante la espera conserva el resumen y la petición", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    await playOneRoundGame(ash, misty);
    await rematchButton(ash.page).click();
    await expect(ash.page.getByRole("heading", { name: `Esperando a ${misty.name}…` })).toBeVisible();

    await ash.page.reload();
    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible();
    await expect(ash.page.getByRole("heading", { name: `Esperando a ${misty.name}…` })).toBeVisible();
    // La recarga no contó como «se fue»: misty puede aceptar y los dos pasan a la sala nueva.
    await misty.page.getByRole("button", { name: "Aceptar" }).click();
    await expect(ash.page.getByRole("heading", { name: new RegExp(`Partida contra ${misty.name}`) })).toBeVisible();
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("con un invitado no hay récord y ni la partida ni la revancha dejan filas", async ({ browser }) => {
  const guest = await playAsGuest(browser, "inv");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(misty);
    const firstCode = await playOneRoundGame(guest, misty);
    await rematchButton(guest.page).click();
    await expect(misty.page.getByRole("heading", { name: `${guest.name} quiere la revancha` })).toBeVisible();
    await expect(misty.page.getByRole("region", { name: /Récord contra/ })).toHaveCount(0);
    await expect(guest.page.getByRole("region", { name: /Récord contra/ })).toHaveCount(0);
    await misty.page.getByRole("button", { name: "Aceptar" }).click();
    await expect(misty.page.getByRole("heading", { name: new RegExp(`Partida contra ${guest.name}`) })).toBeVisible();

    const newCode = roomCodeOf(misty.page);
    expect(newCode).not.toBe(firstCode);
    expect(await gamesWithRoomCode(firstCode)).toBe(0);
    expect(await gamesWithRoomCode(newCode)).toBe(0);
  } finally {
    await guest.context.close();
    await misty.context.close();
  }
});

test("se agota el plazo: a los 60 s de la petición los dos ven «Se acabó el tiempo.»", async ({ browser }) => {
  test.setTimeout(150_000);
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    await playOneRoundGame(ash, misty);
    await rematchButton(ash.page).click();
    await expect(misty.page.getByRole("button", { name: "Aceptar" })).toBeVisible();
    await expect(ash.page.getByRole("status").getByText("Se acabó el tiempo.", { exact: true })).toBeVisible({ timeout: 75_000 });
    await expect(misty.page.getByRole("status").getByText("Se acabó el tiempo.", { exact: true })).toBeVisible();
    await expect(misty.page.getByRole("button", { name: "Aceptar" })).toHaveCount(0);
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});

test("a 375 px con nombres de 30 letras la espera y la pantalla «¡Revancha!» caben", async ({ browser }) => {
  const ash = await newPlayer(browser, longName("a"));
  const misty = await newPlayer(browser, longName("m"));
  try {
    for (const player of [ash, misty]) await player.page.setViewportSize({ width: 375, height: 740 });
    await register(ash);
    await register(misty);
    await playOneRoundGame(ash, misty);

    // Quien pide espera; quien recibe decide. Los dos bloques tienen el récord grande, el plazo y el dato curioso.
    await rematchButton(misty.page).click();
    const waiting = misty.page.getByRole("heading", { name: `Esperando a ${ash.name}…` });
    await expect(waiting).toBeVisible();
    await expect(misty.page.locator("[data-fact]")).toBeVisible();
    await expectInsideViewport(misty.page, waiting, "375 px: el título de la espera");
    await expectInsideViewport(misty.page, misty.page.getByRole("button", { name: "Cancelar" }), "375 px: «Cancelar»");
    await expectNoSideScroll(misty.page, "375 px, espera de la revancha");

    const heading = ash.page.getByRole("heading", { name: `${misty.name} quiere la revancha` });
    await expect(heading).toBeVisible();
    await expect(ash.page.locator("[data-fact]")).toBeVisible();
    await expectInsideViewport(ash.page, heading, "375 px: el título de quien decide");
    await expectInsideViewport(ash.page, ash.page.getByRole("region", { name: `Récord contra ${misty.name}` }), "375 px: el récord");
    await expectInsideViewport(ash.page, ash.page.locator("[data-fact]"), "375 px: el dato curioso");
    await expectInsideViewport(ash.page, ash.page.getByRole("button", { name: "Aceptar" }), "375 px: «Aceptar»");
    await expectInsideViewport(ash.page, ash.page.getByRole("button", { name: "Rechazar" }), "375 px: «Rechazar»");
    await expectNoSideScroll(ash.page, "375 px, revancha por decidir");

    // Misty cierra su navegador y ash acepta enseguida (antes de los 10 s de reconexión): la sala nueva se crea con las dos,
    // pero misty no entra, y ash se queda en la pantalla «¡Revancha!» esperándola (hasta 30 s).
    await misty.page.close();
    await ash.page.getByRole("button", { name: "Aceptar" }).click();
    await expect(ash.page.getByRole("heading", { name: "¡Revancha!" })).toBeVisible();
    const entering = ash.page.getByText(`${misty.name} entrando…`);
    await expect(entering).toBeVisible();
    await expectInsideViewport(ash.page, entering, "375 px: «… entrando…»");
    await expectInsideViewport(ash.page, ash.page.getByRole("heading", { name: "¡Revancha!" }), "375 px: el título «¡Revancha!»");
    await expectNoSideScroll(ash.page, "375 px, pantalla «¡Revancha!»");
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});
