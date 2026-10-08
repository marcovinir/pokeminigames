import { TextField } from "./TextField";

/** Deja solo los dígitos y como mucho seis, también al pegar «123 456» o «123-456». */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export interface CodeFieldProps {
  value: string;
  onChange(code: string): void;
  error?: string | null;
  autoFocus?: boolean;
}

/**
 * El código de seis dígitos que llega por correo: teclado numérico y `one-time-code` para que el navegador o el teléfono
 * lo propongan. No lleva `maxLength`: pegar «123 456» (siete caracteres) se cortaría antes de poder limpiarlo.
 */
export function CodeField({ value, onChange, error, autoFocus }: CodeFieldProps) {
  return (
    <TextField
      label="Código"
      value={value}
      onChange={(event) => onChange(digitsOnly(event.target.value))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      inputClassName="font-num text-center text-2xl tracking-[0.3em]"
      autoFocus={autoFocus}
      error={error}
    />
  );
}
