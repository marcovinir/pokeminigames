import { useEffect, useState } from "react";
import { LogoMark } from "./Logo";

/** Si la sesión tarda más que esto en recuperarse, el servidor probablemente se estaba durmiendo (capa gratuita). */
export const SLOW_START_MS = 5000;

export function LoadingScreen() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="status" className="flex flex-col items-center gap-4 py-16 text-center text-muted">
      <LogoMark size={56} className="animate-spin-slow" />
      <p className="font-display text-lg font-medium">Cargando…</p>
      {slow ? <p className="text-sm">El servidor se está despertando, puede tardar hasta un minuto…</p> : null}
    </div>
  );
}
