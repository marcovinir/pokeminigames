import type { GameKind } from "@pokemon-minigames/shared";
import { artworkUrl } from "../catalog/artwork";
import type { DobleTipoExample, GameCovers } from "../pages/menu-art";
import { TYPE_STYLES } from "../theme/type-styles";
import { TypeChip } from "./TypeChip";

const DEFAULT_COVERS: GameCovers = { silhouette: 94, auction: 6 };

/** Una paleta de puja con el número del jugador: dibujada aquí, sin imágenes. */
function Paddle({ number, className }: { number: 1 | 2; className: string }) {
  return (
    <svg data-paddle viewBox="0 0 40 64" className={className} focusable="false">
      <rect x="17" y="34" width="6" height="30" rx="2" fill="#451a03" />
      <circle cx="20" cy="20" r="18" fill="#fef3c7" stroke="#451a03" strokeWidth="3" />
      <text x="20" y="28" textAnchor="middle" fontSize="22" fontWeight="700" fill="#451a03">
        {number}
      </text>
    </svg>
  );
}

/**
 * El dibujo de cada minijuego (decorativo). «Doble tipo»: el arte de un Pokémon de ejemplo sobre un fondo partido en
 * los colores de sus dos tipos, con los tipos debajo. La silueta: un Pokémon en negro sobre los rayos. La subasta: un
 * lote en negro bajo un haz de luz, entre los telones y con las paletas de los dos jugadores. `compact` es la versión pequeña de la página de inicio: sin los
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
    const paddle = compact ? "h-9 w-6" : "h-16 w-10";
    return (
      <div aria-hidden="true" className={`auction-stage relative flex items-end justify-center overflow-hidden rounded-card ${box}`}>
        <span className="auction-beam absolute inset-y-0 left-1/2 w-3/5 -translate-x-1/2" />
        <span className={`auction-pedestal absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-ui ${compact ? "h-2 w-12" : "h-3 w-28"}`} />
        <img
          src={artworkUrl(covers.auction)}
          alt=""
          width={compact ? 56 : 88}
          height={compact ? 56 : 88}
          className={`${compact ? "mb-2 size-14" : "mb-3 size-22"} relative object-contain brightness-0`}
        />
        <Paddle number={1} className={`absolute -bottom-1 -rotate-12 ${compact ? "left-2" : "left-[14%]"} ${paddle}`} />
        <Paddle number={2} className={`absolute -bottom-1 rotate-12 ${compact ? "right-2" : "right-[14%]"} ${paddle}`} />
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
