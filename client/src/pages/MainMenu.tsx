import { GAME_KINDS, type GameKind } from "@pokemon-minigames/shared";
import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { rise } from "../components/rise";
import { TypeChip } from "../components/TypeChip";
import { artworkUrl } from "../catalog/artwork";
import { GAME_CARDS, MENU_TEXT } from "../i18n/es";
import { useSession } from "../services";
import { TYPE_STYLES } from "../theme/type-styles";
import { lobbyPath } from "./lobby-path";
import { DOBLE_TIPO_EXAMPLES, type DobleTipoExample, MENU_BACKGROUNDS, type MenuBackground, pickRandom } from "./menu-art";

/**
 * El dibujo de cada tarjeta. «Doble tipo»: el arte de un Pokémon de ejemplo sobre un fondo partido en los colores de
 * sus dos tipos, con los tipos debajo. La silueta: un Pokémon en negro sobre los rayos.
 */
function GameArt({ game, example }: { game: GameKind; example: DobleTipoExample }) {
  if (game === "doble_tipo") {
    const [first, second] = example.types;
    return (
      <div aria-hidden="true">
        <div
          className="flex h-32 items-center justify-center overflow-hidden rounded-card"
          style={{
            background: `linear-gradient(115deg, ${TYPE_STYLES[first].background} 0 50%, ${TYPE_STYLES[second].background} 50% 100%)`,
          }}
        >
          <img
            src={artworkUrl(example.pokemonId)}
            alt=""
            width={128}
            height={128}
            className="size-32 object-contain drop-shadow-[0_4px_6px_rgb(0_0_0/0.35)]"
          />
        </div>
        <div className="mt-2 flex justify-center gap-2">
          <TypeChip type={first} />
          <TypeChip type={second} />
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="silhouette-rays flex h-32 items-center justify-center overflow-hidden rounded-card">
      <img src={artworkUrl(94)} alt="" width={96} height={96} className="size-24 object-contain brightness-0" />
    </div>
  );
}

/** El fanart de fondo: llena la pantalla detrás del menú, con un velo del color del tema para que todo se lea. */
function MenuBackdrop({ background }: { background: MenuBackground }) {
  return (
    <div data-menu-background aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <img src={background.src} alt="" className="size-full object-cover object-[center_30%]" />
      <div className="menu-veil absolute inset-0" />
    </div>
  );
}

/** «¿A qué jugamos?»: una tarjeta por minijuego; «Jugar» lleva a su lobby. */
export function MainMenu({
  random = Math.random,
  backgrounds = MENU_BACKGROUNDS,
}: {
  /** El azar que elige el ejemplo y el fondo (las pruebas lo fijan). */
  random?: () => number;
  backgrounds?: readonly MenuBackground[];
} = {}) {
  const user = useSession((s) => s.user);
  // Se eligen una vez al abrir el menú: no cambian mientras se está en él.
  const [example] = useState(() => pickRandom(DOBLE_TIPO_EXAMPLES, random)!);
  const [background] = useState(() => pickRandom(backgrounds, random));
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      {background ? <MenuBackdrop background={background} /> : null}
      {/* Con fanart, el título va sobre un panel translúcido: el velo es ligero para que el dibujo luzca. */}
      <div style={rise(0)} className={background ? "menu-panel animate-rise self-start rounded-card px-4 py-3" : "animate-rise"}>
        {user ? <p className="text-sm font-semibold text-muted">Hola, {user.username}</p> : null}
        <h1 className="font-display text-3xl font-semibold">{MENU_TEXT.title}</h1>
        <p className="text-muted">{MENU_TEXT.subtitle}</p>
      </div>
      {GAME_KINDS.map((game, index) => {
        const card = GAME_CARDS[game];
        return (
          <Card as="article" key={game} style={rise(index + 1)} className="animate-rise p-5">
            <GameArt game={game} example={example} />
            <h2 className="mt-4 flex flex-wrap items-center gap-2 font-display text-xl font-semibold">
              {card.name}
              {card.isNew ? <Badge tone="gold">{MENU_TEXT.newBadge}</Badge> : null}
            </h2>
            <p className="mt-1 text-sm text-muted">{card.description}</p>
            <Link
              to={lobbyPath(game)}
              className="mt-4 inline-flex items-center justify-center rounded-pill border-(length:--frame) border-accent-edge bg-accent px-7 py-3 font-display font-semibold text-accent-fg shadow-[0_var(--depth)_0_0_var(--accent-edge)] transition-transform duration-(--dur-fast) hover:-translate-y-px"
            >
              {MENU_TEXT.play}
              <span className="sr-only"> {card.name}</span>
            </Link>
          </Card>
        );
      })}
      {background ? (
        <p className="menu-panel self-start rounded-pill px-3 py-1 text-xs text-muted">
          {MENU_TEXT.backgroundCredit(background.title)}
          <a href={background.authorUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
            {background.author}
          </a>
        </p>
      ) : null}
    </div>
  );
}
