import { PLAYABLE_GAMES } from "@pokemon-minigames/shared";
import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { rise } from "../components/rise";
import { GameArt } from "../components/GameArt";
import { GAME_CARDS, MENU_TEXT } from "../i18n/es";
import { useServices, useSession } from "../services";
import { lobbyPath } from "./lobby-path";
import { DOBLE_TIPO_EXAMPLES, MENU_BACKGROUNDS, type MenuBackground, pickCovers, pickRandom } from "./menu-art";

/** En qué pantallas se ve cada forma de dibujo: los verticales en el teléfono y los horizontales en las anchas. */
const SHAPE_VISIBILITY: Record<MenuBackground["shape"], string> = {
  portrait: "lg:hidden",
  landscape: "hidden lg:block",
};

/**
 * El fanart de fondo: llena la pantalla detrás del menú, con un velo del color del tema para que todo se lea. Hay una
 * capa por forma (vertical para el teléfono, horizontal para pantallas anchas): un dibujo de la otra forma se vería
 * ampliado y recortado, así que si falta una forma esas pantallas se quedan sin fanart.
 */
function MenuBackdrop({ portrait, landscape }: { portrait?: MenuBackground; landscape?: MenuBackground }) {
  return (
    <div data-menu-background aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      {portrait ? (
        <div data-menu-phone className={`absolute inset-0 ${SHAPE_VISIBILITY.portrait}`}>
          <img src={portrait.src} alt="" className="size-full object-cover object-[center_30%]" />
          <div className="menu-veil absolute inset-0" />
        </div>
      ) : null}
      {landscape ? (
        <div data-menu-wide className={`absolute inset-0 ${SHAPE_VISIBILITY.landscape}`}>
          <img src={landscape.src} alt="" className="size-full object-cover" />
          <div className="menu-veil absolute inset-0" />
        </div>
      ) : null}
    </div>
  );
}

/** El crédito de un fondo, que solo se ve en las pantallas donde se ve ese dibujo. */
function BackgroundCredit({ background }: { background: MenuBackground }) {
  return (
    <p className={`menu-panel self-start rounded-pill px-3 py-1 text-xs text-muted ${SHAPE_VISIBILITY[background.shape]}`}>
      {background.author !== undefined ? (
        <>
          {MENU_TEXT.backgroundCredit(background.title)}
          <a href={background.authorUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            {background.author}
          </a>
        </>
      ) : (
        <>
          {MENU_TEXT.unknownAuthorCredit(background.title)}
          <Link to="/contacto" className="font-semibold underline">
            {MENU_TEXT.isItYours}
          </Link>
        </>
      )}
    </p>
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
  const { sound } = useServices();
  // Se eligen una vez al abrir el menú: no cambian mientras se está en él.
  const [example] = useState(() => pickRandom(DOBLE_TIPO_EXAMPLES, random)!);
  const [covers] = useState(() => pickCovers(random));
  const [portrait] = useState(() => pickRandom(backgrounds.filter((b) => b.shape === "portrait"), random));
  const [landscape] = useState(() => pickRandom(backgrounds.filter((b) => b.shape === "landscape"), random));
  const background = portrait ?? landscape;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      {background ? <MenuBackdrop portrait={portrait} landscape={landscape} /> : null}
      {/* Con fanart, el título va sobre un panel translúcido: el velo es ligero para que el dibujo luzca. */}
      <div style={rise(0)} className={background ? "menu-panel animate-rise self-start rounded-card px-4 py-3" : "animate-rise"}>
        {user ? <p className="text-sm font-semibold text-muted">Hola, {user.username}</p> : null}
        <h1 className="font-display text-3xl font-semibold">{MENU_TEXT.title}</h1>
        <p className="text-muted">{MENU_TEXT.subtitle}</p>
      </div>
      {PLAYABLE_GAMES.map((game, index) => {
        const card = GAME_CARDS[game];
        return (
          <Card as="article" key={game} style={rise(index + 1)} className="animate-rise p-5">
            <GameArt game={game} example={example} covers={covers} />
            <h2 className="mt-4 flex flex-wrap items-center gap-2 font-display text-xl font-semibold">
              {card.name}
              {card.isNew ? <Badge tone="gold">{MENU_TEXT.newBadge}</Badge> : null}
            </h2>
            <p className="mt-1 text-sm text-muted">{card.description}</p>
            <Link
              to={lobbyPath(game)}
              onClick={() => sound.play("click")}
              className="mt-4 inline-flex items-center justify-center rounded-pill border-(length:--frame) border-accent-edge bg-accent px-7 py-3 font-display font-semibold text-accent-fg shadow-[0_var(--depth)_0_0_var(--accent-edge)] transition-transform duration-(--dur-fast) hover:-translate-y-px"
            >
              {MENU_TEXT.play}
              <span className="sr-only"> {card.name}</span>
            </Link>
          </Card>
        );
      })}
      {portrait ? <BackgroundCredit background={portrait} /> : null}
      {landscape ? <BackgroundCredit background={landscape} /> : null}
    </div>
  );
}
