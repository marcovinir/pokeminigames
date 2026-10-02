import { Timer } from "../../components/Timer";
import { START_COUNTDOWN_MS } from "../../game/durations";
import { useRoom } from "./use-room";

export function CountdownView() {
  const { view, opponent } = useRoom();

  return (
    <section className="framed mx-auto max-w-md rounded-card bg-surface p-6 text-center">
      <h1 className="text-xl font-medium">{opponent ? `Partida contra ${opponent.username}` : "Preparando la partida"}</h1>
      <p className="mt-2 text-sm text-muted">La partida empieza en…</p>
      <div className="mt-3">
        <Timer deadline={view.startsAt} offset={view.clockOffset} totalMs={START_COUNTDOWN_MS} label="Inicio de la partida" />
      </div>
    </section>
  );
}
