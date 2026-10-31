import { isSilhouetteConfig } from "@pokemon-minigames/shared";
import { useState } from "react";
import { Autocomplete } from "../../components/Autocomplete";
import { Card } from "../../components/Card";
import { GuestTag } from "../../components/GuestTag";
import { Notice } from "../../components/Notice";
import { rise } from "../../components/rise";
import { Timer } from "../../components/Timer";
import { namesInGenerations } from "../../catalog/generations";
import { ROUND_MS } from "../../game/durations";
import { OPPONENT_ANSWERED, SILHOUETTE_SCREEN, silhouetteAnsweredIn, silhouetteRoundOf } from "../../i18n/es";
import { useNames } from "../../services";
import { LeaveButton } from "./LeaveButton";
import { useRoom } from "./use-room";
import { useLastSeconds } from "../../sound/use-last-seconds";

/** La imagen de la silueta (la genera el servidor en negro). Si no carga, un aviso y la ronda sigue. */
export function SilhouetteImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="silhouette-rays mx-auto flex size-56 items-center justify-center overflow-hidden rounded-full sm:size-64">
      {failed ? (
        <p className="max-w-40 rounded-ui bg-surface px-3 py-2 text-center text-sm font-semibold text-fg">{SILHOUETTE_SCREEN.unavailable}</p>
      ) : (
        <img
          key={src}
          src={src}
          alt={SILHOUETTE_SCREEN.imageAlt}
          width={200}
          height={200}
          decoding="async"
          onError={() => setFailed(true)}
          className="size-48 object-contain sm:size-56"
        />
      )}
    </div>
  );
}

/** El marcador de la silueta (pegado bajo el encabezado): los puntos de los dos. Lo comparten la ronda y la revelación. */
export function SilhouetteScoreboard() {
  const { me, opponent } = useRoom();
  return (
    <div role="group" aria-label="Marcador" className="framed sticky top-(--header-h) z-10 rounded-pill bg-surface px-4 py-2 text-center text-sm shadow-card">
      {SILHOUETTE_SCREEN.you} <span className="font-num font-semibold tabular-nums">{me?.totalStats ?? 0}</span> ·{" "}
      {opponent?.username ?? "Rival"}{" "}
      {opponent?.guest ? (
        <>
          <GuestTag className="align-middle" />{" "}
        </>
      ) : null}
      <span className="font-num font-semibold tabular-nums">{opponent?.totalStats ?? 0}</span>
    </div>
  );
}

/** Una ronda de «¿Quién es ese Pokémon?»: la silueta, el reloj y un solo intento. */
export function SilhouetteRoundView() {
  const { view, client } = useRoom();
  const allNames = useNames((s) => s.names);
  const round = view.silhouette?.round;
  // Antes del primer `return`: los hooks van siempre en el mismo orden.
  useLastSeconds({ deadline: round?.deadline ?? null, offset: view.clockOffset, answered: round?.answered ?? true, round: round?.number ?? 0 });
  if (!round || !view.config || !isSilhouetteConfig(view.config)) return null;
  const names = namesInGenerations(allNames, view.config.generations);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <SilhouetteScoreboard />

      <Card data-arena tone="raised" style={rise(0)} className="animate-rise relative z-5 flex min-w-0 flex-col gap-5 p-6 text-center">
        <p className="font-display text-sm font-semibold text-muted">{silhouetteRoundOf(round.number, view.silhouette!.totalRounds)}</p>
        <SilhouetteImage src={round.silhouetteUrl} />
        <h1 className="font-display text-2xl font-semibold">{SILHOUETTE_SCREEN.question}</h1>
        <Timer deadline={round.deadline} offset={view.clockOffset} totalMs={ROUND_MS} label="Tiempo de la ronda" />
        {round.answered && round.answeredMs !== null ? <Notice tone="success">{silhouetteAnsweredIn(round.answeredMs)}</Notice> : null}
        {round.opponentAnswered ? <Notice>{OPPONENT_ANSWERED}</Notice> : null}
        <div className="text-left">
          <Autocomplete names={names} showSprites={false} submitted={round.answered} autoFocus onSubmit={(text) => client.submit(text)} />
        </div>
      </Card>

      <div className="text-center">
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
