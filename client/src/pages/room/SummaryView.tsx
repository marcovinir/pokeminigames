import type { GameEndedPayload, PokemonView, Seat } from "@pokemon-minigames/shared";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { PokemonCard } from "../../components/PokemonCard";
import { END_REASON_LABELS } from "../../i18n/es";
import { useRoom } from "./use-room";

function TeamColumn({ title, team, total }: { title: string; team: PokemonView[]; total: number }) {
  return (
    <section aria-label={`Equipo de ${title}`} className="flex flex-col gap-2">
      <h2 className="text-sm text-muted">{title}</h2>
      <p className="font-num text-2xl font-medium tabular-nums">{total}</p>
      {team.length === 0 ? <p className="text-sm text-muted">No ganó ningún Pokémon.</p> : null}
      {team.map((pokemon) => (
        <PokemonCard key={pokemon.id} pokemon={pokemon} showStats />
      ))}
    </section>
  );
}

/** "Ganaste", "Perdiste" o "Empate", según el asiento propio. */
export function verdictLabel(ended: GameEndedPayload, mySeat: Seat): string {
  return ended.winnerSeat === null ? "Empate" : ended.winnerSeat === mySeat ? "Ganaste" : "Perdiste";
}

/** El marcador final leído desde el lado propio: "800 – 400". */
export function scoreLabel(ended: GameEndedPayload, mySeat: Seat): string {
  return `${ended.totals[mySeat]} – ${ended.totals[mySeat === 1 ? 2 : 1]}`;
}

export function SummaryView() {
  const { view, opponent } = useRoom();
  const navigate = useNavigate();
  const ended = view.ended;
  if (!ended || view.mySeat === null) return null;

  const mySeat = view.mySeat;
  const rivalSeat: Seat = mySeat === 1 ? 2 : 1;
  const verdict = verdictLabel(ended, mySeat);

  return (
    <section className="flex flex-col gap-5">
      <div className="framed rounded-card bg-surface p-5 text-center">
        <h1 className="text-2xl font-medium">{verdict}</h1>
        <p className="mt-1 text-sm text-muted">{END_REASON_LABELS[ended.reason]}</p>
        <p className="mt-2 font-num text-lg tabular-nums">
          {scoreLabel(ended, mySeat)}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <TeamColumn title="Tú" team={ended.teams[mySeat]} total={ended.totals[mySeat]} />
        <TeamColumn title={opponent?.username ?? "Tu rival"} team={ended.teams[rivalSeat]} total={ended.totals[rivalSeat]} />
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" onClick={() => navigate("/", { state: { config: view.config } })}>
          Jugar de nuevo
        </Button>
        <Button onClick={() => navigate("/")}>Volver al lobby</Button>
      </div>
    </section>
  );
}
