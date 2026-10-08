import { type Page, expect, test } from "@playwright/test";
import { PASSWORD, codeFor, enterCode, logIn, mailbox, newPlayer, register, startRegistration, wrongCode } from "../support/app";

/**
 * Las cuentas con código por correo, en un navegador real. El servidor de la prueba corre con `EMAIL_VERIFICATION=on` y
 * `MAIL_PROVIDER=memory`: los correos no salen de la máquina y el código se lee del buzón de pruebas.
 */

const WRONG_CODE_MESSAGE = "Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.";
const TEN_MINUTE_BLOCK = /^Demasiados intentos\. Inténtalo de nuevo en (9|10) min\.$/;
const NEW_PASSWORD = "squirtle-456";

/** Escribe el código en la pantalla de verificar el correo, lo envía y devuelve el estado HTTP que contestó el servidor. */
async function submitVerification(page: Page, code: string): Promise<number> {
  const reply = page.waitForResponse((r) => r.url().endsWith("/auth/verify-email"));
  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Verificar", exact: true }).click();
  return (await reply).status();
}

/** Escribe el código y la contraseña nueva en la pantalla de restablecer, los envía y devuelve el estado HTTP. */
async function submitReset(page: Page, code: string): Promise<number> {
  const reply = page.waitForResponse((r) => r.url().endsWith("/auth/password/reset"));
  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByLabel("Nueva contraseña").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  return (await reply).status();
}

test("registrarse pide el código que llega por correo: uno equivocado no abre la cuenta y el verdadero solo sirve una vez", async ({ browser }) => {
  const ash = await newPlayer(browser, "verifica");
  // Otro navegador y la misma IP: así se comprueba el código, no una cookie ni el estado de la pantalla.
  const stranger = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": ash.ip } });
  try {
    await startRegistration(ash);
    await expect(ash.page.getByText(`Te enviamos un código de 6 dígitos a ${ash.email}.`)).toBeVisible();
    // El servidor deja un código nuevo por correo cada 60 s: hasta entonces el botón espera.
    await expect(ash.page.getByRole("button", { name: /^Reenviar código \(espera \d+ s\)$/ })).toBeDisabled();

    const code = await codeFor(ash);
    await enterCode(ash.page, wrongCode(code));
    await expect(ash.page.getByRole("alert")).toHaveText(WRONG_CODE_MESSAGE);
    await expect(ash.page).toHaveURL(/\/verificar$/);

    await enterCode(ash.page, code);
    await expect(ash.page.getByRole("heading", { name: "Lobby" })).toBeVisible();

    // Un código vale una sola vez: usarlo de nuevo recibe el mismo rechazo de siempre.
    const page = await stranger.newPage();
    await page.goto("/verificar");
    await page.getByLabel("Email").fill(ash.email);
    await enterCode(page, code);
    await expect(page.getByRole("alert")).toHaveText(WRONG_CODE_MESSAGE);
  } finally {
    await ash.context.close();
    await stranger.close();
  }
});

test("una cuenta sin verificar no entra con la contraseña: el acceso lleva a verificar y el código del registro sirve", async ({ browser }) => {
  const pending = await newPlayer(browser, "pendiente");
  const later = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": pending.ip } });
  try {
    await startRegistration(pending);
    const code = await codeFor(pending);

    const page = await later.newPage();
    await logIn(page, pending.email, PASSWORD);
    await expect(page.getByRole("heading", { name: "Verifica tu correo" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Tu correo aún no está verificado. Te enviamos un código.");
    await expect(page.getByText(`Te enviamos un código de 6 dígitos a ${pending.email}.`)).toBeVisible();

    // Dentro del minuto de espera no sale otro correo: el código del registro sigue valiendo.
    await enterCode(page, code);
    await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
  } finally {
    await pending.context.close();
    await later.close();
  }
});

test("cinco códigos equivocados bloquean la comprobación, aunque el sexto lleve el código verdadero y venga de otra IP", async ({ browser }) => {
  const pending = await newPlayer(browser, "bloqueo");
  const elsewhere = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "10.250.251.252" } });
  try {
    await startRegistration(pending);
    const code = await codeFor(pending);

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await submitVerification(pending.page, wrongCode(code))).toBe(400);
      await expect(pending.page.getByRole("alert")).toHaveText(WRONG_CODE_MESSAGE);
    }

    // El sexto, ya con el código verdadero, está bloqueado: ni siquiera se mira el código.
    expect(await submitVerification(pending.page, code)).toBe(429);
    await expect(pending.page.getByRole("alert")).toHaveText(TEN_MINUTE_BLOCK);
    await expect(pending.page.getByRole("heading", { name: "Verifica tu correo" })).toBeVisible();

    // El límite es del correo, no de la IP: desde otra IP el código verdadero tampoco se comprueba.
    const page = await elsewhere.newPage();
    await page.goto("/verificar");
    await page.getByLabel("Email").fill(pending.email);
    expect(await submitVerification(page, code)).toBe(429);
  } finally {
    await pending.context.close();
    await elsewhere.close();
  }
});

