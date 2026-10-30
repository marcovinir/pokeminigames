import { type Locator, type Page, expect, test } from "@playwright/test";
import {
  answer,
  createOneRoundRoom,
  createRoomWithRounds,
  fact,
  guestLogin,
  joinRoom,
  newPlayer,
  playAsGuest,
  register,
  roundTypes,
  validAnswerFor,
} from "../support/app";
import { gamesWithRoomCode } from "../support/db";

/**
 * El modo invitado en un navegador de verdad: entrar solo con un nombre, jugar igual que una cuenta (también al recargar),
 * la etiqueta «Invitado», y que una partida con un invitado no deje ninguna fila.
 */

/** `newPlayer` le añade «_12345»: 24 + 6 = 30 caracteres, el máximo que acepta el servidor. */
const longName = (letter: string): string => letter.repeat(24);

const VIEWPORTS = [360, 375];

/** La caja entera cabe en la pantalla (lo que se sale por la izquierda no se puede desplazar y `scrollWidth` no lo ve). */
async function expectInsideViewport(page: Page, target: Locator, where: string): Promise<void> {
  const box = await target.boundingBox();
  expect(box, `${where}: no se ve`).not.toBeNull();
  const width = page.viewportSize()!.width;
  expect.soft(box!.x, `${where}: se sale por la izquierda (x = ${box!.x})`).toBeGreaterThanOrEqual(-0.5);
  expect.soft(box!.x + box!.width, `${where}: se sale por la derecha (llega a ${box!.x + box!.width} de ${width} px)`).toBeLessThanOrEqual(width + 0.5);
}

/** La página no se desplaza en horizontal. */
async function expectNoSideScroll(page: Page, where: string): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect.soft(scroll, `${where}: la página se desplaza en horizontal (${scroll} px de contenido en ${client} px)`).toBeLessThanOrEqual(client);
}

/** El encabezado de la aplicación (el perfil tiene otro <header> propio, por eso el primero). */
const appHeader = (page: Page): Locator => page.locator("header").first();

test("un invitado y una cuenta juegan una partida completa; el invitado recarga en plena ronda y la partida no deja rastro", async ({ browser }) => {
  const guest = await playAsGuest(browser, "inv");
  const ash = await newPlayer(browser, "ash");
  try {
    await register(ash);
    const code = await createOneRoundRoom(guest.page);
    await joinRoom(ash.page, code);

    const types = await roundTypes(guest.page);
    await roundTypes(ash.page);

    // El invitado recarga con la ronda en marcha: la cookie de invitado le devuelve su sesión y su asiento.
    await guest.page.reload();
    await expect(guest.page).toHaveURL(new RegExp(`/sala/${code}$`));
    expect(await roundTypes(guest.page)).toEqual(types);
    await expect(guest.page.getByRole("timer")).toBeVisible();
    await expect(guest.page.getByRole("combobox", { name: "Nombre del Pokémon" })).toBeEnabled();

    await answer(ash.page, validAnswerFor(types));
    await answer(guest.page, "zzzzzz");
    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });
    await expect(guest.page.getByRole("heading", { name: "Perdiste" })).toBeVisible({ timeout: 30_000 });

    // Sin perfiles: ni el invitado ni la cuenta pueden abrir el del otro desde el resumen.
    await expect(ash.page.getByRole("button", { name: "Volver al lobby" })).toBeVisible();
    await expect(ash.page.getByRole("button", { name: /Ver perfil de/ })).toHaveCount(0);
    await expect(guest.page.getByRole("button", { name: /Ver perfil de/ })).toHaveCount(0);

    // La partida no cuenta para la cuenta ni dejó ninguna fila.
    await ash.page.goto("/perfil");
    await expect(ash.page.getByText("Todavía no has jugado ninguna partida.")).toBeVisible();
    await expect(fact(ash.page, "Partidas")).toHaveCount(0);
    expect(await gamesWithRoomCode(code)).toBe(0);
  } finally {
    await guest.context.close();
    await ash.context.close();
  }
});

