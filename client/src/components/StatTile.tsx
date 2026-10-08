const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Un anillo decorativo que se llena hasta `fraction` (de 0 a 1). Sin texto: el número ya está en la ficha. */
function Ring({ fraction }: { fraction: number }) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="absolute right-3 top-1/2 size-14 -translate-y-1/2 -rotate-90">
      <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12" className="stroke-surface-2" />
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
        className="stroke-accent-2"
      />
    </svg>
  );
}

/** Una ficha de estadística (etiqueta y valor), con un anillo opcional. Va dentro de un `<dl>`. */
export function StatTile({ label, value, hint, ring, className = "" }: { label: string; value: string; hint?: string; ring?: number | null; className?: string }) {
  return (
    // Con anillo reserva sitio a la derecha (el anillo es `absolute` y, sin esto, el número se le monta encima).
    <div className={`framed relative rounded-card bg-surface px-4 py-3 shadow-card ${ring != null ? "pr-20" : ""} ${className}`}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-num text-3xl font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
      {ring != null ? <Ring fraction={ring} /> : null}
    </div>
  );
}
