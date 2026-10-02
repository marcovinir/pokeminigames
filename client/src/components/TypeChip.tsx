import type { TypeName } from "@pokemon-minigames/shared";
import { TYPE_LABELS } from "../i18n/es";
import { TYPE_STYLES } from "../theme/type-styles";

export function TypeChip({ type, className = "" }: { type: TypeName; className?: string }) {
  return (
    <span
      style={TYPE_STYLES[type]}
      className={`inline-block rounded-ui px-3 py-0.5 text-sm font-medium ${className}`}
      data-type={type}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}
