import { type BaseStats, type BoostStat, type MoveData, type MoveEffect, type Status, TYPE_NAMES, type TypeName, typeEffectiveness } from "@pokemon-minigames/shared";

/** Solo los campos de un movimiento de PokéAPI que usamos. */
export interface RawMove {
  name: string;
  names: { name: string; language: { name: string } }[];
  type: { name: string };
  damage_class: { name: string };
  target: { name: string };
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  stat_changes: { change: number; stat: { name: string } }[];
  meta: {
    category: { name: string };
    ailment: { name: string };
    min_hits: number | null;
    max_hits: number | null;
    min_turns: number | null;
    max_turns: number | null;
    drain: number;
    healing: number;
    ailment_chance: number;
    stat_chance: number;
    flinch_chance: number;
  } | null;
}

const MIN_POWER = 40;
const MAX_POWER = 120;
/** Los ataques normales con los que se completan los 4 de quien aprende muy pocos. */
export const FILLER_MOVES = ["tackle", "scratch", "pound", "cut"];

const DAMAGE_CATEGORIES = ["damage", "damage+ailment", "damage+lower", "damage+raise"];
const AILMENTS: Record<string, Status> = { burn: "burn", paralysis: "paralysis", poison: "poison", sleep: "sleep" };
const STATS: Record<string, BoostStat> = { attack: "attack", defense: "defense", "special-attack": "spAttack", "special-defense": "spDefense", speed: "speed" };
const TARGETS = ["selected-pokemon", "user", "all-opponents", "all-other-pokemon", "random-opponent"];

/** Parecen ataques normales en PokéAPI, pero cargan, recargan, atan a varios turnos o dependen de algo que aquí no existe. */
const RARE_ATTACKS = new Set([
  "solar-beam", "solar-blade", "fly", "dig", "dive", "bounce", "phantom-force", "shadow-force", "sky-attack", "skull-bash", "razor-wind", "meteor-beam", "electro-shot", "ice-burn", "freeze-shock", "sky-drop",
  "hyper-beam", "giga-impact", "blast-burn", "hydro-cannon", "frenzy-plant", "rock-wrecker", "roar-of-time", "prismatic-laser", "eternabeam", "meteor-assault",
  "future-sight", "doom-desire", "rollout", "ice-ball", "outrage", "thrash", "petal-dance", "raging-fury", "uproar", "last-resort", "dream-eater", "snore", "focus-punch",
  "self-destruct", "explosion", "misty-explosion", "steel-beam", "mind-blown", "natural-gift", "belch", "false-swipe", "hold-back", "stomping-tantrum", "fling", "synchronoise", "steel-roller", "poltergeist",
  "beat-up", "pay-day", "knock-off", "thief", "covet", "bug-bite", "pluck", "incinerate", "smack-down", "u-turn", "volt-switch", "flip-turn", "parting-shot", "dragon-tail", "circle-throw", "rapid-spin", "mortal-spin",
  "facade", "venoshock", "brine", "hex", "payback", "assurance", "retaliate", "acrobatics", "round", "fury-cutter", "pursuit", "grass-pledge", "fire-pledge", "water-pledge", "jump-kick", "high-jump-kick", "foul-play", "rising-voltage", "expanding-force", "lash-out", "wake-up-slap", "smelling-salts", "fell-stinger", "grassy-glide", "flying-press", "spectral-thief", "jaw-lock", "bolt-beak", "fishious-rend", "dynamax-cannon", "hyperspace-hole", "secret-power", "swallow", "spit-up", "stockpile", "rest", "wish", "body-press",
  "brick-break", "psychic-fangs", "weather-ball", "terrain-pulse", "judgment", "multi-attack", "revelation-dance", "techno-blast", "hidden-power", "tera-blast", "relic-song",
]);

function isSupportEffect(move: RawMove): boolean {
  const meta = move.meta!;
  if (meta.category.name === "heal") return move.target.name === "user" && meta.healing > 0;
  if (meta.category.name === "ailment") return meta.ailment.name in AILMENTS;
  if (meta.category.name === "net-good-stats") return move.stat_changes.length > 0 && move.stat_changes.every((change) => change.stat.name in STATS);
  return false;
}

