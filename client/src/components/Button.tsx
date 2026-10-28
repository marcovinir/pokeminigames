import type { ButtonHTMLAttributes, Ref } from "react";
import { useOptionalServices } from "../services";

type Variant = "primary" | "secondary" | "ghost" | "header" | "danger";
type Size = "md" | "lg";

/*
 * El principal y el secundario tienen relieve: un borde inferior (`--depth`, 4 px en Clásico y 0 en Pokédex) que se
 * hunde a la mitad al pulsar. El hover mueve el botón en vez de bajar la opacidad: con opacidad el texto pierde contraste.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg border-accent-edge shadow-[0_var(--depth)_0_0_var(--accent-edge)] hover:-translate-y-px active:translate-y-[calc(var(--depth)/2)] active:shadow-[0_calc(var(--depth)/2)_0_0_var(--accent-edge)]",
  secondary:
    "bg-surface text-fg border-line shadow-[0_var(--depth)_0_0_var(--line)] hover:bg-surface-2 active:translate-y-[calc(var(--depth)/2)] active:shadow-[0_calc(var(--depth)/2)_0_0_var(--line)]",
  ghost: "bg-transparent text-fg border-transparent hover:bg-surface-2",
  // Para lo que no se puede deshacer: los mismos colores que el aviso de error (ya pasan la auditoría de contraste).
  danger:
    "bg-danger-bg text-danger border-danger shadow-[0_var(--depth)_0_0_var(--danger)] hover:-translate-y-px active:translate-y-[calc(var(--depth)/2)] active:shadow-[0_calc(var(--depth)/2)_0_0_var(--danger)]",
  // Sobre el encabezado, que tiene su propio fondo y su propio color de texto según el tema.
  header: "bg-transparent text-header-fg border-transparent hover:bg-header-fg/15",
};

const SIZES: Record<Size, string> = {
  md: "px-5 py-2 text-sm",
  lg: "px-7 py-3 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Para devolverle el foco (en React 19 `ref` llega como una prop más y va al <button> con el resto). */
  ref?: Ref<HTMLButtonElement>;
  /** Mientras carga queda deshabilitado, muestra una ruedita y lo indica a los lectores de pantalla. */
  loading?: boolean;
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 animate-spin-slow" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  type = "button",
  children,
  onClick,
  ...props
}: ButtonProps) {
  const sound = useOptionalServices()?.sound;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-pill border-(length:--frame) font-display font-semibold transition-[transform,box-shadow,background-color] duration-(--dur-fast) ease-(--ease-out) disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
      onClick={(e) => {
        sound?.play("click");
        onClick?.(e);
      }}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
