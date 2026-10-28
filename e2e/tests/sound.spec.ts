import { expect, test } from "@playwright/test";
import { answer, createOneRoundRoom, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

/**
 * El audio no se oye en una prueba, pero sí qué música se pidió: la aplicación anota la zona en `<html data-music>`.
 * Una partida completa entre dos navegadores pasa de la sala al combate y al final, el aviso del rival se ve, el panel de
 * sonido recuerda lo elegido al recargar, y nada de esto deja errores en la consola.
 */
test("la música sigue a la partida, el rival avisa al responder y el panel de sonido se recuerda", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  const errors: string[] = [];
  for (const page of [ash.page, misty.page]) page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  const music = (page: typeof ash.page) => expect(page.locator("html"));
  try {
    await register(ash);
    await register(misty);
    await music(ash.page).toHaveAttribute("data-music", "lobby");

    const code = await createOneRoundRoom(ash.page);
    await joinRoom(misty.page, code);
    const types = await roundTypes(ash.page);
    await roundTypes(misty.page);
    await music(ash.page).toHaveAttribute("data-music", "battle");
    await music(misty.page).toHaveAttribute("data-music", "battle");

    await answer(ash.page, validAnswerFor(types));
    await expect(misty.page.getByText("Tu rival ya respondió")).toBeVisible();
    await answer(misty.page, "zzzzzz");

    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });
    await music(ash.page).toHaveAttribute("data-music", "final");
    await music(misty.page).toHaveAttribute("data-music", "final");

    // Apagar la música desde el panel se recuerda al recargar.
    await ash.page.getByRole("button", { name: "Sonido" }).click();
    await ash.page.getByRole("switch", { name: "Música" }).uncheck();
    await ash.page.reload();
    await ash.page.getByRole("button", { name: /Sonido/ }).click();
    await expect(ash.page.getByRole("switch", { name: "Música" })).not.toBeChecked();
    await expect(ash.page.getByRole("switch", { name: "Efectos" })).toBeChecked();

    expect(errors).toEqual([]);
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});
