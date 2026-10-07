/** Aviso de que es un proyecto de fans: el arte y las marcas son de sus dueños. */
export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-center text-xs text-muted">
      <p>
        Proyecto de fans sin fines de lucro. Pokémon y sus personajes son marcas de Nintendo, Game Freak y The Pokémon Company; no hay
        relación con ellos. Arte y datos de{" "}
        <a href="https://pokeapi.co" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
          PokeAPI
        </a>
        .
      </p>
    </footer>
  );
}
