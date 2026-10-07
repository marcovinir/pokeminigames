import type { GameEndedPayload, PokemonView, Seat } from "@pokemon-minigames/shared";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PokemonCard } from "../../components/PokemonCard";
import { END_REASON_LABELS } from "../../i18n/es";
import { useRoom } from "./use-room";

/** El Pokémon de más puntos va primero (con el arte grande); los demás siguen en el orden en que se ganaron. */
function bestFirst(team: PokemonView[]): PokemonView[] {
  if (team.length === 0) return [];
  const best = team.reduce((top, pokemon, index) => (pokemon.totalStats > team[top]!.totalStats ? index : top), 0);
  return [team[best]!, ...team.filter((_, index) => index !== best)];
}

function TeamColumn({ title, team, total }: { title: string; team: PokemonView[]; total: number }) {
  return (
    <section aria-label={`Equipo de ${title}`} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="truncate font-display text-lg font-semibold">{title}</h2>
        <p className="font-num text-3xl font-semibold tabular-nums">{total}</p>
      </div>
      {team.length === 0 ? <p className="text-sm text-muted">No ganó ningún Pokémon.</p> : null}
      {bestFirst(team).map((pokemon, index) => (
        <PokemonCard key={pokemon.id} pokemon={pokemon} showStats size={index === 0 ? "lg" : "sm"} />
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

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-9" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

function BalanceIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-9" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 9h14M5 15h14" />
    </svg>
  );
}

export function SummaryView() {
  const { view, opponent } = useRoom();
  const navigate = useNavigate();
  const ended = view.ended;
  if (!ended || view.mySeat === null) return null;

  const mySeat = view.mySeat;
  const rivalSeat: Seat = mySeat === 1 ? 2 : 1;
  const verdict = verdictLabel(ended, mySeat);
  const kind = ended.winnerSeat === null ? "drawn" : ended.winnerSeat === mySeat ? "won" : "lost";

  return (
    <section className="flex flex-col gap-6">
      <Card data-verdict={kind} tone="raised" className={`p-8 text-center ${kind === "won" ? "border-gold animate-halo" : ""}`}>
        {kind === "lost" ? null : (
          <span aria-hidden="true" className={`mx-auto mb-3 inline-flex size-16 items-center justify-center rounded-full ${kind === "won" ? "bg-gold text-gold-fg" : "bg-surface-2 text-fg"}`}>
            {kind === "won" ? <TrophyIcon /> : <BalanceIcon />}
          </span>
        )}
        <h1 className="font-display text-4xl font-semibold">{verdict}</h1>
        <p className="mt-1 text-sm text-muted">{END_REASON_LABELS[ended.reason]}</p>
        <p className="mt-3 font-num text-3xl tabular-nums">{scoreLabel(ended, mySeat)}</p>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <TeamColumn title="Tú" team={ended.teams[mySeat]} total={ended.totals[mySeat]} />
        <TeamColumn title={opponent?.username ?? "Tu rival"} team={ended.teams[rivalSeat]} total={ended.totals[rivalSeat]} />
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" size="lg" onClick={() => navigate("/", { state: { config: view.config } })}>
          Jugar de nuevo
        </Button>
        {opponent ? (
          <Button size="lg" onClick={() => navigate(`/jugador/${encodeURIComponent(opponent.username)}`)}>
            Ver perfil de {opponent.username}
          </Button>
        ) : null}
        <Button size="lg" variant="ghost" onClick={() => navigate("/")}>
          Volver al lobby
        </Button>
      </div>
    </section>
  );
}
