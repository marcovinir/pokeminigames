/** Luminancia relativa de un color `#rrggbb` (WCAG 2.x). */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Color inválido: ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** Relación de contraste entre dos colores, de 1 (iguales) a 21 (blanco sobre negro). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#111111";

/** El texto (blanco o casi negro) que mejor se lee sobre un fondo: siempre supera 4,5:1. */
export function readableOn(background: string): string {
  return contrastRatio(LIGHT_TEXT, background) >= contrastRatio(DARK_TEXT, background) ? LIGHT_TEXT : DARK_TEXT;
}
