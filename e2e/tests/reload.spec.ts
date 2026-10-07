import { expect, test } from "@playwright/test";
import { answer, createOneRoundRoom, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

test("recargar la página en plena ronda recupera la partida", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    const code = await createOneRoundRoom(ash.page);
    await joinRoom(misty.page, code);

    const types = await roundTypes(ash.page);
    await roundTypes(misty.page);

    // Ash recarga con la ronda en marcha: el navegador pierde todo salvo la cookie de sesión.
    await ash.page.reload();
    await expect(ash.page).toHaveURL(new RegExp(`/sala/${code}$`));
    expect(await roundTypes(ash.page)).toEqual(types);
    await expect(ash.page.getByRole("timer")).toBeVisible();
    await expect(ash.page.getByRole("combobox", { name: "Nombre del Pokémon" })).toBeEnabled();

    // La partida sigue su curso y termina con normalidad.
    await answer(ash.page, validAnswerFor(types));
    await answer(misty.page, "zzzzzz");
    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });
    await expect(misty.page.getByRole("heading", { name: "Perdiste" })).toBeVisible({ timeout: 30_000 });
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});
