import type { TypeName } from "@pokemon-minigames/shared";
import { useState } from "react";
import { typeIconUrl } from "../catalog/artwork";

function Icon({ type, size, className = "" }: TypeIconProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={typeIconUrl(type)}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      // La imagen de PokeAPI es una píldora de 200 × 40 (símbolo a la izquierda y el nombre en inglés): se recorta a su
      // símbolo con una caja cuadrada. El tamaño va en línea porque el preflight de Tailwind pone `height: auto` y
      // `max-width: 100%` a toda `img` y anularía los atributos `width` y `height`.
      style={{ width: size, height: size, maxWidth: "none" }}
      decoding="async"
      onError={() => setFailed(true)}
      className={`shrink-0 object-cover object-left ${className}`}
    />
  );
}

export interface TypeIconProps {
  type: TypeName;
  /** Lado en píxeles de la caja cuadrada del símbolo (tamaño fijo para que el diseño no salte al cargar). */
  size: number;
  className?: string;
}

/** El símbolo oficial de un tipo (la parte izquierda de su imagen de PokeAPI). Es decorativo (el nombre va aparte, como texto) y, si no carga, desaparece. */
export function TypeIcon(props: TypeIconProps) {
  // Con otro tipo se empieza de cero: un fallo anterior no apaga el icono nuevo.
  return <Icon key={props.type} {...props} />;
}
