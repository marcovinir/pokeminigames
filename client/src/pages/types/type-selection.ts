import { TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";

const isType = (value: string | null): value is TypeName => (TYPE_NAMES as readonly (string | null)[]).includes(value);

/** Los tipos elegidos según la dirección: hasta dos, válidos y distintos. Lo desconocido se ignora y el segundo sube si falta el primero. */
export function parseTypeSelection(params: URLSearchParams): TypeName[] {
  return [...new Set([params.get("tipo1"), params.get("tipo2")].filter(isType))];
}

/** La dirección de una selección. */
export function typeSelectionParams(types: readonly TypeName[]): URLSearchParams {
  const params = new URLSearchParams();
  types.forEach((type, index) => params.set(`tipo${index + 1}`, type));
  return params;
}
