import { TYPE_NAMES, normalizeName } from "@pokemon-minigames/shared";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import type { PokemonName } from "../api/types";
import { spriteUrl } from "../catalog/artwork";
import { pokedexNumber } from "../catalog/pokedex";
import { ArtImage } from "./ArtImage";
import { Button } from "./Button";
import { TypeChip } from "./TypeChip";

const MAX_SUGGESTIONS = 6;
const MAX_LENGTH = 100;

export interface IndexedName {
  name: PokemonName;
  es: string;
  en: string;
}

/** Normaliza los nombres una sola vez para no repetirlo en cada tecla. */
export function buildIndex(names: PokemonName[]): IndexedName[] {
  return names.map((name) => ({ name, es: normalizeName(name.es), en: normalizeName(name.en) }));
}

/**
 * Sugerencias para lo que se ha escrito: nombres en español o inglés que empiezan por ello, sin
 * tildes ni mayúsculas. No filtra por tipo: los tipos, si la sala los permite, solo se muestran.
 */
export function suggest(index: IndexedName[], query: string, limit = MAX_SUGGESTIONS): PokemonName[] {
  const q = normalizeName(query);
  if (!q) return [];
  return index
    .filter((entry) => entry.es.startsWith(q) || entry.en.startsWith(q))
    .slice(0, limit)
    .map((entry) => entry.name);
}

export interface AutocompleteProps {
  names: PokemonName[];
  /** Muestra los tipos de cada sugerencia (la opción «Pistas de tipos» de la sala). Sin ella nunca salen, aunque la lista los traiga. */
  showTypes?: boolean;
  /** Imagen y número de cada sugerencia (por defecto, sí). En la silueta van solo los nombres: la imagen delataría la respuesta. */
  showSprites?: boolean;
  onSubmit(text: string): void;
  /** Ya se envió la respuesta de esta ronda: el campo queda bloqueado. */
  submitted?: boolean;
  disabled?: boolean;
  /** Lleva el foco al campo al montarse (en la ronda hay solo 15 s para escribir). */
  autoFocus?: boolean;
}

/**
 * Campo de respuesta con lista de sugerencias (patrón combobox accesible). Enter envía lo
 * escrito, o la sugerencia resaltada con las flechas. Solo sugiere: no corrige nada por su cuenta.
 */
export function Autocomplete({ names, showTypes = false, showSprites = true, onSubmit, submitted = false, disabled = false, autoFocus = false }: AutocompleteProps) {
  const [text, setText] = useState("");
  // Se bloquea en el acto al enviar: la confirmación del servidor tarda y un doble Enter enviaría dos veces.
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  const index = useMemo(() => buildIndex(names), [names]);
  const suggestions = useMemo(() => suggest(index, text), [index, text]);
  const showList = open && suggestions.length > 0 && !submitted;
  const locked = submitted || disabled || sent;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit(value: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Escribe el nombre de un Pokémon.");
      return;
    }
    setError(null);
    setOpen(false);
    setActive(-1);
    setSent(true);
    onSubmit(trimmed);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (event.key === "Enter" && showList && active >= 0) {
      event.preventDefault();
      submit(suggestions[active]!.es);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(text);
      }}
      className="relative"
    >
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold">
        Nombre del Pokémon
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={MAX_LENGTH}
          disabled={locked}
          value={text}
          placeholder="Escribe un nombre"
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          className="framed-field min-w-0 flex-1 rounded-ui bg-surface px-4 py-3 text-lg text-fg transition-shadow duration-(--dur-fast) placeholder:text-muted focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
        />
        <Button type="submit" variant="primary" size="lg" disabled={locked}>
          Enviar
        </Button>
      </div>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugerencias"
          className="framed absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-ui bg-surface shadow-pop"
        >
          {suggestions.map((name, i) => (
            <li
              key={name.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // `mousedown` evita que el campo pierda el foco (y cierre la lista) antes del clic.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setText(name.es);
                setOpen(false);
                setActive(-1);
                inputRef.current?.focus();
              }}
              className={`flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1 text-sm ${i === active ? "bg-accent text-accent-fg" : "hover:bg-surface-2"}`}
            >
              {/* Un id inválido (solo con datos corruptos) haría lanzar a spriteUrl y pokedexNumber: sin imagen ni número. */}
              {showSprites && Number.isInteger(name.id) && name.id >= 1 ? (
                <>
                  <ArtImage id={name.id} spriteUrl={spriteUrl(name.id)} size={40} variant="sprite" eager />
                  <span aria-hidden="true" className={`w-11 shrink-0 font-num text-xs tabular-nums ${i === active ? "" : "text-muted"}`}>
                    {pokedexNumber(name.id)}
                  </span>
                </>
              ) : null}
              <span className="min-w-0 flex-1">
                {name.es}
                {name.en !== name.es ? <span className={i === active ? "ml-2" : "ml-2 text-muted"}>{name.en}</span> : null}
              </span>
              {showTypes && name.types ? (
                <span className="ml-auto flex shrink-0 gap-1">
                  {name.types.filter((type) => (TYPE_NAMES as readonly string[]).includes(type)).map((type) => (
                    <TypeChip key={type} type={type} />
                  ))}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p role="status" className="sr-only">
        {showList ? `${suggestions.length} sugerencias disponibles` : ""}
      </p>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {submitted || sent ? <p className="mt-2 text-sm text-muted">Respuesta enviada. Esperando el resultado…</p> : null}
    </form>
  );
}
