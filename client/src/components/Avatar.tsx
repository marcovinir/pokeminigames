import { useState } from "react";
import { artworkUrl } from "../catalog/artwork";

export interface AvatarColor {
  background: string;
  color: string;
}

/** Ocho colores que superan 4,5:1 con texto blanco; cada nombre cae siempre en el mismo. */
export const AVATAR_COLORS: readonly AvatarColor[] = [
  { background: "#c2410c", color: "#ffffff" },
  { background: "#1d4ed8", color: "#ffffff" },
  { background: "#15803d", color: "#ffffff" },
  { background: "#7e22ce", color: "#ffffff" },
  { background: "#be185d", color: "#ffffff" },
  { background: "#0e7490", color: "#ffffff" },
  { background: "#854d0e", color: "#ffffff" },
  { background: "#b91c1c", color: "#ffffff" },
];

/** Siempre el mismo color para el mismo nombre (sin importar las mayúsculas): un hash sencillo de la cadena. */
export function avatarColor(name: string): AvatarColor {
  let hash = 5381;
  for (const char of name.toLowerCase()) hash = (hash * 33 + char.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/** Las iniciales: la primera letra de las dos primeras partes del nombre, o las dos primeras letras si es una sola. */
export function initials(name: string): string {
  const parts = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length >= 2 ? [...parts[0]!][0]! + [...parts[1]!][0]! : [...parts[0]!].slice(0, 2).join("");
  return letters.toUpperCase();
}

const SIZES = { sm: 28, md: 36, lg: 56, xl: 88 } as const;

/** Lado del arte respecto al círculo: el arte oficial trae su propio margen y así se ve entero, sin cortar la cabeza. */
const ART_SCALE = 0.88;

export interface AvatarProps {
  name: string;
  size?: keyof typeof SIZES;
  /** Número de Pokédex del avatar elegido. Sin él, o si la imagen no carga, se ven las iniciales. */
  avatarId?: number | null;
  /** Nombre accesible («Avatar: Gengar»). Sin él es decorativo: el nombre de la persona ya está al lado. */
  label?: string;
  className?: string;
}

type ImageState = "loading" | "loaded" | "failed";

function AvatarCircle({ name, size = "md", avatarId, label, className = "" }: AvatarProps) {
  const [image, setImage] = useState<ImageState>("loading");
  const px = SIZES[size];
  const art = Math.round(px * ART_SCALE);
  const pokemon = avatarId != null && Number.isInteger(avatarId) && avatarId > 0 ? avatarId : null;
  const showArt = pokemon !== null && image !== "failed";
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };

  return (
    <span
      {...a11y}
      style={{ ...avatarColor(name), width: px, height: px, fontSize: Math.round(px * 0.4) }}
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-pill font-display font-semibold ${className}`}
    >
      {showArt ? (
        // Mientras carga solo se ve el círculo de color (sin iniciales que parpadeen); si falla, vuelven las iniciales.
        <img
          src={artworkUrl(pokemon)}
          alt=""
          width={art}
          height={art}
          loading="lazy"
          decoding="async"
          onLoad={() => setImage("loaded")}
          onError={() => setImage("failed")}
          style={{ width: art, height: art }}
          className={`object-contain transition-opacity duration-(--dur-base) ${image === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** El Pokémon elegido sobre el color propio de la persona, o sus iniciales si no eligió ninguno o la imagen falla. */
export function Avatar(props: AvatarProps) {
  // Con otro avatar se empieza de cero (una imagen que falló no condena a la siguiente).
  return <AvatarCircle key={props.avatarId ?? "none"} {...props} />;
}
