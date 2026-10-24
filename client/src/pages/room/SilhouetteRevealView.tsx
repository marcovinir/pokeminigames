import type { RoomPlayerView, SilhouetteAnswer } from "@pokemon-minigames/shared";
import { ArtImage } from "../../components/ArtImage";
import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { rise } from "../../components/rise";
import { secondsLeft, useCountdown } from "../../game/clock";
import { SILHOUETTE_SCREEN, silhouetteReveal, silhouetteRoundOf, silhouetteSeconds } from "../../i18n/es";
import { SilhouetteScoreboard } from "./SilhouetteRoundView";
import { useRoom } from "./use-room";

function AnswerRow({ player, label, answer }: { player: RoomPlayerView | null; label: string; answer: SilhouetteAnswer }) {
  return (
    <li aria-label={label} className="flex min-w-0 items-center gap-3 border-t border-line py-3 text-left first:border-t-0">
      <Avatar name={player?.username ?? label} avatarId={player?.avatarId} size="md" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold [overflow-wrap:anywhere]">{label}</p>
        <p className="text-sm text-muted [overflow-wrap:anywhere]">
          {answer.text ?? SILHOUETTE_SCREEN.noAnswer}
          {answer.text !== null ? (
            <>
              {" "}
              <span aria-hidden="true" className={answer.correct ? "text-success" : "text-danger"}>
                {answer.correct ? "✓" : "✗"}
              </span>
              <span className="sr-only">{answer.correct ? SILHOUETTE_SCREEN.correct : SILHOUETTE_SCREEN.wrong}</span>
              {answer.ms !== null ? ` · ${silhouetteSeconds(answer.ms)}` : null}
            </>
          ) : null}
        </p>
      </div>
      <p className={`font-num text-lg font-semibold tabular-nums ${answer.points > 0 ? "text-success" : ""}`}>+{answer.points}</p>
    </li>
  );
}

/** La revelación de la ronda: el Pokémon a color, lo que respondió cada uno y sus puntos. */
export function SilhouetteRevealView() {
  const { view, me, opponent } = useRoom();
  const reveal = view.silhouette?.lastReveal;
  const nextRoundAt = view.silhouette?.nextRoundAt ?? null;
  const untilNext = useCountdown(nextRoundAt, view.clockOffset);
  if (!reveal || view.mySeat === null) return null;
  const mySeat = view.mySeat;
  const rivalSeat = mySeat === 1 ? 2 : 1;

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <SilhouetteScoreboard />
      <Card tone="raised" style={rise(0)} className="animate-rise flex flex-col items-center gap-4 p-6 text-center">
        <p className="font-display text-sm font-semibold text-muted">{silhouetteRoundOf(reveal.round, view.silhouette!.totalRounds)}</p>
        <div className="silhouette-rays flex size-56 items-center justify-center overflow-hidden rounded-full sm:size-64">
          <ArtImage id={reveal.pokemon.id} spriteUrl={reveal.pokemon.spriteUrl} size={200} eager />
        </div>
        <h1 className="font-display text-3xl font-semibold [overflow-wrap:anywhere]">{silhouetteReveal(reveal.pokemon.names.es)}</h1>
        <ul aria-label={SILHOUETTE_SCREEN.answers} className="w-full">
          <AnswerRow player={me} label={SILHOUETTE_SCREEN.you} answer={reveal.answers[mySeat]} />
          <AnswerRow player={opponent} label={opponent?.username ?? "Tu rival"} answer={reveal.answers[rivalSeat]} />
        </ul>
        <p className="text-sm text-muted">{nextRoundAt === null ? "Calculando el resultado final…" : `Siguiente ronda en ${secondsLeft(untilNext)} s`}</p>
      </Card>
    </section>
  );
}
