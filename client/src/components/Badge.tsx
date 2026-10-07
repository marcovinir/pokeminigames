import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "danger" | "gold" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg",
  success: "bg-success-bg text-success",
  danger: "bg-danger-bg text-danger",
  gold: "bg-gold text-gold-fg",
  info: "bg-accent-2 text-accent-2-fg",
};

/** Una etiqueta corta de color (Ganaste, Empate, Perdiste…). El color nunca es lo único que dice algo: lleva texto. */
export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-pill px-3 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>
  );
}
