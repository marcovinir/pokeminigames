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

export interface AvatarProps {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Iniciales sobre un color propio. Es decorativo: el nombre ya está al lado como texto. */
export function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  const px = SIZES[size];
  return (
    <span
      aria-hidden="true"
      style={{ ...avatarColor(name), width: px, height: px, fontSize: Math.round(px * 0.4) }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-pill font-display font-semibold ${className}`}
    >
      {initials(name)}
    </span>
  );
}
