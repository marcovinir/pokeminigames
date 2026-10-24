import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { GuestTag } from "../../components/GuestTag";
import { rise } from "../../components/rise";
import { Timer } from "../../components/Timer";
import { START_COUNTDOWN_MS } from "../../game/durations";
import { useRoom } from "./use-room";

export function CountdownView() {
  const { view, me, opponent } = useRoom();

  return (
    <Card as="section" tone="raised" style={rise(0)} className="animate-rise mx-auto w-full max-w-lg p-6 text-center sm:p-8">
      <h1 className="font-display text-2xl font-semibold [overflow-wrap:anywhere]">{opponent ? `Partida contra ${opponent.username}` : "Preparando la partida"}</h1>
      {opponent?.guest ? <GuestTag className="mt-2" /> : null}
      {me && opponent ? (
        <div className="mt-6 flex items-center justify-center gap-6">
          <Avatar name={me.username} avatarId={me.avatarId} size="xl" />
          <span aria-hidden="true" className="font-display text-2xl font-semibold text-muted">
            VS
          </span>
          <Avatar name={opponent.username} avatarId={opponent.avatarId} size="xl" />
        </div>
      ) : null}
      <p className="mt-6 text-sm text-muted">La partida empieza en…</p>
      <div className="mt-3">
        <Timer deadline={view.startsAt} offset={view.clockOffset} totalMs={START_COUNTDOWN_MS} label="Inicio de la partida" size={160} urgentAtMs={0} />
      </div>
    </Card>
  );
}
