import type { Stats } from "@pokemon-minigames/shared";
import { Notice } from "../../components/Notice";
import { PokemonCard } from "../../components/PokemonCard";
import { StatTile } from "../../components/StatTile";
import { formatPercent, formatPower, formatScore, winsLabel } from "./format";

/** Las estadísticas de una persona. `own` solo cambia la persona gramatical de los mensajes. */
export function StatsView({ stats, own }: { stats: Stats; own: boolean }) {
  if (stats.played === 0) {
    return <Notice>{own ? "Todavía no has jugado ninguna partida." : "Todavía no ha jugado ninguna partida."}</Notice>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Resumen">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Partidas" value={String(stats.played)} />
          <StatTile label="Ganadas" value={String(stats.wins)} />
          <StatTile label="Empatadas" value={String(stats.draws)} />
          <StatTile label="Perdidas" value={String(stats.losses)} />
          <StatTile label="Victorias" value={formatPercent(stats.winRate)} ring={stats.winRate} />
          <StatTile label="Racha actual" value={String(stats.currentStreak)} />
          <StatTile label="Mejor racha" value={String(stats.bestStreak)} />
        </dl>
      </section>

      <section aria-label="Poder">
        <dl className="grid grid-cols-2 gap-3">
          <StatTile label="Poder promedio" value={formatPower(stats.averagePower)} />
          <StatTile label="Mejor partida" value={formatScore(stats.bestGameScore)} />
        </dl>
      </section>

      <section aria-label="Pokémon más ganados">
        <h2 className="mb-3 font-display text-lg font-semibold">Pokémon más ganados</h2>
        {stats.topPokemon.length === 0 ? (
          <p className="text-sm text-muted">
            {own ? "Todavía no has ganado ningún Pokémon." : "Todavía no ha ganado ningún Pokémon."}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {stats.topPokemon.map(({ pokemon, wins }, index) => (
              <li key={pokemon.id} className="relative">
                <span
                  data-medal
                  aria-hidden="true"
                  className="absolute left-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-full bg-gold font-display font-semibold text-gold-fg"
                >
                  {index + 1}
                </span>
                <PokemonCard pokemon={pokemon} size="lg" />
                <p className="mt-2 text-center text-sm text-muted">{winsLabel(wins)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
