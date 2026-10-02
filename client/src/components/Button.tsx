import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "header";

const VARIANTS: Record<Variant, string> = {
  // El hover subraya en vez de bajar la opacidad: con opacidad el texto pierde contraste (en Pokédex quedaba por debajo de 4,5:1).
  primary: "bg-accent text-accent-fg border-transparent hover:underline",
  secondary: "bg-surface text-fg border-line hover:bg-surface-2",
  ghost: "bg-transparent text-fg border-transparent hover:bg-surface-2",
  // Sobre el encabezado, que tiene su propio fondo y su propio color de texto según el tema.
  header: "bg-transparent text-header-fg border-transparent hover:bg-header-fg/15",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Mientras carga queda deshabilitado y lo indica a los lectores de pantalla. */
  loading?: boolean;
}

export function Button({ variant = "secondary", loading = false, disabled, className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-ui border-(length:--frame) px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
