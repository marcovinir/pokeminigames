import type { BaseStats, PokemonView } from "@pokemon-minigames/shared";
import { STAT_LABELS } from "../i18n/es";
import { typeGradient } from "../theme/type-styles";
import { ArtImage } from "./ArtImage";
import { Card } from "./Card";
import { TypeChip } from "./TypeChip";

/** Las barras de las stats llegan al 100 % con 180 puntos (las de los Pokémon más fuertes); más no cabe. */
const STAT_BAR_CAP = 180;

export interface PokemonCardProps {
  pokemon: PokemonView;
  /** Muestra las seis stats base como barras (en el resumen final). */
  showStats?: boolean;
  /** `lg` usa el arte oficial grande; solo donde hay pocas tarjetas a la vez. */
  size?: "sm" | "lg";
  /** Sin carga perezosa de la imagen: para lo que se ve de inmediato (el resultado de la ronda). */
  eager?: boolean;
}

export function PokemonCard({ pokemon, showStats = false, size = "sm", eager = false }: PokemonCardProps) {
  const large = size === "lg";
  const { top, bottom } = typeGradient(pokemon.types[0]!);

  return (
    <Card as="article" className={large ? "p-5" : "p-3"}>
      <div className={large ? "flex flex-col items-center gap-3 text-center" : "flex items-center gap-3"}>
        <span
          data-backdrop
          style={{ background: `radial-gradient(circle at 30% 25%, ${top}, ${bottom})` }}
          className={`inline-flex shrink-0 items-center justify-center rounded-full ${large ? "size-44" : "size-[72px]"}`}
        >
          <ArtImage id={pokemon.id} spriteUrl={pokemon.spriteUrl} size={large ? 144 : 64} variant={large ? "official" : "sprite"} eager={eager} className="rounded-full" />
        </span>
        <div className={large ? "min-w-0" : "min-w-0 flex-1"}>
          <h3 className={`truncate font-display font-semibold ${large ? "text-xl" : "text-lg"}`}>{pokemon.names.es}</h3>
          <p className="truncate text-xs text-muted">{pokemon.names.en}</p>
          <div className={`mt-1.5 flex flex-wrap gap-1 ${large ? "justify-center" : ""}`}>
            {pokemon.types.map((type) => (
              <TypeChip key={type} type={type} />
            ))}
          </div>
        </div>
        <p
          className={`font-num font-semibold tabular-nums ${large ? "text-3xl" : "ml-auto text-2xl"}`}
          aria-label={`${pokemon.totalStats} puntos en total`}
        >
          {pokemon.totalStats}
        </p>
      </div>
      {showStats ? (
        <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          {(Object.keys(STAT_LABELS) as (keyof BaseStats)[]).map((stat) => (
            <div key={stat}>
              <div className="flex justify-between gap-1">
                <dt className="text-muted">{STAT_LABELS[stat]}</dt>
                <dd className="font-num font-semibold tabular-nums">{pokemon.stats[stat]}</dd>
              </div>
              <div aria-hidden="true" className="mt-0.5 h-1.5 overflow-hidden rounded-pill bg-surface-2">
                <div
                  data-stat-bar
                  aria-hidden="true"
                  style={{ width: `${Math.min(100, (pokemon.stats[stat] / STAT_BAR_CAP) * 100)}%` }}
                  className="h-full rounded-pill bg-accent-2"
                />
              </div>
            </div>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}
