import { useEffect, useState } from "react";

/** Si la sesión tarda más que esto en recuperarse, el servidor probablemente se estaba durmiendo (capa gratuita). */
export const SLOW_START_MS = 5000;

export function LoadingScreen() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="status" className="text-center text-muted">
      <p>Cargando…</p>
      {slow ? <p className="mt-2 text-sm">El servidor se está despertando, puede tardar hasta un minuto…</p> : null}
    </div>
  );
}
