import { type PokedexEntry, TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigationType, useSearchParams } from "react-router";
import { pokedexNumber } from "../../catalog/pokedex";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Notice } from "../../components/Notice";
import { PlayPrompt } from "../../components/PlayPrompt";
import { TypeChip } from "../../components/TypeChip";
import { TypeSelect } from "../../components/TypeSelect";
import { rise } from "../../components/rise";
import { POKEDEX_TEXT } from "../../i18n/es";
import { useServices } from "../../services";
import { DEX_PAGE_SIZE, DEX_SORTS, type DexSort, filterPokedex, parsePokedexQuery, pokedexQueryParams } from "./pokedex-filter";

const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const scrollKey = (search: string) => `pokedex-scroll:${search}`;

function readScroll(key: string): number | null {
  try {
    const saved = sessionStorage.getItem(key);
    return saved === null ? null : Number(saved);
  } catch {
    return null;
  }
}

function saveScroll(key: string, value: number): void {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    // Sin almacenamiento, al volver se empieza desde arriba.
  }
}

function PokemonTile({ pokemon, fromSearch, onOpen }: { pokemon: PokedexEntry; fromSearch: string; onOpen: () => void }) {
  return (
    <li className="min-w-0">
      <Link to={`/pokedex/${pokemon.id}`} state={{ fromSearch }} onClick={onOpen} className="framed flex h-full flex-col items-center gap-1 rounded-card bg-surface p-3 text-center shadow-card hover:bg-surface-2">
        <img src={pokemon.spriteUrl} alt="" loading="lazy" decoding="async" width={72} height={72} className="size-18" />
        <span className="font-num text-xs text-muted">{pokedexNumber(pokemon.id)}</span>
        <span className="max-w-full font-display font-semibold [overflow-wrap:anywhere]">{pokemon.names.es}</span>
        <span className="flex flex-wrap justify-center gap-1">
          {pokemon.types.map((type) => (
            <TypeChip key={type} type={type} />
          ))}
        </span>
      </Link>
    </li>
  );
}

