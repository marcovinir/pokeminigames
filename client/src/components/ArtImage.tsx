import { useState } from "react";
import { artworkUrl } from "../catalog/artwork";
import { LogoMark } from "./Logo";

export interface ArtImageProps {
  id: number;
  /** El sprite pequeño que ya llega con cada Pokémon: respaldo del arte oficial y fuente de la variante `sprite`. */
  spriteUrl: string;
  /** Lado en píxeles (la imagen es cuadrada). */
  size: number;
  /** `official` (por defecto) empieza por el arte grande; `sprite` solo pide el sprite pequeño. */
  variant?: "official" | "sprite";
  /** Sin carga perezosa: para lo que se ve de inmediato (el resultado de la ronda). */
  eager?: boolean;
  className?: string;
}

type Source = "official" | "sprite" | "none";

function Art({ id, spriteUrl, size, variant = "official", eager = false, className = "" }: ArtImageProps) {
  const [source, setSource] = useState<Source>(variant);
  const [loaded, setLoaded] = useState(false);

  const state = source === "none" ? "fallback" : loaded ? "loaded" : "loading";
  const next = (current: Source): Source => (current === "official" ? "sprite" : "none");

  return (
    <span
      data-state={state}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-card ${state === "loading" ? "skeleton" : ""} ${className}`}
    >
      {source === "none" ? (
        <LogoMark size={Math.round(size * 0.5)} className="opacity-40" />
      ) : (
        <img
          key={source}
          src={source === "official" ? artworkUrl(id) : spriteUrl}
          alt=""
          width={size}
          height={size}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setSource(next);
          }}
          className={`h-full w-full object-contain transition-opacity duration-(--dur-base) ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}

/** La imagen de un Pokémon: arte oficial, o el sprite si falla, o una bola neutra; con esqueleto mientras carga. */
export function ArtImage(props: ArtImageProps) {
  // Con otro Pokémon (u otra variante) se empieza de cero.
  return <Art key={`${props.id}-${props.variant ?? "official"}`} {...props} />;
}