test("el cambio de contraseña tiene el mismo bloqueo, y un correo sin cuenta contesta igual que uno con cuenta", async ({ browser }) => {
  // Nunca se registra: no hay cuenta ni código, y aun así cada intento recibe el mismo rechazo y el sexto el mismo bloqueo.
  const ghost = await newPlayer(browser, "fantasma");
  try {
    await ghost.page.goto("/restablecer");
    await ghost.page.getByLabel("Email").fill(ghost.email);

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await submitReset(ghost.page, "123456")).toBe(400);
      await expect(ghost.page.getByRole("alert")).toHaveText(WRONG_CODE_MESSAGE);
    }
    expect(await submitReset(ghost.page, "123456")).toBe(429);
    await expect(ghost.page.getByRole("alert")).toHaveText(TEN_MINUTE_BLOCK);
    expect(await mailbox(ghost.context, ghost.email)).toEqual([]);
  } finally {
    await ghost.context.close();
  }
});

test("«olvidé mi contraseña»: el código cambia la contraseña, la anterior deja de servir y las sesiones abiertas se cierran", async ({ browser }) => {
  // El registro acaba de enviar un código a este correo y el servidor deja 60 s entre dos envíos: la prueba espera ese minuto.
  test.setTimeout(150_000);
  const owner = await newPlayer(browser, "olvido");
  const phone = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": owner.ip } });
  try {
    await register(owner);
    const alreadySent = (await mailbox(owner.context, owner.email)).length;

    const page = await phone.newPage();
    await page.goto("/login");
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await expect(page.getByRole("heading", { name: "Recupera tu contraseña" })).toBeVisible();
    await page.getByLabel("Email").fill(owner.email);
    await page.getByRole("button", { name: "Enviar código" }).click();

    // Pedirlo antes de tiempo no lo envía y la pantalla dice cuánto falta.
    const early = page.getByRole("alert");
    await expect(early).toHaveText(/^Demasiados intentos\. Inténtalo de nuevo en \d+ (s|min)\.$/);
    await expect(page.getByRole("heading", { name: "Recupera tu contraseña" })).toBeVisible();
    const [, amount, unit] = /en (\d+) (s|min)\./.exec((await early.textContent()) ?? "") ?? [];
    await page.waitForTimeout((Number(amount) * (unit === "min" ? 60 : 1) + 1) * 1000);

    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page.getByRole("heading", { name: "Nueva contraseña" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Si existe una cuenta con ese correo, te enviamos un código.");

    await page.getByLabel("Código", { exact: true }).fill(await codeFor(owner, alreadySent));
    await page.getByLabel("Nueva contraseña").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Contraseña cambiada. Inicia sesión con la nueva.");

    // Cambiar la contraseña no inicia sesión: hay que entrar con la nueva, y la de antes ya no sirve.
    await logIn(page, owner.email, PASSWORD);
    await expect(page.getByRole("alert")).toHaveText("Email o contraseña incorrectos.");
    await logIn(page, owner.email, NEW_PASSWORD);
    await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();

    // La sesión que ya estaba abierta en el otro navegador se cerró con el cambio.
    await owner.page.reload();
    await expect(owner.page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  } finally {
    await owner.context.close();
    await phone.close();
  }
});
