import { useState } from "react";
import { artworkUrl, battleSpriteUrl } from "../../../catalog/artwork";
import { useReducedMotion } from "../../../game/motion";

/** El Pokémon en el escenario: animado si se puede, si no la imagen fija y, como último recurso, su nombre. */
export function BattleSprite({ id, name, flipped, effect }: { id: number; name: string; flipped: boolean; effect: string }) {
  const [source, setSource] = useState<"animated" | "still" | "none">("animated");
  const reduced = useReducedMotion();
  // Un GIF no se detiene con CSS: con «reducir movimiento» va la imagen fija.
  const shown = source === "animated" && reduced ? "still" : source;
  const url = shown === "animated" ? battleSpriteUrl(id) : artworkUrl(id);
  // Si ya era la imagen fija (los que no tienen GIF), no hay otra que probar.
  const next = () => setSource(shown === "animated" && url !== artworkUrl(id) ? "still" : "none");
  return (
    <div className={`flex size-28 items-end justify-center sm:size-44 ${effect}`}>
      {source === "none" ? (
        <span className="text-center font-display font-semibold [overflow-wrap:anywhere]">{name}</span>
      ) : (
        <img
          src={url}
          alt={name}
          onError={next}
          className={`size-full object-contain ${flipped ? "-scale-x-100" : ""}`}
        />
      )}
    </div>
  );
}
