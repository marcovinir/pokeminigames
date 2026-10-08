import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";

export const PASSWORD = "pikachu-123";

interface SnapshotPokemon {
  types: string[];
  names: { es: string; en: string };
}
const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../server/data/catalog.snapshot.json", import.meta.url)), "utf8"),
) as { pokemon: SnapshotPokemon[] };

/** Un Pokémon que tiene los dos tipos del par (el servidor garantiza que cada par tiene al menos dos). */
export function validAnswerFor(types: string[]): string {
  const found = snapshot.pokemon.find((p) => p.types.length === 2 && types.every((type) => p.types.includes(type)));
  if (!found) throw new Error(`No hay ningún Pokémon con los tipos ${types.join(" y ")}`);
  return found.names.en;
}

export interface Player {
  name: string;
  email: string;
  ip: string;
  context: BrowserContext;
  page: Page;
}

/**
 * Una persona con su propio navegador limpio. El servidor de la prueba está configurado como en Render (detrás de un
 * proxy: `TRUST_PROXY=1`) y los límites de peticiones son por IP; cada persona manda una IP distinta en `X-Forwarded-For`
 * para que las pruebas no compartan límites.
 */
export async function newPlayer(browser: Browser, label: string): Promise<Player> {
  const name = `${label}_${randomInt(10_000, 99_999)}`;
  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": ip } });
  const page = await context.newPage();
  return { name, email: `${name}@example.com`, ip, context, page };
}

/** Rellena el registro y llega a la pantalla del código: la cuenta queda creada pero sin verificar. */
export async function startRegistration({ page, name, email }: Player): Promise<void> {
  await page.goto("/registro");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Nombre de usuario").fill(name);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Verifica tu correo" })).toBeVisible();
}

interface MailboxMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Los correos que el servidor de la prueba «envió» a esa dirección, del más antiguo al más reciente. El servidor de la
 * E2E usa `MAIL_PROVIDER=memory` y guarda los mensajes en vez de enviarlos; esta ruta solo existe así.
 */
export async function mailbox(context: BrowserContext, email: string): Promise<MailboxMessage[]> {
  const response = await context.request.get(`/auth/test-outbox?to=${encodeURIComponent(email)}`);
  expect(response.ok(), "el buzón de pruebas no responde (¿el servidor de la E2E tiene MAIL_PROVIDER=memory?)").toBe(true);
  return ((await response.json()) as { messages: MailboxMessage[] }).messages;
}

/**
 * El código del último correo que llegó a la dirección de la persona. Espera a que haya más de `after` correos: el
 * registro envía antes de contestar, pero «olvidé mi contraseña» y «reenviar» envían en segundo plano.
 */
export async function codeFor(player: Player, after = 0): Promise<string> {
  let text = "";
  await expect
    .poll(
      async () => {
        const messages = await mailbox(player.context, player.email);
        text = messages.at(-1)?.text ?? "";
        return messages.length;
      },
      { message: `no llegó ningún correo con el código a ${player.email}` },
    )
    .toBeGreaterThan(after);
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  if (!code) throw new Error(`El correo no trae un código de seis dígitos:\n${text}`);
  return code;
}

/** Un código de seis dígitos que no es el verdadero. */
export function wrongCode(real: string): string {
  return real === "000000" ? "111111" : "000000";
}

/** Escribe el código en la pantalla de verificar el correo y pulsa «Verificar». */
export async function enterCode(page: Page, code: string): Promise<void> {
  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Verificar", exact: true }).click();
}

/** Crea la cuenta y la verifica con el código del correo; termina dentro del lobby. */
export async function register(player: Player): Promise<void> {
  await startRegistration(player);
  await enterCode(player.page, await codeFor(player));
  await expect(player.page.getByRole("heading", { name: "Lobby" })).toBeVisible();
}

export async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Crea una sala aleatoria con ese número de rondas y devuelve su código. */
export async function createRoomWithRounds(page: Page, rounds: number): Promise<string> {
  await page.getByLabel("Largo de la partida").selectOption("custom-rounds");
  await page.getByLabel("Máximo de rondas").fill(String(rounds));
  await page.getByRole("button", { name: "Crear sala" }).click();
  const code = page.getByLabel("Código de la sala");
  await expect(code).toBeVisible();
  return ((await code.textContent()) ?? "").trim();
}

/** Crea una sala aleatoria de una sola ronda y devuelve su código. */
export function createOneRoundRoom(page: Page): Promise<string> {
  return createRoomWithRounds(page, 1);
}

export async function joinRoom(page: Page, code: string): Promise<void> {
  await page.getByLabel("Código de sala").fill(code);
  await page.getByRole("button", { name: "Unirse" }).click();
}

/** Espera a que empiece la ronda y devuelve los dos tipos (en inglés) que se enfrentan. */
export async function roundTypes(page: Page): Promise<string[]> {
  const pair = page.getByLabel("Par de tipos");
  await expect(pair).toBeVisible({ timeout: 30_000 });
  return pair.locator("[data-type]").evaluateAll((chips) => chips.map((chip) => (chip as HTMLElement).dataset.type ?? ""));
}

export async function answer(page: Page, text: string): Promise<void> {
  const field = page.getByRole("combobox", { name: "Nombre del Pokémon" });
  await field.fill(text);
  await field.press("Enter");
}

/** El valor que acompaña a una etiqueta de las estadísticas del perfil ("Partidas" → "1"). */
export function fact(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
}
