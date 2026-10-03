import { useCallback, useEffect, useState } from "react";

export type LoadState<T> = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; data: T };

/**
 * Carga datos al montarse y cada vez que cambian `deps`; `reload` los pide de nuevo. Una respuesta que llega
 * después de haber cambiado los datos de entrada (o de desmontarse) se descarta.
 */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): { state: LoadState<T>; reload(): void } {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    load().then(
      (data) => current && setState({ status: "ready", data }),
      (error: unknown) => current && setState({ status: "error", error }),
    );
    return () => {
      current = false;
    };
    // `load` es una función nueva en cada render; lo que decide cuándo recargar son `deps` y `attempt`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}
