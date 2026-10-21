import type { PokemonView } from "@pokemon-minigames/shared";
import { AnimatedNumber } from "./AnimatedNumber";
import { ArtImage } from "./ArtImage";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { GuestTag } from "./GuestTag";

/** La lista de Pokémon de un equipo: miniatura, nombre (en una línea) y total. */
function TeamList({ team }: { team: PokemonView[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-1.5 text-sm">
      {team.map((pokemon) => (
        <li key={pokemon.id} className="flex items-center gap-2">
          <ArtImage id={pokemon.id} spriteUrl={pokemon.spriteUrl} size={32} variant="sprite" />
          <span className="min-w-0 flex-1 truncate font-semibold">{pokemon.names.es}</span>
          <span className="font-num tabular-nums text-muted">{pokemon.totalStats}</span>
        </li>
      ))}
    </ul>
  );
}

/** Tu equipo: lo que has ganado hasta ahora y su total. */
export function TeamPanel({ team, total }: { team: PokemonView[]; total: number }) {
  return (
    <Card as="section" aria-label="Tu equipo" className="p-4">
      <h2 className="text-sm font-semibold text-muted">Tu equipo</h2>
      <p className="font-num text-4xl font-semibold tabular-nums">
        <AnimatedNumber value={total} />
      </p>
      {team.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Todavía no tienes Pokémon.</p>
      ) : (
        <TeamList team={team} />
      )}
    </Card>
  );
}

/** El rival: su total, cuántos Pokémon lleva y, de ellos, solo los ya revelados (cada uno se muestra al cerrar su ronda). */
export function OpponentPanel({
  name,
  total,
  teamSize,
  team,
  connected,
  guest = false,
}: {
  name: string;
  total: number;
  teamSize: number;
  team: PokemonView[];
  connected: boolean;
  guest?: boolean;
}) {
  return (
    <Card as="section" aria-label="Tu rival" className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Avatar name={name} size="sm" />
        <h2 className="min-w-0 truncate text-sm font-semibold text-muted">{name}</h2>
        {guest ? <GuestTag /> : null}
      </div>
      <p className="mt-2 font-num text-4xl font-semibold tabular-nums">
        <AnimatedNumber value={total} />
      </p>
      <p className="mt-2 text-sm font-semibold">{teamSize === 1 ? "1 Pokémon" : `${teamSize} Pokémon`}</p>
      {team.length === 0 ? <p className="mt-1 text-xs text-muted">Se revelan al cerrar cada ronda.</p> : <TeamList team={team} />}
      {connected ? null : (
        <Badge tone="danger" className="mt-2">
          Desconectado
        </Badge>
      )}
    </Card>
  );
}
