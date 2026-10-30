import { expect, test } from "@playwright/test";
import { answer, createOneRoundRoom, fact, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

test("dos personas juegan una partida completa y el perfil de cada una la cuenta", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);

    const code = await createOneRoundRoom(ash.page);
    await joinRoom(misty.page, code);

    // La cuenta atrás de 5 s y la ronda empiezan solas cuando están los dos.
    const types = await roundTypes(ash.page);
    expect(types).toHaveLength(2);
    expect(await roundTypes(misty.page)).toEqual(types);

    // Ash acierta; Misty responde algo que no existe, y eso cierra la ronda al instante.
    await answer(ash.page, validAnswerFor(types));
    await answer(misty.page, "zzzzzz");

    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });
    await expect(misty.page.getByRole("heading", { name: "Perdiste" })).toBeVisible({ timeout: 30_000 });

    // Desde el resumen, Misty abre el perfil de su rival: solo estadísticas, sin historial.
    await misty.page.getByRole("button", { name: `Ver perfil de ${ash.name}` }).click();
    await expect(misty.page.getByRole("heading", { name: ash.name })).toBeVisible();
    await expect(fact(misty.page, "Ganadas")).toHaveText("1");
    await expect(misty.page.getByRole("heading", { name: "Historial" })).toHaveCount(0);

    // El perfil propio de cada una cuenta la partida.
    await ash.page.getByRole("button", { name: "Menú", exact: true }).click();
    await ash.page.getByRole("link", { name: "Mi perfil" }).click();
    await expect(ash.page.getByRole("heading", { name: "Tu perfil" })).toBeVisible();
    await expect(fact(ash.page, "Partidas")).toHaveText("1");
    await expect(fact(ash.page, "Ganadas")).toHaveText("1");
    await expect(ash.page.getByRole("list", { name: "Historial de partidas" }).getByRole("listitem")).toHaveCount(1);

    await misty.page.getByRole("button", { name: "Menú", exact: true }).click();
    await misty.page.getByRole("link", { name: "Mi perfil" }).click();
    await expect(fact(misty.page, "Partidas")).toHaveText("1");
    await expect(fact(misty.page, "Perdidas")).toHaveText("1");
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});
