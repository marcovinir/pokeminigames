import type { GameKind } from "@pokemon-minigames/shared";
import { artworkUrl } from "../catalog/artwork";
import type { DobleTipoExample } from "../pages/menu-art";
import { TYPE_STYLES } from "../theme/type-styles";
import { TypeChip } from "./TypeChip";

/**
 * El dibujo de cada minijuego (decorativo). «Doble tipo»: el arte de un Pokémon de ejemplo sobre un fondo partido en
 * los colores de sus dos tipos, con los tipos debajo. La silueta: un Pokémon en negro sobre los rayos. `compact` es la
 * versión pequeña de la página de inicio: sin los tipos debajo.
 */
export function GameArt({ game, example, compact = false }: { game: GameKind; example: DobleTipoExample; compact?: boolean }) {
  const box = compact ? "h-20 w-28 shrink-0" : "h-32";
  const image = compact ? "size-20" : "size-32";
  const pixels = compact ? 80 : 128;
  if (game === "doble_tipo") {
    const [first, second] = example.types;
    return (
      <div aria-hidden="true">
        <div
          className={`flex items-center justify-center overflow-hidden rounded-card ${box}`}
          style={{
            background: `linear-gradient(115deg, ${TYPE_STYLES[first].background} 0 50%, ${TYPE_STYLES[second].background} 50% 100%)`,
          }}
        >
          <img
            src={artworkUrl(example.pokemonId)}
            alt=""
            width={pixels}
            height={pixels}
            className={`${image} object-contain drop-shadow-[0_4px_6px_rgb(0_0_0/0.35)]`}
          />
        </div>
        {compact ? null : (
          <div className="mt-2 flex justify-center gap-2">
            <TypeChip type={first} />
            <TypeChip type={second} />
          </div>
        )}
      </div>
    );
  }
  if (game === "subasta") {
    return (
      <div aria-hidden="true" className={`silhouette-rays relative flex items-center justify-center overflow-hidden rounded-card ${box}`}>
        <img src={artworkUrl(6)} alt="" width={compact ? 64 : 96} height={compact ? 64 : 96} className={`${compact ? "size-16" : "size-24"} object-contain brightness-0`} />
        <span data-price-tag className="absolute right-2 bottom-2 rounded-pill bg-surface px-2 py-0.5 font-num text-xs font-semibold text-fg shadow-card">
          ₽
        </span>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className={`silhouette-rays flex items-center justify-center overflow-hidden rounded-card ${box}`}>
      <img
        src={artworkUrl(94)}
        alt=""
        width={compact ? 64 : 96}
        height={compact ? 64 : 96}
        className={`${compact ? "size-16" : "size-24"} object-contain brightness-0`}
      />
    </div>
  );
}
