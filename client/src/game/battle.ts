import type { BattleAction, BattleFighterView, BattleMove, Seat, TypeName } from "@pokemon-minigames/shared";
import { TYPE_LABELS } from "../i18n/es";

type Names = Record<Seat, string>;

/** El color de la barra de vida: verde por encima del 50 %, amarilla hasta el 20 %, roja por debajo. */
export function hpTone(hp: number, maxHp: number): "good" | "warn" | "danger" {
  const share = hp / maxHp;
  return share > 0.5 ? "good" : share >= 0.2 ? "warn" : "danger";
}

export function moveLabel(move: BattleMove): string {
  if (move === "forcejeo") return "Forcejeo";
  if (move === "recuperar") return "Recuperar";
  const type = TYPE_LABELS[move as TypeName];
  return `Ataque ${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

/** La eficacia en palabras; nada si aún no se sabe contra quién. */
export function effectivenessLabel(effectiveness: number | null): string {
  if (effectiveness === null) return "";
  if (effectiveness === 0) return "No afecta";
  return effectiveness > 1 ? "Muy eficaz" : effectiveness < 1 ? "Poco eficaz" : "Normal";
}

/** Tinte claro y borde oscuro de cada tipo. Son claros para que el texto oscuro se lea sobre cualquiera. */
export const MOVE_COLORS: Record<TypeName | "forcejeo" | "recuperar", [string, string]> = {
  normal: ["#d9d7c3", "#94927a"],
  fire: ["#f5a36b", "#b4602b"],
  water: ["#8fbcf5", "#4a78b8"],
  electric: ["#f8dc6a", "#b89a1e"],
  grass: ["#9cdc7c", "#5a9a3a"],
  ice: ["#a8e4e0", "#5fa5a0"],
  fighting: ["#e8908a", "#a84f49"],
  poison: ["#cf9ad8", "#8c5a96"],
  ground: ["#e5c67e", "#a3853c"],
  flying: ["#c4b5fd", "#7c6bc4"],
  psychic: ["#f79ab8", "#b35a78"],
  bug: ["#c5d65a", "#83941c"],
  rock: ["#cfbf74", "#8d7d33"],
  ghost: ["#ad9ad0", "#6e5b92"],
  dragon: ["#a692f8", "#6650b8"],
  dark: ["#b3a498", "#75665a"],
  steel: ["#c3c6d8", "#808498"],
  fairy: ["#f5b5d0", "#b37490"],
  forcejeo: ["#d6d3e8", "#9d99b8"],
  recuperar: ["#86efac", "#3fae68"],
};

function actionLine(action: BattleAction, names: Names): string {
  const start = `${names[action.actor]} usó ${moveLabel(action.move)}`;
  if (action.move === "recuperar") return `${start}: recuperó ${action.healed} PS.`;
  if (action.effectiveness === 0) return `${start}: no afecta.`;
  const notes = [action.critical ? "¡Crítico!" : "", action.effectiveness > 1 ? "¡Es muy eficaz!" : action.effectiveness < 1 ? "No es muy eficaz." : ""].filter(Boolean);
  return [`${start}: ${action.damage} de daño.`, ...notes].join(" ");
}

/** Lo ocurrido en un turno, una línea por ataque: es el registro visible. */
export function turnLines(actions: BattleAction[], names: Names, entered: string[] = []): string[] {
  return [...entered.map(enteredLine), ...actions.map((action) => actionLine(action, names))];
}

const enteredLine = (name: string): string => `¡Adelante, ${name}!`;

/** El mismo turno en una sola frase corta: es lo que oye quien usa lector de pantalla, para no saturarlo. */
export function turnSummary(actions: BattleAction[], names: Names, entered: string[] = []): string {
  const hits = actions
    .map((action) => {
      if (action.move === "recuperar") return `${names[action.actor]}, recuperó ${action.healed} PS.`;
      return action.effectiveness === 0 ? `${names[action.actor]}, no afecta.` : `${names[action.actor]}, ${action.damage} de daño.`;
    });
  return [...entered.map(enteredLine), ...hits].join(" ");
}

/** Quién puede salir a pelear. */
export function aliveIds(team: BattleFighterView[]): number[] {
  return team.filter((fighter) => fighter.hp > 0).map((fighter) => fighter.pokemon.id);
}
