import type { PokemonView } from "@pokemon-minigames/shared";

/** Tu equipo: lo que has ganado hasta ahora y su total. */
export function TeamPanel({ team, total }: { team: PokemonView[]; total: number }) {
  return (
    <section aria-label="Tu equipo" className="framed rounded-card bg-surface p-3">
      <h2 className="text-xs text-muted">Tu equipo</h2>
      <p className="font-num text-2xl font-medium tabular-nums">{total}</p>
      {team.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Todavía no tienes Pokémon.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {team.map((pokemon) => (
            <li key={pokemon.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{pokemon.names.es}</span>
              <span className="font-num tabular-nums text-muted">{pokemon.totalStats}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** El rival: solo su total y cuántos Pokémon lleva; sus nombres se revelan al cerrar cada ronda. */
export function OpponentPanel({
  name,
  total,
  teamSize,
  connected,
}: {
  name: string;
  total: number;
  teamSize: number;
  connected: boolean;
}) {
  return (
    <section aria-label="Tu rival" className="framed rounded-card bg-surface p-3">
      <h2 className="truncate text-xs text-muted">{name}</h2>
      <p className="font-num text-2xl font-medium tabular-nums">{total}</p>
      <p className="mt-2 text-sm">
        {teamSize === 1 ? "1 Pokémon" : `${teamSize} Pokémon`}
      </p>
      <p className="mt-1 text-xs text-muted">Sus nombres se revelan al cerrar la ronda.</p>
      {connected ? null : <p className="mt-1 text-xs text-danger">Desconectado</p>}
    </section>
  );
}
