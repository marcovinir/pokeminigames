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

/** «×2» o «×0,5»; nada si aún no se sabe contra quién. */
export function effectivenessLabel(effectiveness: number | null): string {
  return effectiveness === null ? "" : `×${String(effectiveness).replace(".", ",")}`;
}

function actionLine(action: BattleAction, names: Names): string {
  const start = `${names[action.actor]} usó ${moveLabel(action.move)}`;
  if (action.move === "recuperar") return `${start}: recuperó ${action.healed} PS.`;
  if (action.effectiveness === 0) return `${start}: no afecta.`;
  const notes = [action.critical ? "¡Crítico!" : "", action.effectiveness > 1 ? "¡Es muy eficaz!" : action.effectiveness < 1 ? "No es muy eficaz." : ""].filter(Boolean);
  return [`${start}: ${action.damage} de daño.`, ...notes].join(" ");
}

/** Lo ocurrido en un turno, una línea por ataque: es el registro visible. */
export function turnLines(actions: BattleAction[], names: Names): string[] {
  return actions.map((action) => actionLine(action, names));
}

/** El mismo turno en una sola frase corta: es lo que oye quien usa lector de pantalla, para no saturarlo. */
export function turnSummary(actions: BattleAction[], names: Names): string {
  return actions
    .map((action) => {
      if (action.move === "recuperar") return `${names[action.actor]}, recuperó ${action.healed} PS.`;
      return action.effectiveness === 0 ? `${names[action.actor]}, no afecta.` : `${names[action.actor]}, ${action.damage} de daño.`;
    })
    .join(" ");
}

/** Quién puede salir a pelear. */
export function aliveIds(team: BattleFighterView[]): number[] {
  return team.filter((fighter) => fighter.hp > 0).map((fighter) => fighter.pokemon.id);
}
