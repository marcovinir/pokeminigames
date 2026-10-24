import { type Locator, type Page, expect, test } from "@playwright/test";
import { answer, createOneRoundRoom, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

/**
 * Los avatares en dos navegadores reales: elegirlo en el perfil, que siga tras recargar, que el rival lo vea en la sala y
 * en su historial, quitarlo, y que la ventana quepa en un teléfono de 375 px con el nombre más largo.
 */

/** `newPlayer` le añade «_12345»: 24 + 6 = 30 caracteres, el máximo que acepta el servidor. */
const longName = (letter: string): string => letter.repeat(24);

const avatarImg = (scope: Page | Locator, id: number) => scope.locator(`img[src$="/official-artwork/${id}.png"]`);

async function openPicker(page: Page): Promise<Locator> {
  await page.goto("/perfil");
  await page.getByRole("button", { name: "Cambiar avatar" }).click();
  const dialog = page.getByRole("dialog", { name: "Elige tu avatar" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectInsideViewport(page: Page, target: Locator, where: string): Promise<void> {
  const box = await target.boundingBox();
  expect(box, `${where}: no se ve`).not.toBeNull();
  const width = page.viewportSize()!.width;
  expect.soft(box!.x, `${where}: se sale por la izquierda (x = ${box!.x})`).toBeGreaterThanOrEqual(-0.5);
  expect.soft(box!.x + box!.width, `${where}: se sale por la derecha (llega a ${box!.x + box!.width} de ${width} px)`).toBeLessThanOrEqual(width + 0.5);
}

test("elegir un avatar, que el rival lo vea en la sala y en su historial, y quitarlo", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  await register(ash);
  await register(misty);

  const dialog = await openPicker(ash.page);
  await dialog.getByRole("button", { name: "Gengar" }).click();
  await expect(dialog).toBeHidden();
  const header = ash.page.locator("header").first();
  await expect(avatarImg(header, 94)).toBeVisible();
  await expect(ash.page.getByRole("img", { name: "Avatar: Gengar" })).toBeVisible();

  await ash.page.reload();
  await expect(avatarImg(ash.page.locator("header").first(), 94)).toBeVisible();

  // misty crea y ash se une: misty ve a ash con su Gengar (en la sala de espera o ya en la cuenta atrás).
  await misty.page.goto("/");
  const code = await createOneRoundRoom(misty.page);
  await ash.page.goto("/");
  await joinRoom(ash.page, code);
  await expect(avatarImg(misty.page, 94).first()).toBeVisible();

  const types = await roundTypes(misty.page);
  await roundTypes(ash.page);
  await answer(misty.page, validAnswerFor(types));
  await answer(ash.page, "zzzzzz");
  await expect(misty.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });

  await misty.page.goto("/perfil");
  await expect(avatarImg(misty.page.getByRole("list", { name: "Historial de partidas" }), 94)).toBeVisible();

  const again = await openPicker(ash.page);
  await again.getByRole("button", { name: "Usar mis iniciales" }).click();
  await expect(again).toBeHidden();
  await expect(avatarImg(ash.page.locator("header").first(), 94)).toHaveCount(0);
  await expect(ash.page.getByRole("img", { name: /^Avatar:/ })).toHaveCount(0);
});

test("a 375 px la ventana y el perfil caben, con un nombre de 30 letras", async ({ browser }) => {
  const player = await newPlayer(browser, longName("w"));
  await player.page.setViewportSize({ width: 375, height: 812 });
  await register(player);

  const dialog = await openPicker(player.page);
  await expectInsideViewport(player.page, dialog, "la ventana");
  for (const button of await dialog.getByRole("button").all()) {
    await expectInsideViewport(player.page, button, `el botón «${(await button.textContent())?.trim()}»`);
  }
  await dialog.getByRole("button", { name: "Lucario" }).click();
  await expect(dialog).toBeHidden();

  await expectInsideViewport(player.page, player.page.getByRole("heading", { name: "Tu perfil" }), "el título del perfil");
  await expectInsideViewport(player.page, player.page.getByRole("button", { name: "Cambiar avatar" }), "«Cambiar avatar»");
  await expectInsideViewport(player.page, player.page.getByRole("img", { name: "Avatar: Lucario" }), "el avatar del perfil");
  const { scroll, client } = await player.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect.soft(scroll, `la página se desplaza en horizontal (${scroll} px de contenido en ${client} px)`).toBeLessThanOrEqual(client);
});

test("el aro de foco de «Cambiar avatar» se ve en Pokédex claro (es el del tema, no el del encabezado de color)", async ({ browser }) => {
  const player = await newPlayer(browser, "foco");
  await player.context.addInitScript(() => localStorage.setItem("pokemon-minigames:theme", JSON.stringify({ theme: "pokedex", mode: "claro" })));
  await register(player);
  await player.page.goto("/perfil");
  const button = player.page.getByRole("button", { name: "Cambiar avatar" });
  await expect(button).toBeVisible();
  for (let i = 0; i < 30 && !(await button.evaluate((el) => el === document.activeElement)); i++) await player.page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  const { outline, ring } = await button.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--ring)";
    document.body.append(probe);
    const ringColor = getComputedStyle(probe).color;
    probe.remove();
    return { outline: getComputedStyle(el).outlineColor, ring: ringColor };
  });
  expect(outline).toBe(ring);
});

test("en un teléfono en horizontal la ventana se desplaza: se ven el título y «Cerrar»", async ({ browser }) => {
  const player = await newPlayer(browser, "apaisado");
  await register(player);
  await player.page.setViewportSize({ width: 740, height: 320 });
  const dialog = await openPicker(player.page);
  await expect(dialog.getByRole("heading", { name: "Elige tu avatar" })).toBeInViewport();
  await dialog.getByRole("button", { name: "Cerrar" }).click({ timeout: 5_000 });
  await expect(dialog).toBeHidden();
});

