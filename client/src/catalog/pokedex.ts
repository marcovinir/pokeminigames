/** El número de Pokédex como se muestra en pantalla: con `#` y al menos tres cifras (`#025`, `#1025`). */
export function pokedexNumber(id: number): string {
  if (!Number.isInteger(id) || id < 1) throw new RangeError(`Número de Pokédex inválido: ${id}`);
  return `#${String(id).padStart(3, "0")}`;
}
