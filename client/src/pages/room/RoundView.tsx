import { Autocomplete } from "../../components/Autocomplete";
import { Notice } from "../../components/Notice";
import { OpponentPanel, TeamPanel } from "../../components/Panels";
import { Timer } from "../../components/Timer";
import { TypeChip } from "../../components/TypeChip";
import { ROUND_MS } from "../../game/durations";
import { useNames } from "../../services";
import { LeaveButton } from "./LeaveButton";
import { useRoom } from "./use-room";

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
      <p className="framed rounded-card bg-surface px-3 py-2 text-center text-sm md:hidden" aria-label="Marcador">
        Tú <span className="font-num font-medium tabular-nums">{me?.totalStats ?? 0}</span> ·{" "}
        {opponent?.username ?? "Rival"} <span className="font-num font-medium tabular-nums">{opponent?.totalStats ?? 0}</span>
      </p>

      <div className="grid gap-4 md:grid-cols-[1fr_1.6fr_1fr]">
        <div className="hidden md:block">
          <TeamPanel team={view.myTeam} total={me?.totalStats ?? 0} />
        </div>

        <div className="framed flex flex-col gap-4 rounded-card bg-surface p-4">
          <div className="text-center">
            <h1 className="text-sm text-muted">{goal}</h1>
            <div className="mt-2 flex flex-wrap justify-center gap-2" aria-label="Par de tipos">
              <TypeChip type={round.pair[0]} className="text-base" />
              <TypeChip type={round.pair[1]} className="text-base" />
            </div>
            <p className="mt-2 text-sm">Nombra un Pokémon que tenga los dos tipos.</p>
          </div>

          <Timer deadline={round.deadline} offset={view.clockOffset} totalMs={ROUND_MS} label="Tiempo de la ronda" />

          {round.typesNotice === "pair_replaced" ? (
            <Notice>El par elegido no tenía suficientes Pokémon; el servidor sorteó otro.</Notice>
          ) : null}

          <Autocomplete names={names} submitted={round.answered} autoFocus onSubmit={(text) => client.submit(text)} />
        </div>

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
