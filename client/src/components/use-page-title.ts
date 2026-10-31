import { useEffect } from "react";

const BASE_TITLE = "PokeMiniGames";

/** El título de la pestaña en las páginas públicas (es lo primero que se lee, y lo que se ve al compartirlas). Al salir, vuelve al de siempre. */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