/** La lista de la Pokédex: pública. Los filtros viven en la dirección, para poder compartirlos y volver a ellos. */
export function PokedexPage() {
  const { endpoints } = useServices();
  const [params, setParams] = useSearchParams();
  const navigationType = useNavigationType();
  const { search, state } = useLocation();
  // La posición guardada es de quien vuelve (Atrás, recargar o «Volver a la Pokédex»): entrar por otro enlace empieza arriba.
  const returning = navigationType === "POP" || (state as { restoreScroll?: boolean } | null)?.restoreScroll === true;
  const [entries, setEntries] = useState<PokedexEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const searchId = useId();
  const sortId = useId();
  const query = parsePokedexQuery(params);
  const requested = useRef(params);
  // El campo lleva su propio texto: si dependiera de la transición, escribir rápido perdería letras.
  const [text, setText] = useState(query.q);

  // Lo que no viene de estos filtros (el enlace del encabezado, Atrás) manda sobre lo pedido.
  useEffect(() => {
    if (navigationType === "REPLACE") return;
    requested.current = params;
    setText(parsePokedexQuery(params).q);
  }, [params, navigationType]);
  const matches = useMemo(() => (entries ? filterPokedex(entries, parsePokedexQuery(params)) : []), [entries, params]);

  const load = useCallback(() => {
    setFailed(false);
    endpoints.catalog.dex().then(setEntries, () => setFailed(true));
  }, [endpoints]);
  useEffect(load, [load]);

  // Al volver de una ficha, una sola vez, cuando la lista ya está pintada.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (!entries || restored.current) return;
    restored.current = true;
    const saved = readScroll(scrollKey(search));
    if (returning && saved !== null) window.scrollTo(0, saved);
  }, [entries, search, returning]);

  // Sin apilar historial: «Atrás» sale de la lista en vez de deshacer cada filtro. Cambiar un filtro vuelve a la primera tanda.
  // React Router pinta la dirección nueva en una transición, así que dos cambios muy seguidos verían filtros viejos y el
  // segundo desharía el primero: los cambios parten de lo último pedido, no de lo último pintado.
  const change = (changes: Partial<typeof query>) => {
    const next = pokedexQueryParams({ ...parsePokedexQuery(requested.current), visible: DEX_PAGE_SIZE, ...changes });
    requested.current = next;
    setParams(next, { replace: true });
  };
  const [first, second] = query.types;
  const chooseTypes = (types: (TypeName | undefined)[]) => change({ types: [...new Set(types.filter((type) => type !== undefined && TYPE_NAMES.includes(type)))] as TypeName[] });

  return (
    <div style={rise(0)} className="animate-rise mx-auto flex max-w-4xl flex-col gap-5">
      <h1 className="font-display text-3xl font-semibold">{POKEDEX_TEXT.title}</h1>
      <PlayPrompt />
      <div role="group" aria-label={POKEDEX_TEXT.generation} className="flex flex-wrap gap-1.5">
        {[null, ...GENERATIONS].map((generation) => (
          <button
            key={generation ?? "todas"}
            type="button"
            aria-pressed={query.generation === generation}
            onClick={() => change({ generation })}
            className={`rounded-pill px-3 py-1.5 font-display text-sm font-semibold ${query.generation === generation ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg hover:bg-surface"}`}
          >
            {generation === null ? POKEDEX_TEXT.allGenerations : POKEDEX_TEXT.generationTab(generation)}
          </button>
        ))}
      </div>
      <Card as="section" aria-label={POKEDEX_TEXT.filters} className="flex flex-wrap gap-3 p-5">
        <div className="w-full">
          <label htmlFor={searchId} className="mb-1 block text-sm font-semibold">
            {POKEDEX_TEXT.search}
          </label>
          <input
            id={searchId}
            type="search"
            value={text}
            placeholder={POKEDEX_TEXT.searchHint}
            onChange={(event) => {
              setText(event.target.value);
              change({ q: event.target.value });
            }}
            className="framed-field w-full rounded-ui bg-surface px-4 py-3 text-fg"
          />
        </div>
        <TypeSelect label={POKEDEX_TEXT.firstType} value={first} onChange={(type) => chooseTypes([type, second])} />
        <TypeSelect label={POKEDEX_TEXT.secondType} value={second} disabled={!first} exclude={first} onChange={(type) => chooseTypes([first, type])} />
        <div className="min-w-40 flex-1">
          <label htmlFor={sortId} className="mb-1 block text-sm font-semibold">
            {POKEDEX_TEXT.sort}
          </label>
          <select id={sortId} value={query.sort} onChange={(event) => change({ sort: event.target.value as DexSort })} className="framed-field w-full rounded-ui bg-surface px-4 py-3 text-fg">
            {DEX_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {POKEDEX_TEXT.sorts[sort]}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {failed ? (
        <Notice tone="danger" action={<Button onClick={load}>{POKEDEX_TEXT.retry}</Button>}>
          {POKEDEX_TEXT.loadError}
        </Notice>
      ) : !entries ? (
        <p role="status" className="text-center text-muted">
          {POKEDEX_TEXT.loading}
        </p>
      ) : matches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p>{POKEDEX_TEXT.noMatches}</p>
          <Button
            onClick={() => {
              setText("");
              requested.current = new URLSearchParams();
              setParams(requested.current, { replace: true });
            }}
          >{POKEDEX_TEXT.clearFilters}</Button>
        </div>
      ) : (
        <>
          <ul aria-label={POKEDEX_TEXT.listLabel} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {matches.slice(0, query.visible).map((pokemon) => (
              <PokemonTile key={pokemon.id} pokemon={pokemon} fromSearch={search} onOpen={() => saveScroll(scrollKey(search), window.scrollY)} />
            ))}
          </ul>
          {query.visible < matches.length ? (
            <div className="flex justify-center">
              <Button onClick={() => change({ visible: query.visible + DEX_PAGE_SIZE })}>{POKEDEX_TEXT.showMore}</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
