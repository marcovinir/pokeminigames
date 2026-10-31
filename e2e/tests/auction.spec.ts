import { type Page, expect, test } from "@playwright/test";
import { joinRoom, newPlayer, register } from "../support/app";

/**
 * La subasta en dos navegadores reales, sin trampas: el servidor sortea de verdad, así que se comprueba la estructura
 * (9 lotes, dinero, recarga, revelación). El juego aún no se ofrece en el menú: se entra por la dirección.
 */

test.setTimeout(240_000);

const passButton = (page: Page) => page.getByRole("button", { name: "Pasar" });

async function createAuctionRoom(page: Page): Promise<string> {
  await page.goto("/jugar/subasta");
  await page.getByRole("switch", { name: "Siluetas trampa" }).uncheck({ force: true });
  await page.getByRole("button", { name: "Crear sala" }).click();
  const code = page.getByLabel("Código de la sala");
  await expect(code).toBeVisible();
  await expect(page.getByLabel("Configuración de la sala")).toHaveText("Sin siluetas trampa");
  return ((await code.textContent()) ?? "").trim();
}

/** Quién tiene el turno: espera hasta que uno vea «Pasar»; `null` si ya llegó la revelación. */
async function pageInTurn(pages: [Page, Page], revealTitle: (page: Page) => ReturnType<Page["getByRole"]>): Promise<Page | null> {
  let found: Page | null = null;
  await expect(async () => {
    if (await revealTitle(pages[0]).isVisible()) return;
    const visible = await Promise.all(pages.map((page) => passButton(page).isVisible()));
    found = visible[0] ? pages[0] : visible[1] ? pages[1] : null;
    expect(found).not.toBeNull();
  }).toPass({ timeout: 20_000 });
  return found;
}

test("dos navegadores pujan, recargan a mitad y llegan a la revelación", async ({ browser }) => {
  const ash = await newPlayer(browser, "a".repeat(24));
  const misty = await newPlayer(browser, "misty");
  await register(ash);
  await register(misty);
  await ash.page.setViewportSize({ width: 360, height: 760 });
  const code = await createAuctionRoom(ash.page);
  await misty.page.goto("/jugar/subasta");
  await joinRoom(misty.page, code);
  const pages: [Page, Page] = [ash.page, misty.page];

  for (const page of pages) await expect(page.getByText("Lote 1 de 9")).toBeVisible({ timeout: 30_000 });

  // A 360 px, con un nombre largo, nada se sale de la pantalla.
  const { scroll, client } = await ash.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
  for (const name of ["Jugadores", "Tiempo del turno"]) {
    const box = await ash.page.getByLabel(name).first().boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-0.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360.5);
  }

  // Recargar a mitad de un lote vuelve a ese lote.
  await misty.page.reload();
  await expect(misty.page.getByText("Lote 1 de 9")).toBeVisible({ timeout: 30_000 });

  // No siempre se ven los 9: quien ya tiene 3 no puja más, y los lotes que quedan van solos al otro. Se juega hasta la revelación.
  const revealTitle = (page: Page) => page.getByRole("heading", { name: "¿Qué compró cada uno?" });
  for (let turn = 1; turn <= 40 && !(await revealTitle(ash.page).isVisible()); turn++) {
    const inTurn = await pageInTurn(pages, revealTitle);
    if (!inTurn) break;
    const bid = inTurn.getByRole("button", { name: /^Pujar/ }).first();
    // Se alterna entre comprar y pasar; hacer clic puede llegar tarde si venció el turno, y no pasa nada.
    if (turn % 3 === 0 && (await bid.isEnabled())) await bid.click({ timeout: 2000 }).catch(() => undefined);
    else await passButton(inTurn).click({ timeout: 2000 }).catch(() => undefined);
    await inTurn.waitForTimeout(100);
  }

  for (const page of pages) await expect(page.getByRole("heading", { name: "¿Qué compró cada uno?" })).toBeVisible({ timeout: 30_000 });
  await ash.page.getByRole("button", { name: "Listo" }).click();
  await expect(ash.page.getByRole("button", { name: "Esperando al rival…" })).toBeDisabled();
  await misty.page.getByRole("button", { name: "Listo" }).click();
  for (const page of pages) await expect(page.getByRole("heading", { name: "El combate llega pronto" })).toBeVisible({ timeout: 15_000 });
});

test("el menú aún no ofrece la subasta", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  await register(ash);
  await ash.page.goto("/");
  await expect(ash.page.getByRole("link", { name: /Silueta|Quién es/i }).first()).toBeVisible();
  await expect(ash.page.getByText("Subasta Pokémon")).toHaveCount(0);
});
