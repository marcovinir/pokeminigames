import { type Page, expect, test } from "@playwright/test";
import { joinRoom, newPlayer, register } from "../support/app";

/** La subasta en dos navegadores reales, sin trampas: el servidor sortea de verdad, así que se comprueba la estructura. */

test.setTimeout(600_000);

const passButton = (page: Page) => page.getByRole("button", { name: /^Retirarme/ });

async function createAuctionRoom(page: Page): Promise<string> {
  await page.goto("/jugar/subasta");
  await page.getByRole("switch", { name: "Siluetas trampa" }).uncheck({ force: true });
  await page.getByRole("button", { name: "Crear sala" }).click();
  const code = page.getByLabel("Código de la sala");
  await expect(code).toBeVisible();
  await expect(page.getByLabel("Configuración de la sala")).toHaveText("Sin siluetas trampa");
  return ((await code.textContent()) ?? "").trim();
}

/** Quién tiene el turno: espera hasta que uno vea «Retirarme»; `null` si ya llegó la revelación. */
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

/** A lo ancho de la pantalla no sobra nada. */
async function expectFits(page: Page, where: string): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect.soft(scroll, `${where}: desplazamiento horizontal`).toBeLessThanOrEqual(client);
}

test("una partida completa: puja, revelación, alineación, combate, resumen y revancha, con recargas", async ({ browser }) => {
  const ash = await newPlayer(browser, "a".repeat(24));
  const misty = await newPlayer(browser, "misty");
  await register(ash);
  await register(misty);
  await ash.page.setViewportSize({ width: 360, height: 760 });
  const code = await createAuctionRoom(ash.page);
  await misty.page.goto("/jugar/subasta");
  await joinRoom(misty.page, code);
  const pages: [Page, Page] = [ash.page, misty.page];

  for (const page of pages) await expect(page.getByText("Lote 1 de 12", { exact: true })).toBeVisible({ timeout: 30_000 });

  // A 360 px, con un nombre largo, nada se sale de la pantalla.
  const { scroll, client } = await ash.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
  for (const name of [ash.name, misty.name]) {
    const box = await ash.page.getByRole("group", { name }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-0.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360.5);
  }

  // Recargar a mitad de un lote vuelve a ese lote.
  await misty.page.reload();
  await expect(misty.page.getByText("Lote 1 de 12", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Quien ya tiene 6 no puja más, y los lotes que quedan van solos al otro. Se juega hasta la revelación.
  const revealTitle = (page: Page) => page.getByRole("heading", { name: "¿Qué compró cada uno?" });
  let moneyWentDown = false;
  for (let turn = 1; turn <= 80 && !(await revealTitle(ash.page).isVisible()); turn++) {
    const money = await misty.page.getByRole("group", { name: misty.name }).textContent({ timeout: 1000 }).catch(() => null);
    const moneyAsh = await misty.page.getByRole("group", { name: ash.name }).textContent({ timeout: 1000 }).catch(() => null);
    if (money !== null && moneyAsh !== null && !(money.includes("2.000.000") && moneyAsh.includes("2.000.000"))) moneyWentDown = true;
    const inTurn = await pageInTurn(pages, revealTitle);
    if (!inTurn) break;
    const bid = inTurn.getByRole("button", { name: /^(\+|Abrir)/ }).first();
    // Se alterna entre pujar y retirarse; hacer clic puede llegar tarde, y no pasa nada.
    if (turn % 3 === 0 && (await bid.isEnabled())) await bid.click({ timeout: 2000 }).catch(() => undefined);
    else await passButton(inTurn).click({ timeout: 2000 }).catch(() => undefined);
    await inTurn.waitForTimeout(100);
  }

  for (const page of pages) await expect(page.getByRole("heading", { name: "¿Qué compró cada uno?" })).toBeVisible({ timeout: 30_000 });
  expect(moneyWentDown, "el dinero baja al comprar").toBe(true);
  await ash.page.getByRole("button", { name: "Listo" }).click();
  await expect(ash.page.getByRole("button", { name: "Esperando al rival…" })).toBeDisabled();
  await misty.page.getByRole("button", { name: "Listo" }).click();

  // Alineación: uno cambia el orden, y el titular es el que eligió.
  for (const page of pages) await expect(page.getByRole("heading", { name: "Elige tu alineación" })).toBeVisible({ timeout: 15_000 });
  const firstUp = ash.page.getByRole("button", { name: /^Subir/ }).nth(1);
  const newTitular = ((await firstUp.getAttribute("aria-label")) ?? "").replace("Subir ", "");
  await firstUp.click();
  for (const page of pages) await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(ash.page.getByRole("meter", { name: `PS de ${newTitular}` })).toBeVisible({ timeout: 15_000 });
  await expectFits(ash.page, "combate");

  // Recargar en el combate vuelve al combate, con la barra.
  await misty.page.reload();
  await expect(misty.page.getByRole("meter").first()).toBeVisible({ timeout: 30_000 });

  // Se pelea hasta el final, eligiendo movimiento y titular. Recargar en la primera pausa la conserva.
  const verdict = (page: Page) => page.getByRole("heading", { name: /^(Ganaste|Perdiste)$/ });
  let reloadedInPause = false;
  for (let tick = 0; tick < 1500 && !(await verdict(ash.page).isVisible()); tick++) {
    for (const page of pages) {
      if (!reloadedInPause && (await page.getByRole("heading", { name: "Pausa entre asaltos" }).isVisible())) {
        reloadedInPause = true;
        await expectFits(page, "pausa");
        await page.reload();
        await expect(page.getByRole("heading", { name: "Pausa entre asaltos" })).toBeVisible({ timeout: 30_000 });
      }
      const move = page.getByRole("button", { name: /^(Ataque|Forcejeo)/ }).first();
      if (await move.isVisible()) await move.click({ timeout: 500 }).catch(() => undefined);
      const confirm = page.getByRole("button", { name: "Confirmar" });
      if (await confirm.isVisible()) {
        if (await confirm.isDisabled()) await page.getByRole("button", { name: /^Sacar a/ }).first().click({ timeout: 500 }).catch(() => undefined);
        await confirm.click({ timeout: 500 }).catch(() => undefined);
      }
    }
    await ash.page.waitForTimeout(150);
  }
  for (const page of pages) await expect(verdict(page)).toBeVisible({ timeout: 60_000 });
  expect(reloadedInPause, "hubo una pausa").toBe(true);
  await expect(ash.page.getByRole("region", { name: "Resumen del combate" })).toBeVisible();
  await expectFits(ash.page, "resumen");

  // Revancha: empieza de cero.
  await ash.page.getByRole("button", { name: "Revancha" }).click();
  await misty.page.getByRole("button", { name: "Aceptar" }).click();
  for (const page of pages) await expect(page.getByText("Lote 1 de 12", { exact: true })).toBeVisible({ timeout: 45_000 });
  for (const name of [ash.name, misty.name]) await expect(misty.page.getByRole("group", { name })).toContainText("2.000.000");
});

test("con «reducir movimiento», el destello del golpe sí dura", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  await ash.page.emulateMedia({ reducedMotion: "reduce" });
  await ash.page.goto("/");
  const duration = await ash.page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "battle-flash";
    document.body.append(probe);
    return getComputedStyle(probe).animationDuration;
  });
  expect(duration).toBe("0.3s");
});

test("el menú ofrece la subasta", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  await register(ash);
  await ash.page.goto("/");
  await ash.page.getByRole("article").filter({ hasText: "Subasta Pokémon" }).getByRole("link", { name: /Jugar/ }).click();
  await expect(ash.page.getByRole("switch", { name: "Siluetas trampa" })).toBeChecked();
});