test("las etiquetas: la cuenta ve «Invitado» junto al rival, y el invitado no tiene perfil ni «Mi perfil»", async ({ browser }) => {
  const guest = await playAsGuest(browser, "inv");
  const ash = await newPlayer(browser, "ash");
  try {
    // El encabezado de un invitado: su etiqueta y «Crear cuenta» en lugar de «Mi perfil», y /perfil lo devuelve al lobby.
    const header = appHeader(guest.page);
    await expect(header.getByText("Invitado", { exact: true })).toBeVisible();
    await header.getByRole("button", { name: "Menú", exact: true }).click();
    await expect(header.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/registro");
    await expect(header.getByRole("link", { name: "Mi perfil" })).toHaveCount(0);
    await expect(header.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    await expect(header.getByRole("group", { name: "Apariencia" })).toBeVisible();
    await guest.page.goto("/perfil");
    await expect(guest.page).toHaveURL(/\/$/);
    await expect(guest.page.getByRole("heading", { name: "¿A qué jugamos?" })).toBeVisible();
    await guest.page.goto(`/jugador/${ash.name}`);
    await expect(guest.page).toHaveURL(/\/$/);

    // Un invitado puede abrir /registro (así se pasa a tener cuenta) sin que lo echen al lobby.
    await guest.page.goto("/registro");
    await expect(guest.page.getByRole("heading", { name: "Crear cuenta" })).toBeVisible();
    await guest.page.goto("/jugar/doble-tipo");

    // La sala de espera del invitado lo marca; cuando la cuenta se une, ve «Invitado» en la cuenta atrás y en el panel del rival.
    await register(ash);
    const code = await createOneRoundRoom(guest.page);
    await expect(guest.page.getByRole("list", { name: "Jugadores" }).getByText("Invitado", { exact: true })).toBeVisible();
    // Se une la cuenta: la partida que la cuenta ya tenía... no existe, la creó el invitado.
    await joinRoom(ash.page, code);
    await expect(ash.page.getByRole("heading", { name: new RegExp(`Partida contra ${guest.name}`) })).toBeVisible();
    await expect(ash.page.getByText("Invitado", { exact: true })).toBeVisible();
    await roundTypes(ash.page);
    await expect(ash.page.getByRole("region", { name: "Tu rival" }).getByText("Invitado", { exact: true })).toBeVisible();
    // Al revés: el invitado no ve etiqueta junto a una cuenta.
    await roundTypes(guest.page);
    await expect(guest.page.getByRole("region", { name: "Tu rival" }).getByText("Invitado", { exact: true })).toHaveCount(0);
    expect(await gamesWithRoomCode(code)).toBe(0);
  } finally {
    await guest.context.close();
    await ash.context.close();
  }
});

test("una cuenta crea la sala y se une un invitado: la partida que ya estaba guardada se descarta", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const guest = await playAsGuest(browser, "inv");
  try {
    await register(ash);
    const code = await createOneRoundRoom(ash.page);
    // Mientras espera, la cuenta sí tiene su partida guardada (como siempre).
    await expect.poll(() => gamesWithRoomCode(code)).toBe(1);

    await joinRoom(guest.page, code);
    await expect.poll(() => gamesWithRoomCode(code)).toBe(0);

    const types = await roundTypes(ash.page);
    await roundTypes(guest.page);
    await answer(ash.page, validAnswerFor(types));
    await answer(guest.page, "zzzzzz");
    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });
    await expect(guest.page.getByRole("heading", { name: "Perdiste" })).toBeVisible({ timeout: 30_000 });
    expect(await gamesWithRoomCode(code)).toBe(0);
  } finally {
    await ash.context.close();
    await guest.context.close();
  }
});

