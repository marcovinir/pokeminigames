import type { BaseStats, PokemonView } from "@pokemon-minigames/shared";
import { STAT_LABELS } from "../i18n/es";
import { TypeChip } from "./TypeChip";

export interface PokemonCardProps {
  pokemon: PokemonView;
  /** Muestra las seis stats base (en el resumen final). */
  showStats?: boolean;
}

export function PokemonCard({ pokemon, showStats = false }: PokemonCardProps) {
  return (
    <article className="framed rounded-card bg-surface p-3">
      <div className="flex items-center gap-3">
        <img src={pokemon.spriteUrl} alt="" width={56} height={56} loading="lazy" className="h-14 w-14 shrink-0" />
        <div className="min-w-0">
          <h3 className="truncate font-medium">{pokemon.names.es}</h3>
          <p className="truncate text-xs text-muted">{pokemon.names.en}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {pokemon.types.map((type) => (
              <TypeChip key={type} type={type} />
            ))}
          </div>
        </div>
        <p className="ml-auto font-num text-lg tabular-nums" aria-label={`${pokemon.totalStats} puntos en total`}>
          {pokemon.totalStats}
        </p>
      </div>
      {showStats ? (
        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
          {(Object.keys(STAT_LABELS) as (keyof BaseStats)[]).map((stat) => (
            <div key={stat} className="flex justify-between gap-1">
              <dt className="text-muted">{STAT_LABELS[stat]}</dt>
              <dd className="font-num tabular-nums">{pokemon.stats[stat]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
