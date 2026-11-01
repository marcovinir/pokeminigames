import type { MoveData, Status, TypeName } from "@pokemon-minigames/shared";

/** Lo que aplica cada habilidad con efecto. La que no está aquí se muestra sin efecto. */
export const ABILITY_TEXT: Record<string, string> = {
  intimidate: "Al entrar, baja el Ataque del rival.",
  levitate: "No le afectan los ataques de tipo Tierra.",
  "water-absorb": "Los ataques de tipo Agua le curan en lugar de dañarle.",
  "volt-absorb": "Los ataques de tipo Eléctrico le curan en lugar de dañarle.",
  "flash-fire": "No le afectan los ataques de tipo Fuego.",
  immunity: "No puede ser envenenado.",
  limber: "No puede ser paralizado.",
  insomnia: "No puede quedarse dormido.",
  blaze: "Con poca vida, sus ataques de tipo Fuego pegan más.",
  torrent: "Con poca vida, sus ataques de tipo Agua pegan más.",
  overgrow: "Con poca vida, sus ataques de tipo Planta pegan más.",
  swarm: "Con poca vida, sus ataques de tipo Bicho pegan más.",
  static: "Quien le golpea de cerca puede quedar paralizado.",
  "flame-body": "Quien le golpea de cerca puede quemarse.",
  "poison-point": "Quien le golpea de cerca puede envenenarse.",
  "rough-skin": "Quien le golpea de cerca pierde vida.",
  sturdy: "Con la vida llena, resiste con 1 PS un golpe que le debilitaría.",
  "thick-fat": "Recibe la mitad de daño de Fuego y de Hielo.",
  guts: "Con un estado, sus ataques físicos pegan más.",
  adaptability: "Sus ataques de su propio tipo pegan aún más.",
  technician: "Sus ataques de poca potencia pegan más.",
  "huge-power": "Sus ataques físicos pegan el doble.",
  "speed-boost": "Su Velocidad sube al acabar cada turno.",
  "clear-body": "Nadie puede bajarle los stats.",
  "natural-cure": "Se cura de su estado al salir del combate.",
};

const PINCH: Record<string, TypeName> = { blaze: "fire", torrent: "water", overgrow: "grass", swarm: "bug" };
export const CONTACT_STATUS: Record<string, Status> = { static: "paralysis", "flame-body": "burn", "poison-point": "poison" };
const STATUS_GUARD: Record<string, Status> = { immunity: "poison", limber: "paralysis", insomnia: "sleep" };
const TYPE_GUARD: Record<string, TypeName> = { levitate: "ground", "water-absorb": "water", "volt-absorb": "electric", "flash-fire": "fire" };
const HEALING_GUARD = ["water-absorb", "volt-absorb"];

export const isImmuneByAbility = (ability: string | null, type: TypeName): boolean => ability !== null && TYPE_GUARD[ability] === type;
export const healsWhenHit = (ability: string | null): boolean => ability !== null && HEALING_GUARD.includes(ability);
export const guardsStatus = (ability: string | null, status: Status): boolean => ability !== null && STATUS_GUARD[ability] === status;

/** Multiplica el daño según las habilidades del atacante, sin contar la bonificación por su tipo. */
export function attackerModifier(ability: string | null, move: MoveData, inPinch: boolean, hasStatus: boolean): number {
  if (!ability) return 1;
  if (inPinch && PINCH[ability] === move.type) return 1.5;
  if (ability === "guts" && hasStatus && move.category === "physical") return 1.5;
  if (ability === "technician" && (move.power ?? 0) <= 60) return 1.5;
  if (ability === "huge-power" && move.category === "physical") return 2;
  return 1;
}

export const defenderModifier = (ability: string | null, move: MoveData): number => (ability === "thick-fat" && (move.type === "fire" || move.type === "ice") ? 0.5 : 1);
