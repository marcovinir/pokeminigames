import { Autocomplete } from "../../components/Autocomplete";
import { Card } from "../../components/Card";
import { Notice } from "../../components/Notice";
import { OpponentPanel, TeamPanel } from "../../components/Panels";
import { Timer } from "../../components/Timer";
import { TypeChip } from "../../components/TypeChip";
import { ROUND_MS } from "../../game/durations";
import { useNames } from "../../services";
import { LeaveButton } from "./LeaveButton";
import { useRoom } from "./use-room";

const DOT_STATE = (index: number, current: number): "done" | "current" | "todo" =>
  index + 1 < current ? "done" : index + 1 === current ? "current" : "todo";

/** Un punto por ronda de la partida (solo cuando las rondas son fijas): las jugadas, la actual y las que faltan. */
function RoundDots({ total, current }: { total: number; current: number }) {
  return (
    <div data-progress aria-hidden="true" className="mt-2 flex flex-wrap justify-center gap-1.5">
      {Array.from({ length: total }, (_, index) => {
        const state = DOT_STATE(index, current);
        return (
          <span
            key={index}
            data-dot={state}
            className={`size-2.5 rounded-full ${state === "todo" ? "bg-surface-2" : "bg-accent"} ${state === "current" ? "animate-beat ring-2 ring-accent/40" : ""}`}
          />
        );
      })}
    </div>
  );
}

/** La pantalla central: tu equipo, el par de tipos con su cronómetro y el rival. */
export function RoundView() {
  const { view, client, me, opponent } = useRoom();
  const names = useNames((s) => s.names);
  const round = view.round;
  if (!round || !round.pair) return null;

  const config = view.config;
  const goal =
    config?.roundsLimit != null
      ? `Ronda ${round.number} de ${config.roundsLimit}`
      : `Ronda ${round.number} · meta de ${config?.statsGoal} puntos`;

  return (
    <section className="flex flex-col gap-4">
      {/* En pantallas estrechas los paneles de equipo se resumen en una sola barra. */}
      <p aria-label="Marcador" className="framed rounded-pill bg-surface px-4 py-2 text-center text-sm shadow-card md:hidden">
        Tú <span className="font-num font-semibold tabular-nums">{me?.totalStats ?? 0}</span> ·{" "}
        {opponent?.username ?? "Rival"} <span className="font-num font-semibold tabular-nums">{opponent?.totalStats ?? 0}</span>
      </p>

      <div className="grid gap-4 md:grid-cols-[1fr_1.6fr_1fr]">
        <div className="hidden md:block">
          <TeamPanel team={view.myTeam} total={me?.totalStats ?? 0} />
        </div>

        <Card data-arena tone="raised" className="flex flex-col gap-5 p-6">
          <div className="text-center">
            <h1 className="font-display text-sm font-semibold text-muted">{goal}</h1>
            {config?.roundsLimit != null ? <RoundDots total={config.roundsLimit} current={round.number} /> : null}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3" aria-label="Par de tipos">
              <TypeChip type={round.pair[0]} size="lg" />
              <span aria-hidden="true" className="font-display text-2xl font-semibold text-muted">
                +
              </span>
              <TypeChip type={round.pair[1]} size="lg" />
            </div>
            <p className="mt-3 text-sm">Nombra un Pokémon que tenga los dos tipos.</p>
          </div>

          <Timer deadline={round.deadline} offset={view.clockOffset} totalMs={ROUND_MS} label="Tiempo de la ronda" />

          {round.typesNotice === "pair_replaced" ? (
            <Notice>El par elegido no tenía suficientes Pokémon; el servidor sorteó otro.</Notice>
          ) : null}

          <Autocomplete names={names} submitted={round.answered} autoFocus onSubmit={(text) => client.submit(text)} />
        </Card>

        <div className="hidden md:block">
          <OpponentPanel
            name={opponent?.username ?? "Tu rival"}
            total={opponent?.totalStats ?? 0}
            teamSize={opponent?.teamSize ?? 0}
            connected={opponent?.connected ?? true}
          />
        </div>
      </div>

      <div className="text-center">
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
