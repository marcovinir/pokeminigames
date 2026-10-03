import type { Stats } from "@pokemon-minigames/shared";
import { Notice } from "../../components/Notice";
import { PokemonCard } from "../../components/PokemonCard";
import { formatPercent, formatPower, formatScore, winsLabel } from "./format";

const SECTION = "framed rounded-card bg-surface p-4";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-num text-2xl font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** Las estadísticas de una persona. `own` solo cambia la persona gramatical de los mensajes. */
export function StatsView({ stats, own }: { stats: Stats; own: boolean }) {
  if (stats.played === 0) {
    return <Notice>{own ? "Todavía no has jugado ninguna partida." : "Todavía no ha jugado ninguna partida."}</Notice>;
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Resumen" className={SECTION}>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Partidas" value={String(stats.played)} />
          <Fact label="Ganadas" value={String(stats.wins)} />
          <Fact label="Empatadas" value={String(stats.draws)} />
          <Fact label="Perdidas" value={String(stats.losses)} />
          <Fact label="Victorias" value={formatPercent(stats.winRate)} />
          <Fact label="Racha actual" value={String(stats.currentStreak)} />
          <Fact label="Mejor racha" value={String(stats.bestStreak)} />
        </dl>
      </section>

      <section aria-label="Poder" className={SECTION}>
        <dl className="grid grid-cols-2 gap-4">
          <Fact label="Poder promedio" value={formatPower(stats.averagePower)} />
          <Fact label="Mejor partida" value={formatScore(stats.bestGameScore)} />
        </dl>
      </section>

      <section aria-label="Pokémon más ganados">
        <h2 className="mb-2 text-sm text-muted">Pokémon más ganados</h2>
        {stats.topPokemon.length === 0 ? (
          <p className="text-sm text-muted">
            {own ? "Todavía no has ganado ningún Pokémon." : "Todavía no ha ganado ningún Pokémon."}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {stats.topPokemon.map(({ pokemon, wins }) => (
              <li key={pokemon.id}>
                <PokemonCard pokemon={pokemon} />
                <p className="mt-1 text-center text-sm text-muted">{winsLabel(wins)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
