import type { HTMLAttributes } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  /** El elemento HTML: una `section` con `aria-label` es una región; un `article`, un contenido independiente. */
  as?: "div" | "section" | "article";
  /** `raised` usa la sombra más marcada, para lo que debe destacar. */
  tone?: "plain" | "raised";
  className?: string;
}

/** El recuadro común de la interfaz: borde del tema, esquinas redondeadas, fondo de superficie y sombra. */
export function Card({ as: Tag = "div", tone = "plain", className = "", ...props }: CardProps) {
  return <Tag className={`framed rounded-card bg-surface ${tone === "raised" ? "shadow-pop" : "shadow-card"} ${className}`} {...props} />;
}
