import { type CSSProperties, useState } from "react";
import { type SpriteSide, battleSpriteUrl, battleStillUrl } from "../../../catalog/artwork";
import { useReducedMotion } from "../../../game/motion";
import { BATTLE_TEXT } from "../../../i18n/es";

/** La altura, sin agrandar, que cabe en el escenario: los sprites de los Pokémon gigantes se reducen hasta ella. */
const MAX_SPRITE_HEIGHT = 90;

/** El Pokémon en el escenario: animado si se puede, si no el PNG clásico y, como último recurso, su nombre. */
export function BattleSprite({ id, name, side, effect, showsAbility = false, describedBy, onAbility }: { id: number; name: string; side: SpriteSide; effect: string; showsAbility?: boolean; describedBy?: string; onAbility?(open: boolean): void }) {
  const [source, setSource] = useState<"animated" | "still" | "none">("animated");
  const [fit, setFit] = useState(1);
  const reduced = useReducedMotion();
  // Un GIF no se detiene con CSS: con «reducir movimiento» va la imagen fija.
  const shown = source === "animated" && reduced ? "still" : source;
  const url = shown === "animated" ? battleSpriteUrl(id, side) : battleStillUrl(id, side);
  // Si ya era la imagen fija (los que no tienen GIF), no hay otra que probar.
  const next = () => setSource(shown === "animated" && url !== battleStillUrl(id, side) ? "still" : "none");
  const picture =
    source === "none" ? (
      <span className="block w-24 rounded-md bg-white/90 p-1 text-center font-display text-sm font-semibold text-[#1b1147] [overflow-wrap:anywhere]">{name}</span>
    ) : (
      <img src={url} alt={name} onError={next} onLoad={(event) => setFit(Math.min(1, MAX_SPRITE_HEIGHT / event.currentTarget.naturalHeight))} style={{ "--sprite-fit": String(fit) } as CSSProperties} className={`battle-sprite battle-sprite-${side}`} />
    );
  return (
    <div className={`battle-spot battle-spot-${side}`}>
      {/* La entrada va aparte de los golpes: en el mismo nodo, se repetiría al acabar cada uno. */}
      {showsAbility ? (
        <button type="button" data-ability-sprite aria-label={BATTLE_TEXT.seeAbility(name)} aria-describedby={describedBy} onMouseEnter={() => onAbility?.(true)} onMouseLeave={() => onAbility?.(false)} onFocus={() => onAbility?.(true)} onBlur={() => onAbility?.(false)} onClick={() => onAbility?.(true)} className="battle-enter battle-sprite-button flex-none">
          <span className={`block ${effect}`}>{picture}</span>
        </button>
      ) : (
        <div className="battle-enter flex-none">
          <div className={effect}>{picture}</div>
        </div>
      )}
    </div>
  );
}
