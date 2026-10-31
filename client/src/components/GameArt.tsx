import type { GameKind } from "@pokemon-minigames/shared";
import { artworkUrl } from "../catalog/artwork";
import type { DobleTipoExample, GameCovers } from "../pages/menu-art";
import { TYPE_STYLES } from "../theme/type-styles";
import { TypeChip } from "./TypeChip";

const DEFAULT_COVERS: GameCovers = { silhouette: 94, auction: 6 };

/** El mazo de la subasta: dibujado aquí, sin imágenes. */
function Gavel({ className }: { className: string }) {
  return (
    <svg data-gavel viewBox="0 0 48 48" className={className} focusable="false">
      <g transform="rotate(-40 24 24)">
        <rect x="21.5" y="20" width="5" height="26" rx="2" fill="#b45309" />
        <rect x="10" y="8" width="28" height="14" rx="3" fill="#92400e" />
        <rect x="14" y="8" width="3" height="14" fill="#fbbf24" />
        <rect x="31" y="8" width="3" height="14" fill="#fbbf24" />
      </g>
    </svg>
  );
}

/**
 * El dibujo de cada minijuego (decorativo). «Doble tipo»: el arte de un Pokémon de ejemplo sobre un fondo partido en
 * los colores de sus dos tipos, con los tipos debajo. La silueta: un Pokémon en negro sobre los rayos. La subasta: un
 * lote en negro bajo el foco, con su precio y el mazo. `compact` es la versión pequeña de la página de inicio: sin los
 * tipos debajo.
 */
export function GameArt({ game, example, covers = DEFAULT_COVERS, compact = false }: { game: GameKind; example: DobleTipoExample; covers?: GameCovers; compact?: boolean }) {
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
      <div aria-hidden="true" className={`auction-stage relative flex items-end justify-center overflow-hidden rounded-card ${box}`}>
        <img
          src={artworkUrl(covers.auction)}
          alt=""
          width={compact ? 56 : 88}
          height={compact ? 56 : 88}
          className={`${compact ? "mb-1 size-14" : "mb-2 size-22"} relative object-contain brightness-0`}
        />
        <span data-price-tag className={`absolute top-2 left-2 rounded-pill bg-amber-300 px-2 py-0.5 font-num font-bold text-stone-900 shadow-card ${compact ? "text-[10px]" : "text-xs"}`}>
          ₽ ???
        </span>
        <Gavel className={`absolute right-1 bottom-1 ${compact ? "size-8" : "size-14"}`} />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className={`silhouette-rays flex items-center justify-center overflow-hidden rounded-card ${box}`}>
      <img
        src={artworkUrl(covers.silhouette)}
        alt=""
        width={compact ? 64 : 96}
        height={compact ? 64 : 96}
        className={`${compact ? "size-16" : "size-24"} object-contain brightness-0`}
      />
    </div>
  );
}
