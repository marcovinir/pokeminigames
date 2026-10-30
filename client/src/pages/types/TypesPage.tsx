import { TYPE_NAMES, type TypeName, typeEffectiveness } from "@pokemon-minigames/shared";
import { Link, useSearchParams } from "react-router";
import { Card } from "../../components/Card";
import { DamageList } from "../../components/DamageList";
import { PlayPrompt } from "../../components/PlayPrompt";
import { TypeSelect } from "../../components/TypeSelect";
import { rise } from "../../components/rise";
import { TYPES_TEXT, TYPE_ABBREVIATIONS, TYPE_LABELS } from "../../i18n/es";
import { typeChipStyle } from "../../theme/type-styles";
import { parseTypeSelection, typeSelectionParams } from "./type-selection";

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
      <span className="sr-only">
        {TYPE_LABELS[type]}
        {selected ? ` ${TYPES_TEXT.selectedColumn}` : ""}
      </span>
    </th>
  );
}

function TypeChart({ selected }: { selected: TypeName[] }) {
  return (
    // La tabla no cabe en un teléfono: se desplaza dentro de su caja, que se alcanza con Tab para moverla con las flechas.
    // `relative`: sin él, los textos `sr-only` (absolutos) de los encabezados escapan de la caja y ensanchan la página.
    <div role="region" aria-label={TYPES_TEXT.chartLabel} tabIndex={0} className="relative mt-3 overflow-x-auto rounded-ui">
      <table className="mx-auto border-collapse font-num text-sm">
        <caption className="sr-only">{`${TYPES_TEXT.chartTitle}. ${TYPES_TEXT.chartHint}`}</caption>
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
                    {/* El ×1 no se ve (la tabla se lee mejor), pero un lector de pantalla no debe oír una celda en blanco. */}
                    {value === 1 ? <span className="sr-only">1</span> : CELL_TEXT[value]}
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
      <PlayPrompt />
      <Card as="section" className="p-5">
        <div className="flex flex-wrap gap-3">
          <TypeSelect label={TYPES_TEXT.first} value={first} onChange={(type) => choose([type, second])} />
          <TypeSelect label={TYPES_TEXT.second} value={second} disabled={!first} exclude={first} onChange={(type) => choose([first, type])} />
        </div>
        {/* La región viva existe desde el principio: si naciera con el contenido, el cambio no se anunciaría. */}
        <div aria-live="polite">{first ? <DamageList types={selected} /> : null}</div>
        {first ? (
          <p className="mt-4 text-sm">
            <Link to={`/pokedex?${typeSelectionParams(selected).toString()}`} className="font-semibold text-accent underline underline-offset-4">
              {TYPES_TEXT.seeInPokedex}
            </Link>
          </p>
        ) : null}
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
