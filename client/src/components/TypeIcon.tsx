import type { TypeName } from "@pokemon-minigames/shared";
import { useState } from "react";
import { typeIconUrl } from "../catalog/artwork";

/**
 * Las imágenes de PokeAPI son píldoras de 200 × 40 con el símbolo a la izquierda y el nombre en inglés. El símbolo ocupa de
 * x = 15 a 44 (e y = 5 a 34) en los 18 tipos (medido), así que se muestra una ventana cuadrada de 40 × 40 que empieza en
 * x = 9: centrada en el símbolo, sin cortarlo por la derecha y sin llegar al texto.
 */
const PILL_WIDTH_RATIO = 5; // 200 / 40
const WINDOW_LEFT = 9;
const WINDOW_SIZE = 40;

function Icon({ type, size, className = "" }: TypeIconProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className={`inline-block shrink-0 overflow-hidden rounded-full ${className}`}>
      <img
        src={typeIconUrl(type)}
        alt=""
        aria-hidden="true"
        decoding="async"
        onError={() => setFailed(true)}
        // La píldora entera, a escala (la ventana de 40 px mide `size`) y desplazada para dejar el símbolo en la caja. Va en
        // estilo en línea porque el preflight de Tailwind pone `height: auto` y `max-width: 100%` a toda `img`.
        style={{ display: "block", width: size * PILL_WIDTH_RATIO, height: size, maxWidth: "none", marginLeft: -(size * WINDOW_LEFT) / WINDOW_SIZE }}
      />
    </span>
  );
}

export interface TypeIconProps {
  type: TypeName;
  /** Lado en píxeles de la caja redonda del símbolo (tamaño fijo para que el diseño no salte al cargar). */
  size: number;
  className?: string;
}

/** El símbolo oficial de un tipo (recortado de su imagen de PokeAPI). Es decorativo (el nombre va aparte, como texto) y, si no carga, desaparece. */
export function TypeIcon(props: TypeIconProps) {
  // Con otro tipo se empieza de cero: un fallo anterior no apaga el icono nuevo.
  return <Icon key={props.type} {...props} />;
}
