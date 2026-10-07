import type { TypeName } from "@pokemon-minigames/shared";
import { TYPE_LABELS } from "../i18n/es";
import { typeChipStyle } from "../theme/type-styles";

const SIZES = {
  md: "px-3 py-0.5 text-sm",
  lg: "px-5 py-1.5 text-lg",
} as const;

/** El nombre de un tipo sobre su color, con relieve (un degradado y un filo oscuro abajo). */
export function TypeChip({ type, size = "md", className = "" }: { type: TypeName; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      style={typeChipStyle(type)}
      className={`inline-block rounded-pill font-display font-semibold shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] ${SIZES[size]} ${className}`}
      data-type={type}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}