export function isUsableMove(move: RawMove): boolean {
  const meta = move.meta;
  if (!meta || move.pp === null || move.priority !== 0 || !TARGETS.includes(move.target.name) || RARE_ATTACKS.has(move.name)) return false;
  if (move.damage_class.name === "status") return isSupportEffect(move);
  if (move.power === null || move.power < MIN_POWER || move.power > MAX_POWER) return false;
  return DAMAGE_CATEGORIES.includes(meta.category.name) && meta.min_hits === null && meta.min_turns === null && meta.drain === 0;
}

function toEffect(move: RawMove): MoveEffect {
  const meta = move.meta!;
  const isStatus = move.damage_class.name === "status";
  if (meta.healing > 0 && isStatus) return { healing: meta.healing };
  const effect: MoveEffect = {};
  const ailment = AILMENTS[meta.ailment.name];
  if (ailment) {
    effect.ailment = ailment;
    effect.ailmentChance = isStatus ? 100 : meta.ailment_chance;
  }
  // Un secundario fuera de la lista, como congelar o hacer retroceder, se ignora: no perdemos Rayo Hielo por eso.
  const changes = move.stat_changes.filter((change) => change.stat.name in STATS);
  if (changes.length > 0) {
    const onUser = isStatus ? move.target.name === "user" : meta.category.name === "damage+raise";
    effect.stats = changes.map((change) => ({ stat: STATS[change.stat.name]!, change: change.change, target: onUser ? "user" : "rival", chance: isStatus || meta.stat_chance === 0 ? 100 : meta.stat_chance }));
  }
  return effect;
}

export function toMoveData(move: RawMove): MoveData {
  const nameIn = (language: string) => move.names.find((one) => one.language.name === language)?.name;
  const en = nameIn("en") ?? move.name;
  return {
    id: move.name,
    names: { es: nameIn("es") ?? en, en },
    type: move.type.name as TypeName,
    category: move.damage_class.name as MoveData["category"],
    power: move.power,
    accuracy: move.accuracy,
    pp: move.pp!,
    effect: toEffect(move),
  };
}

/** Cuántos tipos recibe ×2 de este tipo: es lo que le da valor a un ataque de otro tipo. */
const coverage = (type: TypeName): number => TYPE_NAMES.filter((defender) => typeEffectiveness(type, defender) === 2).length;

/** Elige los 4 de un Pokémon: 2 de su tipo, 1 de otro que cubra más y 1 de apoyo, siempre los mismos. */
export function selectMoves(pokemon: { types: TypeName[]; stats: BaseStats }, learnable: MoveData[]): string[] {
  const attackScore = (move: MoveData) => (move.power ?? 0) * (move.accuracy ?? 100) * (move.category === "physical" ? pokemon.stats.attack : pokemon.stats.spAttack);
  const byScore = (a: MoveData, b: MoveData) => attackScore(b) - attackScore(a) || a.id.localeCompare(b.id);
  const attacks = learnable.filter((move) => move.category !== "status").sort(byScore);
  const own = attacks.filter((move) => pokemon.types.includes(move.type)).slice(0, 2);
  const other = attacks.filter((move) => !pokemon.types.includes(move.type)).sort((a, b) => coverage(b.type) - coverage(a.type) || byScore(a, b))[0];
  const supportScore = (move: MoveData) => (move.effect.healing ? 1000 : move.effect.ailment ? 200 : 100) + (move.accuracy ?? 100);
  const support = learnable.filter((move) => move.category === "status").sort((a, b) => supportScore(b) - supportScore(a) || a.id.localeCompare(b.id))[0];

  const chosen = [...own, ...(other ? [other] : []), ...(support ? [support] : [])].map((move) => move.id);
  for (const id of [...attacks.map((move) => move.id), ...FILLER_MOVES]) {
    if (chosen.length >= 4) break;
    if (!chosen.includes(id)) chosen.push(id);
  }
  return chosen;
}
