import { type DamageGroups, type TypeName, damageTaken } from "@pokemon-minigames/shared";
import { useId } from "react";
import { TYPES_TEXT } from "../i18n/es";
import { TypeChip } from "./TypeChip";

const DAMAGE_ROWS: { key: keyof DamageGroups; label: string }[] = [
  { key: "x4", label: "×4" },
  { key: "x2", label: "×2" },
  { key: "x05", label: "×½" },
  { key: "x025", label: "×¼" },
  { key: "x0", label: "×0" },
];

/** El daño que recibe una combinación de tipos, agrupado por multiplicador y sin el ×1. */
export function DamageList({ types }: { types: TypeName[] }) {
  const titleId = useId();
  const groups = damageTaken(types);
  return (
    <section aria-labelledby={titleId} className="mt-5 first:mt-0">
      <h2 id={titleId} className="font-display text-lg font-semibold">
        {TYPES_TEXT.damageTitle}
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {DAMAGE_ROWS.filter(({ key }) => groups[key].length > 0).map(({ key, label }) => (
          <div key={key} role="group" aria-label={label} className="flex items-start gap-3">
            <span aria-hidden="true" className="w-8 shrink-0 font-num font-semibold">
              {label}
            </span>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {groups[key].map((type) => (
                <TypeChip key={type} type={type} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
