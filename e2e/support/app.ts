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

export async function register({ page, name, email }: Player): Promise<void> {
  await page.goto("/registro");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Nombre de usuario").fill(name);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
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
