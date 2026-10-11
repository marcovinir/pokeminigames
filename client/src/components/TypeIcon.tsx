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
      decoding="async"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}

export interface TypeIconProps {
  type: TypeName;
  /** Lado en píxeles (la imagen es cuadrada, de tamaño fijo para que el diseño no salte al cargar). */
  size: number;
  className?: string;
}

/** El icono oficial de un tipo. Es decorativo (el nombre va aparte, como texto) y, si no carga, desaparece. */
export function TypeIcon(props: TypeIconProps) {
  // Con otro tipo se empieza de cero: un fallo anterior no apaga el icono nuevo.
  return <Icon key={props.type} {...props} />;
}
