import { type CSSProperties, useState } from "react";
import { type SpriteSide, battleSpriteUrl, battleStillUrl } from "../../../catalog/artwork";
import { useReducedMotion } from "../../../game/motion";

/** La altura, sin agrandar, que cabe en el escenario: los sprites de los Pokémon gigantes se reducen hasta ella. */
const MAX_SPRITE_HEIGHT = 90;

/** El Pokémon en el escenario: animado si se puede, si no el PNG clásico y, como último recurso, su nombre. */
export function BattleSprite({ id, name, side, effect }: { id: number; name: string; side: SpriteSide; effect: string }) {
  const [source, setSource] = useState<"animated" | "still" | "none">("animated");
  const [fit, setFit] = useState(1);
  const reduced = useReducedMotion();
  // Un GIF no se detiene con CSS: con «reducir movimiento» va la imagen fija.
  const shown = source === "animated" && reduced ? "still" : source;
  const url = shown === "animated" ? battleSpriteUrl(id, side) : battleStillUrl(id, side);
  // Si ya era la imagen fija (los que no tienen GIF), no hay otra que probar.
  const next = () => setSource(shown === "animated" && url !== battleStillUrl(id, side) ? "still" : "none");
  return (
    <div className={`battle-spot battle-spot-${side}`}>
      <div className={`battle-enter flex-none ${effect}`}>
        {source === "none" ? (
          <span className="block w-24 rounded-md bg-white/90 p-1 text-center font-display text-sm font-semibold text-[#1b1147] [overflow-wrap:anywhere]">{name}</span>
        ) : (
          <img src={url} alt={name} onError={next} onLoad={(event) => setFit(Math.min(1, MAX_SPRITE_HEIGHT / event.currentTarget.naturalHeight))} style={{ "--sprite-fit": String(fit) } as CSSProperties} className={`battle-sprite battle-sprite-${side}`} />
        )}
      </div>
    </div>
  );
}
