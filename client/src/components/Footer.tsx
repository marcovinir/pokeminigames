import { Link } from "react-router";
import { INFO_PAGES, INFO_SLUGS } from "../i18n/info";

/** Los enlaces a las páginas de información y el aviso de que es un proyecto de fans: el arte y las marcas son de sus dueños. */
export function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 text-center text-xs text-muted">
      <nav aria-label="Información">
        <ul role="list" className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {INFO_SLUGS.map((slug) => (
            <li key={slug}>
              <Link to={INFO_PAGES[slug].path} className="font-semibold underline-offset-2 hover:underline">
                {INFO_PAGES[slug].footerLabel}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
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
