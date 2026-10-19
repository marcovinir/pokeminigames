import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";

export const PASSWORD = "pikachu-123";

interface SnapshotPokemon {
  types: string[];
  names: { es: string; en: string };
}
const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../server/data/catalog.snapshot.json", import.meta.url)), "utf8"),
) as { pokemon: SnapshotPokemon[] };

/**
 * Un Pokémon que tiene los dos tipos del par (el servidor garantiza que cada par tiene al menos dos). Con `skip` se salta
 * esos primeros: así dos personas pueden nombrar Pokémon distintos del mismo par.
 */
export function validAnswerFor(types: string[], skip = 0): string {
  const matches = snapshot.pokemon.filter((p) => p.types.length === 2 && types.every((type) => p.types.includes(type)));
  const found = matches[skip];
  if (!found) throw new Error(`No hay un Pokémon número ${skip + 1} con los tipos ${types.join(" y ")}`);
  return found.names.en;
}

/** Un chunk de un PNG: longitud, tipo, datos y CRC. */
function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Un PNG liso (gris) del tamaño pedido, sin dependencias: sirve de imagen falsa. */
function solidPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bits por canal
  header[9] = 6; // RGBA
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4, 0x99)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}

const POKEAPI_IMAGES = /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\//;
// Los iconos de tipo de PokeAPI son píldoras de 200 × 40; el resto de las imágenes (sprites y arte) las tratamos cuadradas.
const FAKE_TYPE_ICON = solidPng(200, 40);
const FAKE_SQUARE = solidPng(96, 96);

/**
 * Las imágenes de Pokémon vienen de GitHub (PokeAPI): la E2E no debe depender de la red ni de su velocidad (una carga lenta
 * alargaba el `load` de cada pantalla y agotaba plazos como los 15 s de «Elegir tipo»). Se sirven imágenes falsas del mismo
 * tamaño que las reales. Con `E2E_REAL_IMAGES=1` (o al generar capturas) se usan las de verdad.
 */
async function fakePokeApiImages(context: BrowserContext): Promise<void> {
  if (process.env.E2E_REAL_IMAGES || process.env.E2E_SCREENSHOTS) return;
  await context.route(POKEAPI_IMAGES, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: route.request().url().includes("/sprites/types/") ? FAKE_TYPE_ICON : FAKE_SQUARE }),
  );
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
  await fakePokeApiImages(context);
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

/**
 * Crea una sala con las opciones dadas y devuelve su código. Sin opciones es la de siempre: tipos aleatorios, 3 rondas y
 * sin pistas. Las opciones son casillas ocultas visualmente: se activan pulsando su texto, como lo haría una persona.
 */
export async function createRoom(
  page: Page,
  options: { rounds?: number; chosenTypes?: boolean; typeHints?: boolean } = {},
): Promise<string> {
  if (options.chosenTypes) await page.getByText("Elegido", { exact: true }).click();
  if (options.typeHints) {
    await page.getByText("Pistas de tipos", { exact: true }).click();
    await expect(page.getByRole("switch", { name: "Pistas de tipos" })).toBeChecked();
  }
  if (options.rounds !== undefined) {
    await page.getByLabel("Largo de la partida").selectOption("custom-rounds");
    await page.getByLabel("Máximo de rondas").fill(String(options.rounds));
  }
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
