import type { BattleAction, BattleFighterView, BattleNote, BoostStat, Seat, Status, TypeName } from "@pokemon-minigames/shared";
import { TYPE_LABELS } from "../i18n/es";

type Names = Record<Seat, string>;

/** El color de la barra de vida: verde por encima del 50 %, amarilla hasta el 20 %, roja por debajo. */
export function hpTone(hp: number, maxHp: number): "good" | "warn" | "danger" {
  const share = hp / maxHp;
  return share > 0.5 ? "good" : share >= 0.2 ? "warn" : "danger";
}

/** La eficacia en palabras; nada si aún no se sabe contra quién. */
export function effectivenessLabel(effectiveness: number | null): string {
  if (effectiveness === null) return "";
  if (effectiveness === 0) return "No afecta";
  return effectiveness > 1 ? "Muy eficaz" : effectiveness < 1 ? "Poco eficaz" : "Normal";
}

/** Tinte claro y borde oscuro de cada tipo. Son claros para que el texto oscuro se lea sobre cualquiera. */
export const MOVE_COLORS: Record<TypeName | "forcejeo", [string, string]> = {
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
};

export const STATUS_LABELS: Record<Status, string> = { burn: "Quemado", paralysis: "Paralizado", poison: "Envenenado", sleep: "Dormido" };
export const STAT_LABELS: Record<BoostStat, string> = { attack: "Ataque", defense: "Defensa", spAttack: "Ataque Especial", spDefense: "Defensa Especial", speed: "Velocidad" };

/** «Ataque +2»: con el signo menos de verdad. */
export const stageLabel = (stat: BoostStat, stage: number): string => `${STAT_LABELS[stat]} ${stage > 0 ? "+" : "−"}${Math.abs(stage)}`;

const STATUS_LINES: Record<Status, (name: string) => string> = {
  burn: (name) => `${name} se quemó.`,
  paralysis: (name) => `${name} quedó paralizado.`,
  poison: (name) => `${name} fue envenenado.`,
  sleep: (name) => `${name} se durmió.`,
};

export interface TurnExtras {
  entered?: string[];
  roundNotes?: BattleNote[];
  roundNames?: Names;
  entryNotes?: BattleNote[];
  endNotes?: BattleNote[];
  abilityNames?: Record<string, string>;
}

function noteLine(note: BattleNote, names: Names, abilityNames: Record<string, string>): string {
  if (note.kind === "failed") return "Pero no tuvo efecto.";
  const name = names[note.seat];
  switch (note.kind) {
    case "woke":
      return `${name} se despertó.`;
    case "healed":
      return `${name} recuperó ${note.amount} PS.`;
    case "status":
      return STATUS_LINES[note.status](name);
    case "stat": {
      const size = Math.abs(note.change) >= 2 ? " mucho" : "";
      return `${note.stat === "defense" || note.stat === "spDefense" || note.stat === "speed" ? "La" : "El"} ${STAT_LABELS[note.stat]} de ${name} ${note.change > 0 ? "subió" : "bajó"}${size}.`;
    }
    case "ability":
      return `Habilidad de ${name}: ${abilityNames[note.ability] ?? note.ability}.`;
    case "recoil":
      return `${name} perdió ${note.damage} PS.`;
    case "residual":
      return `${name} perdió ${note.damage} PS por ${note.cause === "burn" ? "la quemadura" : "el veneno"}.`;
    case "no_effect":
      return `No afecta a ${name}.`;
  }
}

function actionLine(action: BattleAction, names: Names): string {
  const name = names[action.actor];
  if (action.blocked) return `${name} está ${action.blocked === "sleep" ? "dormido" : "paralizado"} y no puede moverse.`;
  const start = `${name} usó ${action.moveName}`;
  if (action.missed) return `${start}, pero falló.`;
  if (action.healed > 0) return `${start}: recuperó ${action.healed} PS.`;
  if (action.damage === 0) return action.effectiveness === 0 ? `${start}: no afecta.` : `${start}.`;
  const notes = [action.critical ? "¡Crítico!" : "", action.effectiveness > 1 ? "¡Es muy eficaz!" : action.effectiveness < 1 ? "No es muy eficaz." : ""].filter(Boolean);
  return [`${start}: ${action.damage} de daño.`, ...notes].join(" ");
}

const enteredLine = (name: string): string => `¡Adelante, ${name}!`;

/** Lo ocurrido en un turno, una línea por cosa: es el registro visible. */
export function turnLines(actions: BattleAction[], names: Names, { entered = [], roundNotes = [], roundNames = names, entryNotes = [], endNotes = [], abilityNames = {} }: TurnExtras = {}): string[] {
  const notes = (list: BattleNote[]) => list.map((note) => noteLine(note, names, abilityNames));
  return [...roundNotes.map((note) => noteLine(note, roundNames, abilityNames)), ...entered.map(enteredLine), ...notes(entryNotes), ...actions.flatMap((action) => [actionLine(action, names), ...notes(action.notes)]), ...notes(endNotes)];
}

/** El mismo turno en una sola frase corta: es lo que oye quien usa lector de pantalla, para no saturarlo. */
export function turnSummary(actions: BattleAction[], names: Names, { entered = [], roundNotes = [], roundNames = names, entryNotes = [], endNotes = [], abilityNames = {} }: TurnExtras = {}): string {
  const notes = (list: BattleNote[]) => list.map((note) => noteLine(note, names, abilityNames));
  const hits = actions.map((action) => {
    const name = names[action.actor];
    if (action.blocked) return `${name}, no puede moverse.`;
    if (action.missed) return `${name}, falló.`;
    if (action.healed > 0) return `${name}, recuperó ${action.healed} PS.`;
    if (action.damage > 0) return `${name}, ${action.damage} de daño.`;
    return action.effectiveness === 0 ? `${name}, no afecta.` : `${name} usó ${action.moveName}.`;
  });
  const hitsWithNotes = actions.flatMap((action, index) => [hits[index]!, ...notes(action.notes)]);
  return [...roundNotes.map((note) => noteLine(note, roundNames, abilityNames)), ...entered.map(enteredLine), ...notes(entryNotes), ...hitsWithNotes, ...notes(endNotes)].join(" ");
}

/** Quién puede salir a pelear. */
export function aliveIds(team: BattleFighterView[]): number[] {
  return team.filter((fighter) => fighter.hp > 0).map((fighter) => fighter.pokemon.id);
}
