import { type InputHTMLAttributes, type ReactNode, useId } from "react";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  /** Clases extra para el campo (p. ej. el código de sala, grande y espaciado). */
  inputClassName?: string;
  error?: string | null;
  hint?: ReactNode;
}

/** Campo con su etiqueta y su mensaje de error, bien asociados para lectores de pantalla. */
export function TextField({ label, error, hint, id, inputClassName = "", ...input }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        className={`framed-field w-full rounded-ui bg-surface px-4 py-3 text-fg transition-shadow duration-(--dur-fast) placeholder:text-muted focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)] ${inputClassName}`}
        {...input}
      />
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
