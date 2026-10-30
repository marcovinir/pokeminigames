import { type Locator, type Page, expect, test } from "@playwright/test";
import { contrastRatio } from "../../client/src/theme/contrast";
import { newPlayer } from "../support/app";

/**
 * El aro del foco del teclado se mide en un navegador de verdad, en los 4 temas y modos: debe distinguirse (3:1) del fondo
 * sobre el que cae. En el encabezado de Pokédex claro el aro del tema era del mismo rojo que el encabezado y no se veía.
 */

const hex = (channel: string): string => Number(channel).toString(16).padStart(2, "0");
/** `rgb(31, 95, 191)` → `#1f5fbf`. Solo entiende colores sólidos, que es lo que usan el aro de foco y los fondos. */
function toHex(color: string): string {
  const match = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color);
  if (!match) throw new Error(`Color que la prueba no sabe medir: ${color}`);
  return `#${hex(match[1]!)}${hex(match[2]!)}${hex(match[3]!)}`;
}

/** Pone el tema y el modo antes de que cargue la página (la misma preferencia que guarda el menú de apariencia). */
async function useTheme(page: Page, theme: "clasico" | "pokedex", mode: "claro" | "oscuro"): Promise<void> {
  await page.addInitScript(([value]) => localStorage.setItem("pokemon-minigames:theme", value as string), [JSON.stringify({ theme, mode })]);
}

/** El color y el grosor del aro del elemento enfocado, y el fondo del contenedor sobre el que cae. */
async function ringOf(target: Locator, container: string) {
  return target.evaluate((element, selector) => {
    const style = getComputedStyle(element);
    return {
      outline: style.outlineColor,
      width: style.outlineWidth,
      backdrop: getComputedStyle(element.closest(selector) ?? document.body).backgroundColor,
    };
  }, container);
}

/** Lleva el foco al elemento con el teclado (así `:focus-visible` se cumple siempre). */
async function focusWithKeyboard(page: Page, target: Locator): Promise<void> {
  await target.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
}

const COMBINATIONS = [
  ["clasico", "claro"],
  ["clasico", "oscuro"],
  ["pokedex", "claro"],
  ["pokedex", "oscuro"],
] as const;

for (const [theme, mode] of COMBINATIONS) {
  test(`${theme} ${mode}: el foco del teclado se ve en el encabezado y en el formulario`, async ({ browser }) => {
    const visitor = await newPlayer(browser, "foco");
    try {
      await visitor.page.setViewportSize({ width: 1280, height: 720 });
      await useTheme(visitor.page, theme, mode);
      await visitor.page.goto("/login");
      await expect(visitor.page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();

      // Encabezado: el botón de apariencia enfocado con el teclado.
      const toggle = visitor.page.getByRole("button", { name: "Menú", exact: true });
      await focusWithKeyboard(visitor.page, toggle);
      const inHeader = await ringOf(toggle, "header");
      expect(inHeader.width).not.toBe("0px");
      const headerContrast = contrastRatio(toHex(inHeader.outline), toHex(inHeader.backdrop));
      expect.soft(headerContrast, `encabezado: aro ${inHeader.outline} sobre ${inHeader.backdrop} = ${headerContrast.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);

      // Formulario: el campo de email enfocado, sobre la tarjeta.
      const email = visitor.page.getByLabel("Email");
      await focusWithKeyboard(visitor.page, email);
      const inForm = await ringOf(email, "section");
      expect(inForm.width).not.toBe("0px");
      const formContrast = contrastRatio(toHex(inForm.outline), toHex(inForm.backdrop));
      expect.soft(formContrast, `formulario: aro ${inForm.outline} sobre ${inForm.backdrop} = ${formContrast.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    } finally {
      await visitor.context.close();
    }
  });
}
