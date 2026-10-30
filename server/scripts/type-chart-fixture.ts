import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TYPE_NAMES } from "@pokemon-minigames/shared";

/** Regenera la referencia de las pruebas de `type-chart`: la tabla de efectividad tal como la da PokeAPI. */
interface PokeApiType {
  name: string;
  damage_relations: Record<"double_damage_to" | "half_damage_to" | "no_damage_to", { name: string }[]>;
}

const chart: Record<string, Record<string, number>> = {};
for (const attacker of TYPE_NAMES) {
  const response = await fetch(`https://pokeapi.co/api/v2/type/${attacker}`);
  if (!response.ok) throw new Error(`PokeAPI respondió ${response.status} con ${attacker}`);
  const { damage_relations: relations } = (await response.json()) as PokeApiType;
  const has = (list: { name: string }[], defender: string) => list.some((type) => type.name === defender);
  chart[attacker] = Object.fromEntries(
    TYPE_NAMES.map((defender) => [
      defender,
      has(relations.no_damage_to, defender) ? 0 : has(relations.half_damage_to, defender) ? 0.5 : has(relations.double_damage_to, defender) ? 2 : 1,
    ]),
  );
}
writeFileSync(join(import.meta.dirname, "../test/shared/fixtures/type-chart.pokeapi.json"), `${JSON.stringify(chart, null, 2)}\n`);