test("dos invitados juegan; el segundo con el mismo nombre (con otras mayúsculas) recibe un aviso y puede entrar con otro", async ({ browser }) => {
  const first = await playAsGuest(browser, "inv");
  const second = await newPlayer(browser, "otro");
  try {
    await guestLogin(second.page, first.name.toUpperCase());
    const code = await createOneRoundRoom(first.page);

    await joinRoom(second.page, code);
    await expect(second.page.getByText("Ya hay alguien con ese nombre en la sala. Cierra sesión (arriba a la derecha) y entra como invitado con otro nombre.")).toBeVisible();
    await expect(second.page).not.toHaveURL(/\/sala\//);
    await expect(first.page.getByRole("heading", { name: "Sala de espera" })).toBeVisible();

    // Sale y entra con otro nombre.
    await second.page.getByRole("button", { name: "Menú", exact: true }).click();
    await second.page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(second.page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await guestLogin(second.page, second.name);
    await joinRoom(second.page, code);

    const types = await roundTypes(first.page);
    await roundTypes(second.page);
    await answer(first.page, validAnswerFor(types));
    await answer(second.page, "zzzzzz");
    await expect(first.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });
    await expect(second.page.getByRole("heading", { name: "Perdiste" })).toBeVisible({ timeout: 30_000 });
    expect(await gamesWithRoomCode(code)).toBe(0);
  } finally {
    await first.context.close();
    await second.context.close();
  }
});

for (const width of VIEWPORTS) {
  test(`a ${width} px con nombres de 30 letras el bloque de acceso, el encabezado y las etiquetas caben`, async ({ browser }) => {
    const visitor = await newPlayer(browser, longName("v"));
    const guest = await newPlayer(browser, longName("g"));
    const ash = await newPlayer(browser, longName("a"));
    try {
      for (const player of [visitor, guest, ash]) await player.page.setViewportSize({ width, height: 740 });

      // El bloque de acceso en /login.
      await visitor.page.goto("/login");
      const block = visitor.page.getByRole("heading", { name: "¿Sin cuenta? Juega como invitado" }).locator("xpath=ancestor::section[1]");
      await expect(block).toBeVisible();
      const where = `${width} px, acceso`;
      await expectInsideViewport(visitor.page, block, `${where}: el bloque de invitado`);
      await expectInsideViewport(visitor.page, visitor.page.getByLabel("Nombre", { exact: true }), `${where}: el campo «Nombre»`);
      await expectInsideViewport(visitor.page, visitor.page.getByRole("button", { name: "Entrar como invitado" }), `${where}: el botón`);
      await expectNoSideScroll(visitor.page, where);

      // El encabezado de un invitado con un nombre de 30 letras: una sola fila y todo dentro de la pantalla.
      await guestLogin(guest.page, guest.name);
      const header = appHeader(guest.page);
      const box = await header.boundingBox();
      expect.soft(box!.height, `${width} px: el encabezado del invitado se parte en varias líneas (${box!.height} px)`).toBeLessThan(70);
      await expectInsideViewport(guest.page, header.getByText("Invitado", { exact: true }), `${width} px: la etiqueta del encabezado`);
      await header.getByRole("button", { name: "Menú", exact: true }).click();
      await expectInsideViewport(guest.page, header.getByRole("link", { name: "Crear cuenta" }), `${width} px: «Crear cuenta»`);
      await expectInsideViewport(guest.page, header.getByRole("button", { name: "Cerrar sesión" }), `${width} px: «Cerrar sesión»`);
      await guest.page.keyboard.press("Escape");
      await expectNoSideScroll(guest.page, `${width} px, lobby del invitado`);

      // La sala de espera, la cuenta atrás y la ronda: la cuenta (nombre largo) ve al invitado (nombre largo) con su etiqueta.
      await register(ash);
      // Dos rondas: la pantalla del resultado de la primera dura 6 s y se puede medir.
      const code = await createRoomWithRounds(guest.page, 2);
      await expectNoSideScroll(guest.page, `${width} px, sala de espera`);
      await expectInsideViewport(
        guest.page,
        guest.page.getByRole("list", { name: "Jugadores" }).getByText("Invitado", { exact: true }),
        `${width} px: la etiqueta en la sala de espera`,
      );
      await joinRoom(ash.page, code);
      await expectInsideViewport(ash.page, ash.page.getByText("Invitado", { exact: true }), `${width} px: la etiqueta en la cuenta atrás`);
      await expectNoSideScroll(ash.page, `${width} px, cuenta atrás`);

      const types = await roundTypes(ash.page);
      await roundTypes(guest.page);
      const scoreboard = ash.page.getByLabel("Marcador");
      await expect(scoreboard).toBeVisible();
      await expectInsideViewport(ash.page, scoreboard, `${width} px: la barra «Marcador»`);
      await expectInsideViewport(ash.page, scoreboard.getByText("Invitado", { exact: true }), `${width} px: la etiqueta en el marcador`);
      const rival = ash.page.getByRole("region", { name: "Tu rival" });
      await expectInsideViewport(ash.page, rival.getByText("Invitado", { exact: true }), `${width} px: la etiqueta en el panel del rival`);
      await expectNoSideScroll(ash.page, `${width} px, ronda`);

      // El resultado de la primera ronda.
      await answer(ash.page, validAnswerFor(types));
      await answer(guest.page, "zzzzzz");
      const result = ash.page.getByRole("region", { name: `Resultado de ${guest.name}` });
      await expect(result).toBeVisible({ timeout: 30_000 });
      await expectInsideViewport(ash.page, result.getByText("Invitado", { exact: true }), `${width} px: la etiqueta en el resultado`);
      await expectNoSideScroll(ash.page, `${width} px, resultado`);

      // La segunda ronda (otro Pokémon del par: el primero ya es de la cuenta) y el resumen.
      await expect(ash.page.getByRole("heading", { name: /Ronda 2 de 2/ })).toBeVisible({ timeout: 30_000 });
      const secondTypes = await roundTypes(ash.page);
      await answer(ash.page, validAnswerFor(secondTypes, 1));
      await answer(guest.page, "zzzzzz");
      await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });
      const team = ash.page.getByRole("region", { name: `Equipo de ${guest.name}` });
      await expectInsideViewport(ash.page, team.getByText("Invitado", { exact: true }), `${width} px: la etiqueta en el resumen`);
      await expectNoSideScroll(ash.page, `${width} px, resumen`);
    } finally {
      await visitor.context.close();
      await guest.context.close();
      await ash.context.close();
    }
  });
}
