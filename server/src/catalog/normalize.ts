/**
 * Forma canónica para comparar nombres de Pokémon: minúsculas, sin tildes y sin signos.
 * "Nidoran♀" → "nidoranf", "Mr. Mime" → "mrmime", "Flabébé" → "flabebe".
 */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll("♀", "f")
    .replaceAll("♂", "m")
    .replace(/[^a-z0-9]/g, "");
}
