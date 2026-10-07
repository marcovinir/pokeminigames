import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { secondsLeft, useCountdown } from "../../game/clock";
import type { GameView } from "../../game/apply-event";
import { ROOM_GONE_CODES, TYPE_LABELS, errorMessage } from "../../i18n/es";
import { useGame, useServices } from "../../services";
import { CountdownView } from "./CountdownView";
import { RoundResultView } from "./RoundResultView";
import { RoundView } from "./RoundView";
import { SummaryView, scoreLabel, verdictLabel } from "./SummaryView";
import { TypePickerView } from "./TypePickerView";
import { WaitingView } from "./WaitingView";
import { useRoom } from "./use-room";

/** Avisa de que el rival se cayó y cuánto tiempo tiene para volver antes de perder la partida. */
function OpponentAwayNotice() {
  const { view, opponent } = useRoom();
  const remaining = useCountdown(view.opponentGraceEndsAt, view.clockOffset);
  if (view.opponentGraceEndsAt === null || view.phase === "finished") return null;
  return (
    // Lo que cambia cada segundo (la cuenta atrás) va oculto para los lectores de pantalla: si no, repetirían el aviso.
    <Notice tone="danger" urgent>
      <span>{opponent?.username ?? "Tu oponente"} se desconectó.</span>{" "}
      <span aria-hidden="true">Tiene {secondsLeft(remaining)} s para volver.</span>
    </Notice>
  );
}

/** Lo que se anuncia a los lectores de pantalla al cambiar de fase (lo visual cambia, pero no se oye). */
function announcement(view: GameView): string {
  switch (view.phase) {
    case "starting":
      return "La partida empieza.";
    case "choosing_types":
      return `Ronda ${view.round?.number ?? ""}: elige un tipo.`;
    case "round_active":
      return view.round?.pair
        ? `Ronda ${view.round.number}: ${TYPE_LABELS[view.round.pair[0]]} y ${TYPE_LABELS[view.round.pair[1]]}.`
        : "";
    case "finished":
      return view.ended && view.mySeat !== null ? `${verdictLabel(view.ended, view.mySeat)}. ${scoreLabel(view.ended, view.mySeat)}` : "";
    default:
      return "";
  }
}

function RoomView() {
  const { view } = useRoom();
  switch (view.phase) {
    case "waiting":
      return <WaitingView />;
    case "starting":
      return <CountdownView />;
    case "choosing_types":
      return <TypePickerView />;
    case "round_active":
      return <RoundView />;
    case "round_result":
      return <RoundResultView />;
    case "finished":
      return <SummaryView />;
    default:
      return (
        <p role="status" className="text-center text-muted">
          Conectando con la sala…
        </p>
      );
  }
}

export function RoomPage() {
  const { code = "" } = useParams();
  const { game, names } = useServices();
  const navigate = useNavigate();
  const error = useGame((s) => s.view.lastError);
  const connection = useGame((s) => s.connection);
  const phase = useGame((s) => s.view.phase);
  const ended = useGame((s) => s.view.ended);
  const view = useGame((s) => s.view);

  useEffect(() => {
    game.client.join(code);
    void names.getState().load();
    // Al salir de la pantalla se cierra la conexión (y se limpia el estado).
    return () => game.client.dispose();
  }, [game.client, names, code]);

  // La sala ya no existe, terminó o no eres parte de ella: no hay nada más que hacer aquí.
  // Con la partida terminada el resumen se queda: el servidor ya cerró la sala y es lo esperable.
  const gone = error !== null && ROOM_GONE_CODES.includes(error.code);
  if (error && gone && !ended) {
    return (
      <section className="mx-auto max-w-md text-center">
        <Notice tone="danger">{errorMessage(error.code)}</Notice>
        <div className="mt-4">
          <Button variant="primary" onClick={() => navigate("/")}>
            Volver al lobby
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="log" aria-label="Anuncios de la partida" className="sr-only">
        {announcement(view)}
      </p>
      {connection === "disconnected" && phase !== "finished" ? <Notice>Conexión perdida. Reconectando…</Notice> : null}
      {connection === "replaced" && phase !== "finished" ? (
        <Notice
          action={
            <Button variant="primary" onClick={() => game.client.join(code)}>
              Jugar aquí
            </Button>
          }
        >
          <span>Abriste esta partida en otra pestaña.</span>
        </Notice>
      ) : null}
      <OpponentAwayNotice />
      {error && !gone ? <Notice tone="danger">{errorMessage(error.code)}</Notice> : null}
      <RoomView />
    </div>
  );
}
