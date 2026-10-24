import { asDobleTipo } from "@pokemon-minigames/shared";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { secondsLeft, useCountdown } from "../../game/clock";
import type { GameView } from "../../game/apply-event";
import { REMATCH_TEXT, ROOM_GONE_CODES, TYPE_LABELS, errorMessage, rematchClosedMessage, rematchNoShow, rematchRequested, rematchWaiting } from "../../i18n/es";
import { useGame, useServices } from "../../services";
import { CountdownView } from "./CountdownView";
import { RematchLoadingView, RematchNoShow } from "./RematchLoadingView";
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

/** Lo que se anuncia de la revancha (tras el veredicto): quién espera a quién, si empieza o por qué no hubo. */
function rematchAnnouncement(view: GameView): string {
  const rival = view.players.find((player) => player.seat !== view.mySeat)?.username ?? "Tu rival";
  switch (view.rematchOffer?.status) {
    case "mine":
      return rematchWaiting(rival);
    case "theirs":
      return rematchRequested(rival);
    case "starting":
      return `${REMATCH_TEXT.loadingTitle} ${REMATCH_TEXT.loadingSub}`;
    case "closed":
      return rematchClosedMessage(view.rematchOffer.closedReason ?? "failed", rival) ?? "";
    default:
      return "";
  }
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
    case "finished": {
      if (!view.ended || view.mySeat === null) return "";
      if (view.isRematchRoom && view.ended.reason === "expired") {
        return rematchNoShow(view.players.find((player) => player.seat !== view.mySeat)?.username ?? "Tu rival");
      }
      return [`${verdictLabel(view.ended, view.mySeat)}. ${scoreLabel(view.ended, view.mySeat)}`, rematchAnnouncement(view)].filter(Boolean).join(" ");
    }
    default:
      return "";
  }
}

function RoomView() {
  const { view } = useRoom();
  switch (view.phase) {
    case "waiting":
      // Una sala de revancha ya tiene a los dos sentados: no hay código que compartir, solo esperar a que entren.
      return view.isRematchRoom ? <RematchLoadingView /> : <WaitingView />;
    case "starting":
      return <CountdownView />;
    case "choosing_types":
      return <TypePickerView />;
    case "round_active":
      return <RoundView />;
    case "round_result":
      return <RoundResultView />;
    case "finished":
      // Si la sala de la revancha caducó porque el rival no entró, no hubo partida: no hay veredicto.
      return view.isRematchRoom && view.ended?.reason === "expired" ? <RematchNoShow /> : <SummaryView />;
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
  const typeHints = useGame((s) => asDobleTipo(s.view.config)?.typeHints === true);
  const nextRoom = useGame((s) => s.view.nextRoom);

  useEffect(() => {
    game.client.join(code);
    // Al salir de la pantalla se cierra la conexión (y se limpia el estado).
    return () => game.client.dispose();
  }, [game.client, code]);

  // Los dos aceptaron la revancha: a la sala nueva (sin dejar la vieja en el historial del navegador).
  useEffect(() => {
    if (nextRoom) navigate(`/sala/${encodeURIComponent(nextRoom)}`, { replace: true });
  }, [nextRoom, navigate]);

  // Los tipos de cada Pokémon solo se piden en las salas con «Pistas de tipos»; sin ellas ni siquiera viajan.
  useEffect(() => {
    void names.getState().load({ withTypes: typeHints });
  }, [names, typeHints]);

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
