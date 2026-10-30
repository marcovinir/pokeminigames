import type { Seat, SilhouetteReveal } from "@pokemon-minigames/shared";
import { rivalSeat } from "../../game/seats";
import { ArtImage } from "../../components/ArtImage";
import { Card } from "../../components/Card";
import { rise } from "../../components/rise";
import { SILHOUETTE_SCREEN, silhouetteRivalGotIt } from "../../i18n/es";

function whoGotIt(reveal: SilhouetteReveal, mySeat: Seat, rival: string): string {
  const mine = reveal.answers[mySeat].correct;
  const theirs = reveal.answers[rivalSeat(mySeat)].correct;
  if (mine && theirs) return SILHOUETTE_SCREEN.bothGotIt;
  if (mine) return SILHOUETTE_SCREEN.youGotIt;
  if (theirs) return silhouetteRivalGotIt(rival);
  return SILHOUETTE_SCREEN.nobody;
}

/** El resumen de una partida de silueta: cada Pokémon que salió y quién lo acertó. */
export function SilhouetteSummary({ reveals, mySeat, rival }: { reveals: SilhouetteReveal[]; mySeat: Seat; rival: string }) {
  return (
    <Card as="section" style={rise(1)} className="animate-rise p-5">
      <h2 className="font-display text-lg font-semibold">{SILHOUETTE_SCREEN.pokemonList}</h2>
      <ol aria-label={SILHOUETTE_SCREEN.pokemonList} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {reveals.map((reveal) => (
          <li key={reveal.round} className="flex min-w-0 items-center gap-3 rounded-ui bg-surface-2 p-2">
            <ArtImage id={reveal.pokemon.id} spriteUrl={reveal.pokemon.spriteUrl} size={48} variant="sprite" />
            <div className="min-w-0">
              <p className="font-semibold [overflow-wrap:anywhere]">{reveal.pokemon.names.es}</p>
              <p className="text-sm text-muted [overflow-wrap:anywhere]">{whoGotIt(reveal, mySeat, rival)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
