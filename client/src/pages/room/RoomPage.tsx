import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { secondsLeft, useCountdown } from "../../game/clock";
import { ROOM_GONE_CODES, errorMessage } from "../../i18n/es";
import { useGame, useServices } from "../../services";
import { CountdownView } from "./CountdownView";
import { RoundResultView } from "./RoundResultView";
import { RoundView } from "./RoundView";
import { SummaryView } from "./SummaryView";
import { TypePickerView } from "./TypePickerView";
import { WaitingView } from "./WaitingView";
import { useRoom } from "./use-room";

/** Avisa de que el rival se cayó y cuánto tiempo tiene para volver antes de perder la partida. */
function OpponentAwayNotice() {
  const { view, opponent } = useRoom();
  const remaining = useCountdown(view.opponentGraceEndsAt, view.clockOffset);
  if (view.opponentGraceEndsAt === null || view.phase === "finished") return null;
  return (
    <Notice tone="danger" urgent>
      {opponent?.username ?? "Tu oponente"} se desconectó. Tiene {secondsLeft(remaining)} s para volver.
    </Notice>
  );
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

  useEffect(() => {
    game.client.join(code);
    void names.getState().load();
    // Al salir de la pantalla se cierra la conexión (y se limpia el estado).
    return () => game.client.dispose();
  }, [game.client, names, code]);

  // La sala ya no existe, terminó o no eres parte de ella: no hay nada más que hacer aquí.
  if (error && ROOM_GONE_CODES.includes(error.code)) {
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
      {connection === "disconnected" && phase !== "finished" ? <Notice>Conexión perdida. Reconectando…</Notice> : null}
      <OpponentAwayNotice />
      {error ? <Notice tone="danger">{errorMessage(error.code)}</Notice> : null}
      <RoomView />
    </div>
  );
}
