import { TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import { useId } from "react";
import { TYPES_TEXT, TYPE_LABELS } from "../i18n/es";

/** Una lista para elegir un tipo o ninguno. `exclude` quita el que ya está elegido en la otra lista. */
export function TypeSelect({
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
