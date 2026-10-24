import { GAME_KINDS, type GameKind } from "@pokemon-minigames/shared";
import { Link } from "react-router";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { rise } from "../components/rise";
import { TypeChip } from "../components/TypeChip";
import { artworkUrl } from "../catalog/artwork";
import { GAME_CARDS, MENU_TEXT } from "../i18n/es";
import { useSession } from "../services";
import { lobbyPath } from "./lobby-path";

/** El dibujo de cada tarjeta: los dos tipos de «Doble tipo» y una silueta sobre los rayos de la silueta. */
function GameArt({ game }: { game: GameKind }) {
  if (game === "doble_tipo") {
    return (
      <div aria-hidden="true" className="flex h-28 items-center justify-center gap-2 rounded-card bg-surface-2">
        <TypeChip type="flying" />
        <span className="font-display text-xl font-semibold text-muted">+</span>
        <TypeChip type="fire" />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="silhouette-rays flex h-28 items-center justify-center overflow-hidden rounded-card">
      <img src={artworkUrl(94)} alt="" width={96} height={96} className="size-24 object-contain brightness-0" />
    </div>
  );
}

/** «¿A qué jugamos?»: una tarjeta por minijuego; «Jugar» lleva a su lobby. */
export function MainMenu() {
  const user = useSession((s) => s.user);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div style={rise(0)} className="animate-rise">
        {user ? <p className="text-sm font-semibold text-muted">Hola, {user.username}</p> : null}
        <h1 className="font-display text-3xl font-semibold">{MENU_TEXT.title}</h1>
        <p className="text-muted">{MENU_TEXT.subtitle}</p>
      </div>
      {GAME_KINDS.map((game, index) => {
        const card = GAME_CARDS[game];
        return (
          <Card as="article" key={game} style={rise(index + 1)} className="animate-rise p-5">
            <GameArt game={game} />
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
    </div>
  );
}
