import type { BaseStats, FactPokemon, PokemonFact } from "@pokemon-minigames/shared";
import { TYPE_LABELS } from "./es";

/** Cómo se dice cada stat dentro de una frase («con más defensa base»); `total` es la suma de las seis. */
const STAT_WORDS: Record<keyof BaseStats | "total", string> = {
  total: "stats base totales",
  hp: "PS base",
  attack: "ataque base",
  defense: "defensa base",
  spAttack: "ataque especial base",
  spDefense: "defensa especial base",
  speed: "velocidad base",
};

/** «Alfa», «Alfa y Beto», «Alfa, Beto y Gama». */
function names(pokemon: FactPokemon[]): string {
  const list = pokemon.map((one) => one.es);
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} y ${list.at(-1)}`;
}

function extreme(more: boolean, what: string, pokemon: FactPokemon[], value: number): string {
  const subject = pokemon.length === 1 ? "El Pokémon" : "Los Pokémon";
  const verb = pokemon.length === 1 ? "es" : "son";
  return `${subject} con ${more ? "más" : "menos"} ${what} ${verb} ${names(pokemon)} (${value}).`;
}

/** Un dato curioso del servidor, redactado en español con las etiquetas de tipos del cliente. */
export function factText(fact: PokemonFact): string {
  switch (fact.kind) {
    case "top_stat":
      return extreme(true, STAT_WORDS[fact.stat], fact.pokemon, fact.value);
    case "lowest_total":
      return extreme(false, STAT_WORDS.total, fact.pokemon, fact.value);
    case "type_extreme":
      return `El tipo con ${fact.which === "most" ? "más" : "menos"} Pokémon es ${TYPE_LABELS[fact.type]}: ${fact.count}.`;
    case "dual_type_count":
      return `${fact.count} de los ${fact.total} Pokémon tienen dos tipos.`;
    case "pair_count":
      return `Existen ${fact.count} combinaciones de dos tipos con al menos un Pokémon.`;
    case "common_pair":
      return `La combinación de tipos más común es ${TYPE_LABELS[fact.pair[0]]} y ${TYPE_LABELS[fact.pair[1]]}: la tienen ${fact.count} Pokémon.`;
  }
}
