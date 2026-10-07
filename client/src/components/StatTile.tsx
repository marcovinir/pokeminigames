/** Una ficha de estadística (etiqueta y valor). Va dentro de un `<dl>`. */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="framed rounded-card bg-surface px-4 py-3 shadow-card">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-num text-3xl font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}
