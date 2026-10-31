import { PLAYABLE_GAMES } from "@pokemon-minigames/shared";
import { useState } from "react";
import { Badge } from "../components/Badge";
import { GameArt } from "../components/GameArt";
import { LogoMark } from "../components/Logo";
import { rise } from "../components/rise";
import { AUTH_HERO_TEXT, GAME_CARDS, MENU_TEXT } from "../i18n/es";
import { DOBLE_TIPO_EXAMPLES, pickCovers, pickRandom } from "./menu-art";

/**
 * La parte de la izquierda de las pantallas de acceso: el lema y los minijuegos que hay (uno por cada `PLAYABLE_GAMES`,
 * con el mismo dibujo que en el menú). En pantallas estrechas solo queda el lema, para que el formulario esté a la vista.
 */
export function AuthHero({ random = Math.random }: { random?: () => number } = {}) {
  const [example] = useState(() => pickRandom(DOBLE_TIPO_EXAMPLES, random)!);
  const [covers] = useState(() => pickCovers(random));
  return (
    <div data-hero style={rise(0)} className="animate-rise flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <LogoMark size={64} className="animate-beat" />
        <p className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
          {AUTH_HERO_TEXT.lead} <span className="text-accent">{AUTH_HERO_TEXT.highlight}</span> {AUTH_HERO_TEXT.tail}
        </p>
      </div>

      <div className="hidden md:block">
        <ul aria-label={AUTH_HERO_TEXT.gamesLabel} role="list" className="flex flex-col gap-4">
          {PLAYABLE_GAMES.map((game) => {
            const card = GAME_CARDS[game];
            return (
              <li key={game} className="flex items-center gap-4">
                <GameArt game={game} example={example} covers={covers} compact />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
                    {card.name}
                    {card.isNew ? <Badge tone="gold">{MENU_TEXT.newBadge}</Badge> : null}
                  </p>
                  <p className="text-sm text-muted">{card.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
