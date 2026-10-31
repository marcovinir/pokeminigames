import { useState } from "react";
import { artworkUrl, battleSpriteUrl } from "../../../catalog/artwork";

/** El Pokémon en el escenario: animado si se puede, si no la imagen fija y, como último recurso, su nombre. */
export function BattleSprite({ id, name, flipped, effect }: { id: number; name: string; flipped: boolean; effect: string }) {
  const [source, setSource] = useState<"animated" | "still" | "none">("animated");
  const next = () => setSource((current) => (current === "animated" ? "still" : "none"));
  return (
    <div className={`flex size-28 items-end justify-center sm:size-44 ${effect}`}>
      {source === "none" ? (
        <span className="text-center font-display font-semibold [overflow-wrap:anywhere]">{name}</span>
      ) : (
        <img
          src={source === "animated" ? battleSpriteUrl(id) : artworkUrl(id)}
          alt={name}
          onError={next}
          className={`size-full object-contain ${flipped ? "-scale-x-100" : ""}`}
        />
      )}
    </div>
  );
}
