import { type PokedexEntry, type TypeName, normalizeName } from "@pokemon-minigames/shared";
import { parseTypeSelection, typeSelectionParams } from "../types/type-selection";

/** Cuántas tarjetas se ven de una vez: 1025 imágenes de golpe serían demasiado en datos móviles. */
export const DEX_PAGE_SIZE = 60;

export const DEX_SORTS = ["numero", "nombre", "total"] as const;
export type DexSort = (typeof DEX_SORTS)[number];

const GENERATIONS = 9;

export interface PokedexQuery {
  q: string;
  types: TypeName[];
  generation: number | null;
  sort: DexSort;
  visible: number;
}

const wholeNumber = (value: string | null): number | null => (value !== null && /^\d+$/.test(value) ? Number(value) : null);

/** Los filtros según la dirección: lo desconocido se ignora. */
export function parsePokedexQuery(params: URLSearchParams): PokedexQuery {
  const generation = wholeNumber(params.get("gen"));
  const sort = params.get("orden") as DexSort | null;
  const visible = wholeNumber(params.get("ver"));
  return {
    q: params.get("q") ?? "",
    types: parseTypeSelection(params),
    generation: generation !== null && generation >= 1 && generation <= GENERATIONS ? generation : null,
    sort: sort !== null && DEX_SORTS.includes(sort) ? sort : "numero",
    visible: visible !== null && visible >= DEX_PAGE_SIZE ? visible : DEX_PAGE_SIZE,
  };
}

/** La dirección de unos filtros, sin lo que vale por defecto. */
export function pokedexQueryParams(query: PokedexQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  typeSelectionParams(query.types).forEach((value, key) => params.set(key, value));
  if (query.generation !== null) params.set("gen", String(query.generation));
  if (query.sort !== "numero") params.set("orden", query.sort);
  if (query.visible !== DEX_PAGE_SIZE) params.set("ver", String(query.visible));
  return params;
}

function matchesText(entry: PokedexEntry, text: string): boolean {
  const number = /^#?(\d+)$/.exec(text.trim());
  if (number) return entry.id === Number(number[1]);
  if (text.trim() === "") return true;
  // ♀ y ♂ se normalizan a una letra: buscarlos encontraría a todos los que la tienen.
  if (/[♀♂]/.test(text)) return entry.names.es.includes(text.trim()) || entry.names.en.includes(text.trim());
  const wanted = normalizeName(text);
  return wanted !== "" && (normalizeName(entry.names.es).includes(wanted) || normalizeName(entry.names.en).includes(wanted));
}

const COMPARE: Record<DexSort, (a: PokedexEntry, b: PokedexEntry) => number> = {
  numero: (a, b) => a.id - b.id,
  nombre: (a, b) => a.names.es.localeCompare(b.names.es, "es") || a.id - b.id,
  total: (a, b) => b.total - a.total || a.id - b.id,
};

export function filterPokedex(entries: readonly PokedexEntry[], query: PokedexQuery): PokedexEntry[] {
  return entries
    .filter((entry) => matchesText(entry, query.q))
    .filter((entry) => query.types.every((type) => entry.types.includes(type)))
    .filter((entry) => query.generation === null || entry.generation === query.generation)
    .sort(COMPARE[query.sort]);
}
