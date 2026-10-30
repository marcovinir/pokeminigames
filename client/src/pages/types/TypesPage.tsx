import { type DamageGroups, TYPE_NAMES, type TypeName, damageTaken, typeEffectiveness } from "@pokemon-minigames/shared";
import { useId } from "react";
import { useSearchParams } from "react-router";
import { Card } from "../../components/Card";
import { TypeChip } from "../../components/TypeChip";
import { rise } from "../../components/rise";
import { TYPES_TEXT, TYPE_ABBREVIATIONS, TYPE_LABELS } from "../../i18n/es";
import { typeChipStyle } from "../../theme/type-styles";
import { parseTypeSelection, typeSelectionParams } from "./type-selection";

const DAMAGE_ROWS: { key: keyof DamageGroups; label: string }[] = [
  { key: "x4", label: "×4" },
  { key: "x2", label: "×2" },
  { key: "x05", label: "×½" },
  { key: "x025", label: "×¼" },
  { key: "x0", label: "×0" },
];

function TypeSelect({
  label,
  value,
  disabled = false,
  exclude,
  onChange,
}: {
  label: string;
  value: TypeName | undefined;
  disabled?: boolean;
  exclude?: TypeName;
  onChange: (type: TypeName | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-40 flex-1">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange((event.target.value || undefined) as TypeName | undefined)}
        className="framed-field w-full rounded-ui bg-surface px-4 py-3 text-fg disabled:opacity-50"
      >
        <option value="">{TYPES_TEXT.none}</option>
        {TYPE_NAMES.filter((type) => type !== exclude).map((type) => (
          <option key={type} value={type}>
            {TYPE_LABELS[type]}
          </option>
        ))}
      </select>
    </div>
  );
}

function DamageBlock({ types }: { types: TypeName[] }) {
  const titleId = useId();
  const groups = damageTaken(types);
  return (
    <section aria-labelledby={titleId} className="mt-5">
      <h2 id={titleId} className="font-display text-lg font-semibold">
        {TYPES_TEXT.damageTitle}
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {DAMAGE_ROWS.filter(({ key }) => groups[key].length > 0).map(({ key, label }) => (
          <div key={key} role="group" aria-label={label} className="flex items-start gap-3">
            <span aria-hidden="true" className="w-8 shrink-0 font-num font-semibold">
              {label}
            </span>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {groups[key].map((type) => (
                <TypeChip key={type} type={type} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const CELL_STYLE = {
  2: "bg-success-bg text-success",
  0.5: "bg-danger-bg text-danger",
  0: "bg-surface-2 text-fg",
  1: "",
} as const;
const CELL_TEXT = { 2: "2", 0.5: "½", 0: "0", 1: "" } as const;

function TypeHeader({ type, scope, selected = false }: { type: TypeName; scope: "col" | "row"; selected?: boolean }) {
  return (
    <th
      scope={scope}
      data-selected={selected || undefined}
      style={typeChipStyle(type)}
      className={`px-1 py-1 text-xs font-semibold ${scope === "row" ? "sticky left-0 z-1" : ""} ${selected ? "outline-2 -outline-offset-2 outline-accent" : ""}`}
    >
      <span aria-hidden="true">{TYPE_ABBREVIATIONS[type]}</span>
      <span className="sr-only">{TYPE_LABELS[type]}</span>
    </th>
  );
}

function TypeChart({ selected }: { selected: TypeName[] }) {
  return (
    // La tabla no cabe en un teléfono: se desplaza dentro de su caja, que se alcanza con Tab para moverla con las flechas.
    <div role="region" aria-label={TYPES_TEXT.chartLabel} tabIndex={0} className="mt-3 overflow-x-auto rounded-ui">
      <table className="mx-auto border-collapse font-num text-sm">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-1 bg-surface p-1">
              <span className="sr-only">{TYPES_TEXT.cornerLabel}</span>
            </th>
            {TYPE_NAMES.map((type) => (
              <TypeHeader key={type} type={type} scope="col" selected={selected.includes(type)} />
            ))}
          </tr>
        </thead>
        <tbody>
          {TYPE_NAMES.map((attacker) => (
            <tr key={attacker}>
              <TypeHeader type={attacker} scope="row" />
              {TYPE_NAMES.map((defender) => {
                const value = typeEffectiveness(attacker, defender);
                const marked = selected.includes(defender);
                return (
                  <td
                    key={defender}
                    data-selected={marked || undefined}
                    className={`h-8 min-w-9 border border-line text-center font-semibold ${CELL_STYLE[value]} ${marked ? "border-x-2 border-x-accent" : ""}`}
                  >
                    {CELL_TEXT[value]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** La tabla de tipos: pública. La selección vive en la dirección, para poder compartirla. */
export function TypesPage() {
  const [params, setParams] = useSearchParams();
  const selected = parseTypeSelection(params);
  const [first, second] = selected;
  // Sin apilar historial: «Atrás» sale de la página en vez de deshacer cada cambio de una lista.
  const choose = (types: (TypeName | undefined)[]) =>
    setParams(typeSelectionParams([...new Set(types.filter((type) => type !== undefined))]), { replace: true });

  return (
    <div style={rise(0)} className="animate-rise mx-auto flex max-w-4xl flex-col gap-5">
      <h1 className="font-display text-3xl font-semibold">{TYPES_TEXT.title}</h1>
      <Card as="section" className="p-5">
        <div className="flex flex-wrap gap-3">
          <TypeSelect label={TYPES_TEXT.first} value={first} onChange={(type) => choose([type, second])} />
          <TypeSelect label={TYPES_TEXT.second} value={second} disabled={!first} exclude={first} onChange={(type) => choose([first, type])} />
        </div>
        {first ? <DamageBlock types={selected} /> : null}
      </Card>
      <Card as="section" aria-labelledby="types-chart-title" className="min-w-0 p-5">
        <h2 id="types-chart-title" className="font-display text-lg font-semibold">
          {TYPES_TEXT.chartTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">{TYPES_TEXT.chartHint}</p>
        <TypeChart selected={selected} />
      </Card>
    </div>
  );
}
