import { type GameEndedPayload, type PokemonView, type Seat, gameOf } from "@pokemon-minigames/shared";
import { useNavigate } from "react-router";
import { isGuest } from "../../api/types";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { GuestTag } from "../../components/GuestTag";
import { PokemonCard } from "../../components/PokemonCard";
import { rise } from "../../components/rise";
import { rivalSeat } from "../../game/seats";
import { endReasonLabel } from "../../i18n/es";
import { useSession } from "../../services";
import { lobbyPath } from "../lobby-path";
import { RematchLoadingView } from "./RematchLoadingView";
import { RematchPanel } from "./RematchPanel";
import { SilhouetteSummary } from "./SilhouetteSummary";
import { useRoom } from "./use-room";

/** El Pokémon de más puntos va primero (con el arte grande); los demás siguen en el orden en que se ganaron. */
function bestFirst(team: PokemonView[]): PokemonView[] {
  if (team.length === 0) return [];
  const best = team.reduce((top, pokemon, index) => (pokemon.totalStats > team[top]!.totalStats ? index : top), 0);
  return [team[best]!, ...team.filter((_, index) => index !== best)];
}

function TeamColumn({ title, team, total, index, guest = false }: { title: string; team: PokemonView[]; total: number; index: number; guest?: boolean }) {
  return (
    <section aria-label={`Equipo de ${title}`} style={rise(index)} className="animate-rise flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate font-display text-lg font-semibold">{title}</h2>
          {guest ? <GuestTag /> : null}
        </div>
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
  return `${ended.totals[mySeat]} – ${ended.totals[rivalSeat(mySeat)]}`;
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
  const { view, opponent, client } = useRoom();
  const navigate = useNavigate();
  const sessionUser = useSession((s) => s.user);
  const ended = view.ended;
  if (!ended || view.mySeat === null) return null;
  // Los dos aceptaron la revancha: mientras se abre la sala nueva se ve la pantalla «¡Revancha!».
  if (view.rematchOffer?.status === "starting" || view.nextRoom !== null) return <RematchLoadingView />;

  const mySeat = view.mySeat;
  const offerPending = view.rematchOffer?.status === "mine" || view.rematchOffer?.status === "theirs";
  const rival: Seat = rivalSeat(mySeat);
  const verdict = verdictLabel(ended, mySeat);
  const kind = ended.winnerSeat === null ? "drawn" : ended.winnerSeat === mySeat ? "won" : "lost";

  return (
    <section style={rise(0)} className="animate-rise flex flex-col gap-6">
      <Card data-verdict={kind} tone="raised" className={`p-8 text-center ${kind === "won" ? "border-gold animate-halo" : ""}`}>
        {kind === "lost" ? null : (
          <span aria-hidden="true" className={`mx-auto mb-3 inline-flex size-16 items-center justify-center rounded-full ${kind === "won" ? "bg-gold text-gold-fg" : "bg-surface-2 text-fg"}`}>
            {kind === "won" ? <TrophyIcon /> : <BalanceIcon />}
          </span>
        )}
        <h1 className="font-display text-4xl font-semibold">{verdict}</h1>
        <p className="mt-1 text-sm text-muted">{endReasonLabel(ended.reason, ended.silhouette !== undefined)}</p>
        <p className="mt-3 font-num text-3xl tabular-nums">{scoreLabel(ended, mySeat)}</p>
      </Card>

      <RematchPanel />

      {ended.silhouette ? (
        <SilhouetteSummary reveals={ended.silhouette.reveals} mySeat={mySeat} rival={opponent?.username ?? "Tu rival"} />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <TeamColumn title="Tú" team={ended.teams[mySeat]} total={ended.totals[mySeat]} index={1} />
          <TeamColumn title={opponent?.username ?? "Tu rival"} team={ended.teams[rival]} total={ended.totals[rival]} index={2} guest={opponent?.guest === true} />
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {/* Un invitado no tiene perfil: ni se ofrece el suyo ni el de quien juega contra él. Mientras la oferta espera
            respuesta tampoco: navegar cierra la conexión y el rival vería «se fue». */}
        {opponent && !opponent.guest && !isGuest(sessionUser) && !offerPending ? (
          // Con un nombre largo (hasta 30 letras seguidas) el botón se parte en vez de ensanchar la pantalla del teléfono.
          <Button size="lg" className="max-w-full [overflow-wrap:anywhere]" onClick={() => navigate(`/jugador/${encodeURIComponent(opponent.username)}`)}>
            Ver perfil de {opponent.username}
          </Button>
        ) : null}
        {/* Salir es explícito: con una oferta de revancha en marcha, el rival ve «se fue» al instante. */}
        <Button
          size="lg"
          variant="ghost"
          onClick={() => {
            client.leave();
            navigate(lobbyPath(gameOf(view.config ?? {})));
          }}
        >
          Volver al lobby
        </Button>
      </div>
    </section>
  );
}
