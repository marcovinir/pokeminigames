import type { TypeName } from "@pokemon-minigames/shared";
import { TYPE_LABELS } from "../i18n/es";
import { typeChipStyle } from "../theme/type-styles";
import { TypeIcon } from "./TypeIcon";

const SIZES = {
  md: "px-3 py-0.5 text-sm",
  lg: "px-5 py-1.5 text-lg",
} as const;

/** El lado del icono en cada tamaño de chip. */
const ICON_SIZES = { md: 14, lg: 18 } as const;

/** El nombre de un tipo sobre su color, con relieve (un degradado y un filo oscuro abajo) y, a la izquierda, su icono oficial. */
export function TypeChip({
  type,
  size = "md",
  icon = true,
  className = "",
}: {
  type: TypeName;
  size?: keyof typeof SIZES;
  /** Con `false` el chip es solo el nombre, como antes. */
  icon?: boolean;
  className?: string;
}) {
  return (
    <span
      style={typeChipStyle(type)}
      className={`inline-flex items-center gap-1.5 rounded-pill font-display font-semibold shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] ${SIZES[size]} ${className}`}
      data-type={type}
    >
      {icon ? <TypeIcon type={type} size={ICON_SIZES[size]} /> : null}
      {TYPE_LABELS[type]}
    </span>
  );
}
