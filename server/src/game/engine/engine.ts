import { type ErrorCode, type DobleTipoConfig, type RoundPlayerResult, type Seat, type ServerEvent, TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import { PokemonCatalog, type TypePair } from "../../catalog/pokemon-catalog.js";
import {
  MIN_POOL_PER_PAIR,
  RECONNECT_GRACE_SECONDS,
  REMATCH_ROOM_TTL_SECONDS,
  RESULT_PAUSE_SECONDS,
  ROUND_SECONDS,
  SIMULTANEOUS_WINDOW_MS,
  START_COUNTDOWN_SECONDS,
  TYPE_CHOICE_SECONDS,
  WAITING_ROOM_TTL_MINUTES,
  minutes,
  seconds,
} from "../constants.js";
import { pickOne } from "../rng.js";
import { pickExample, resolveRound } from "./resolve.js";
import {
  type Effect,
  type EngineDeps,
  type GameEvent,
  type GameOutcome,
  type GameState,
  type PlayerState,
  type ReduceResult,
  type RoundRecordPick,
  SEATS,
  type TimerId,
  otherSeat,
  type SeatOccupant
} from "./types.js";
import { buildGameEnded, toPokemonView } from "./view.js";

interface Ctx {
  s: GameState;
  fx: Effect[];
  now: number;
  deps: EngineDeps;
}

const ABANDONED_REASONS = new Set(["cancelled", "expired", "abandoned"]);


function newPlayer(seat: Seat, { userId, username, guest, avatarId }: SeatOccupant): PlayerState {
  return {
    seat,
    userId,
    username,
    ...(guest ? { guest: true } : {}),
    ...(avatarId ? { avatarId } : {}),
    connected: false,
    totalStats: 0,
    team: [],
  };
}

function inGame(s: GameState): boolean {
  return s.phase === "choosing_types" || s.phase === "round_active" || s.phase === "round_result";
}

function emit(c: Ctx, to: Seat | "all", event: ServerEvent): void {
  c.fx.push({ kind: "emit", to, event });
}

function schedule(c: Ctx, at: number, timer: TimerId): void {
  c.fx.push({ kind: "schedule", at, timer });
}

function reject(c: Ctx, seat: Seat, code: ErrorCode, message: string): void {
  emit(c, seat, { name: "error", payload: { code, message } });
}

function claimedIds(s: GameState): Set<number> {
  return new Set(s.owners.keys());
}

function randomPlayablePair(c: Ctx): TypePair | null {
  const pairs = c.deps.catalog.playablePairs(claimedIds(c.s), MIN_POOL_PER_PAIR);
  return pairs.length === 0 ? null : pickOne(c.deps.rng, pairs);
}

/** Estado inicial de una sala recién creada: el creador ocupa el asiento 1. */
export function createGame(
  config: DobleTipoConfig,
  creator: SeatOccupant,
  now: number,
  /** `rematch`: la sala nace de una revancha y los dos ya están dentro; si el rival no entra caduca pronto. */
  options: { rematch?: boolean } = {},
): ReduceResult {
  const state: GameState = {
    phase: "waiting",
    config,
    players: { 1: newPlayer(1, creator) },
    round: null,
    roundsPlayed: 0,
    owners: new Map(),
    expiresAt: now + (options.rematch ? seconds(REMATCH_ROOM_TTL_SECONDS) : minutes(WAITING_ROOM_TTL_MINUTES)),
    ...(options.rematch ? { rematch: true as const } : {}),
    startsAt: null,
    graceEndsAt: {},
    outcome: null,
  };
  return {
    state,
    effects: [{ kind: "schedule", at: state.expiresAt, timer: { kind: "expire" } }],
  };
}

/**
 * Función pura: dado el estado, un evento y la hora, devuelve el estado nuevo y los
 * efectos que el orquestador debe ejecutar. No hace E/S ni mira el reloj.
 */
export function reduce(prev: GameState, event: GameEvent, now: number, deps: EngineDeps): ReduceResult {
  if (prev.phase === "finished") return { state: prev, effects: [] };

  const c: Ctx = { s: structuredClone(prev), fx: [], now, deps };
  switch (event.type) {
    case "PLAYER_JOINED":
      onJoined(c, event);
      break;
    case "PLAYER_CONNECTED":
      onConnected(c, event.seat);
      break;
    case "PLAYER_DISCONNECTED":
      onDisconnected(c, event.seat);
      break;
    case "CHOOSE_TYPE":
      onChooseType(c, event.seat, event.typeName);
      break;
    case "SUBMIT":
      onSubmit(c, event.seat, event.text);
      break;
    case "LEAVE":
      onLeave(c, event.seat);
      break;
    case "TIMER":
      onTimer(c, event.timer);
      break;
  }
  return { state: c.s, effects: c.fx };
}

// --- Sala y conexiones -------------------------------------------------------------

function onJoined(c: Ctx, joiner: SeatOccupant): void {
  if (c.s.phase !== "waiting" || c.s.players[2]) return;
  const player = newPlayer(2, joiner);
  c.s.players[2] = player;
  c.fx.push({ kind: "persist_seat_taken", userId: player.userId });
  emit(c, 1, {
    name: "player-joined",
    payload: { username: player.username, ...(player.guest ? { guest: true } : {}), ...(player.avatarId ? { avatarId: player.avatarId } : {}) },
  });
}

function onConnected(c: Ctx, seat: Seat): void {
  const player = c.s.players[seat];
  if (!player) return;
  const wasAway = !player.connected;
  player.connected = true;

  if (inGame(c.s) && wasAway) {
    delete c.s.graceEndsAt[seat];
    emit(c, otherSeat(seat), { name: "opponent-reconnected", payload: undefined });
  }
  tryStart(c);
  c.fx.push({ kind: "send_state", to: seat });
  // En la sala de espera nadie más se entera por otra vía de que este jugador llegó.
  if (!inGame(c.s) && c.s.players[otherSeat(seat)]) c.fx.push({ kind: "send_state", to: otherSeat(seat) });
}

function tryStart(c: Ctx): void {
  const { s } = c;
  if (s.phase !== "waiting") return;
  const [a, b] = [s.players[1], s.players[2]];
  if (!a || !b || !a.connected || !b.connected) return;

  s.phase = "starting";
  s.startsAt = c.now + seconds(START_COUNTDOWN_SECONDS);
  emit(c, "all", { name: "game-starting", payload: { startsAt: s.startsAt, serverNow: c.now } });
  schedule(c, s.startsAt, { kind: "start", startsAt: s.startsAt });
}

/**
 * Vuelve a la sala de espera. Si la sala ya debió caducar mientras tanto, termina aquí: su
 * temporizador `expire` venció en otra fase (la cuenta atrás) y se ignoró, y no queda otro.
 */
function backToWaiting(c: Ctx): void {
  c.s.phase = "waiting";
  c.s.startsAt = null;
  if (c.now >= c.s.expiresAt) finish(c, "expired", null);
}

function onDisconnected(c: Ctx, seat: Seat): void {
  const { s } = c;
  const player = s.players[seat];
  if (!player || !player.connected) return;
  player.connected = false;

  if (s.phase === "starting" || s.phase === "waiting") {
    // La cuenta atrás se cancela: el temporizador `start` queda obsoleto.
    if (s.phase === "starting") backToWaiting(c);
    if (s.phase === "waiting" && s.players[otherSeat(seat)]) c.fx.push({ kind: "send_state", to: otherSeat(seat) });
    return;
  }
  if (inGame(s)) {
    const graceEndsAt = c.now + seconds(RECONNECT_GRACE_SECONDS);
    s.graceEndsAt[seat] = graceEndsAt;
    emit(c, otherSeat(seat), { name: "opponent-disconnected", payload: { graceEndsAt, serverNow: c.now } });
    schedule(c, graceEndsAt, { kind: "grace", seat, graceEndsAt });
  }
}

function onLeave(c: Ctx, seat: Seat): void {
  const { s } = c;
  if (s.phase === "waiting" || s.phase === "starting") {
    if (seat === 1) {
      finish(c, "cancelled", null);
    } else if (s.players[2]) {
      // Quien se unió se va antes de empezar: el asiento 2 queda libre.
      delete s.players[2];
      c.fx.push({ kind: "persist_seat_freed" });
      backToWaiting(c);
      if (s.phase === "waiting") c.fx.push({ kind: "send_state", to: 1 });
    }
    return;
  }
  if (inGame(s)) finish(c, "forfeit", otherSeat(seat));
}

// --- Temporizadores --------------------------------------------------------------------

function onTimer(c: Ctx, timer: TimerId): void {
  const { s } = c;
  switch (timer.kind) {
    case "expire":
      if (s.phase === "waiting") finish(c, "expired", null);
      break;
    case "start":
      if (s.phase === "starting" && s.startsAt === timer.startsAt) {
        c.fx.push({ kind: "persist_started" });
        beginRound(c, 1);
      }
      break;
    case "choose":
      if (s.phase === "choosing_types" && s.round?.number === timer.round) resolveTypes(c);
      break;
    case "round":
      if (s.phase === "round_active" && s.round?.number === timer.round) closeRound(c);
      break;
    case "result":
      if (s.phase === "round_result" && s.round?.number === timer.round) beginRound(c, timer.round + 1);
      break;
    case "grace": {
      const player = s.players[timer.seat];
      if (inGame(s) && player && !player.connected && s.graceEndsAt[timer.seat] === timer.graceEndsAt) {
        const other = otherSeat(timer.seat);
        if (s.players[other]?.connected) finish(c, "disconnect", other);
        else finish(c, "abandoned", null);
      }
      break;
    }
  }
}

// --- Rondas ----------------------------------------------------------------------------

function beginRound(c: Ctx, number: number): void {
  const { s } = c;
  const pairs = c.deps.catalog.playablePairs(claimedIds(s), MIN_POOL_PER_PAIR);
  if (pairs.length === 0) {
    finish(c, "exhausted");
    return;
  }

  s.round = { number, typeChoices: {}, pair: null, deadline: null, picks: {} };
  if (s.config.typeMode === "chosen") {
    s.phase = "choosing_types";
    s.round.deadline = c.now + seconds(TYPE_CHOICE_SECONDS);
    emit(c, "all", {
      name: "choose-types",
      payload: { round: number, deadline: s.round.deadline, serverNow: c.now },
    });
    schedule(c, s.round.deadline, { kind: "choose", round: number });
  } else {
    startActive(c, pickOne(c.deps.rng, pairs), false);
  }
}

function onChooseType(c: Ctx, seat: Seat, typeName: string): void {
  const { s } = c;
  const round = s.round;
  if (s.phase !== "choosing_types" || !round || (round.deadline !== null && c.now > round.deadline)) {
    reject(c, seat, "WRONG_PHASE", "Ahora no se puede elegir un tipo");
    return;
  }
  if (!(TYPE_NAMES as readonly string[]).includes(typeName)) {
    reject(c, seat, "INVALID_TYPE", "Ese tipo no existe");
    return;
  }
  if (round.typeChoices[seat]) {
    reject(c, seat, "ALREADY_CHOSEN", "Ya elegiste un tipo en esta ronda");
    return;
  }
  round.typeChoices[seat] = typeName as TypeName;
  emit(c, seat, { name: "type-received", payload: { round: round.number } });
  if (round.typeChoices[1] && round.typeChoices[2]) resolveTypes(c);
}

/** Cierra la elección de tipos: rellena con azar a quien no eligió y valida el par. */
function resolveTypes(c: Ctx): void {
  const { s } = c;
  const round = s.round!;
  for (const seat of SEATS) {
    round.typeChoices[seat] ??= pickOne(c.deps.rng, TYPE_NAMES);
  }
  const a = round.typeChoices[1]!;
  const b = round.typeChoices[2]!;

  if (a !== b) {
    const pair = PokemonCatalog.orderPair(a, b);
    if (c.deps.catalog.poolSize(pair, claimedIds(s)) >= MIN_POOL_PER_PAIR) {
      startActive(c, pair, false);
      return;
    }
  }
  const replacement = randomPlayablePair(c);
  if (!replacement) {
    finish(c, "exhausted");
    return;
  }
  startActive(c, replacement, true);
}

function startActive(c: Ctx, pair: TypePair, replaced: boolean): void {
  const { s } = c;
  const round = s.round!;
  s.phase = "round_active";
  round.pair = pair;
  round.deadline = c.now + seconds(ROUND_SECONDS);
  emit(c, "all", {
    name: "round-started",
    payload: {
      serverNow: c.now,
      round: round.number,
      type1: pair[0],
      type2: pair[1],
      deadline: round.deadline,
      ...(replaced ? { typesNotice: "pair_replaced" as const } : {}),
    },
  });
  schedule(c, round.deadline, { kind: "round", round: round.number });
}

function onSubmit(c: Ctx, seat: Seat, text: string): void {
  const { s } = c;
  const round = s.round;
  if (s.phase !== "round_active" || !round || (round.deadline !== null && c.now > round.deadline)) {
    reject(c, seat, "WRONG_PHASE", "Ahora no se pueden enviar respuestas");
    return;
  }
  if (round.picks[seat]) {
    reject(c, seat, "ALREADY_ANSWERED", "Ya enviaste tu respuesta en esta ronda");
    return;
  }
  round.picks[seat] = { text, at: c.now };
  emit(c, seat, { name: "answer-received", payload: { round: round.number } });
  // Al rival, solo que ya respondió: nada de qué ni de si acertó.
  emit(c, seat === 1 ? 2 : 1, { name: "opponent-answered", payload: { round: round.number } });
  if (round.picks[1] && round.picks[2]) closeRound(c);
}

function closeRound(c: Ctx): void {
  const { s } = c;
  const round = s.round!;
  const pair = round.pair!;
  const outcomes = resolveRound({
    pair,
    picks: round.picks,
    owners: s.owners,
    catalog: c.deps.catalog,
    rng: c.deps.rng,
    windowMs: SIMULTANEOUS_WINDOW_MS,
  });

  const results = {} as Record<Seat, RoundPlayerResult>;
  const records: RoundRecordPick[] = [];
  for (const seat of SEATS) {
    const player = s.players[seat]!;
    const outcome = outcomes[seat];
    const pick = round.picks[seat];
    const pokemon = outcome.pokemonId !== null ? c.deps.catalog.get(outcome.pokemonId) : undefined;

    if (pokemon) {
      s.owners.set(pokemon.id, seat);
      player.team.push(pokemon.id);
      player.totalStats += pokemon.totalStats;
    }
    results[seat] = {
      seat,
      result: outcome.result,
      text: pick?.text ?? null,
      pokemon: pokemon ? toPokemonView(pokemon) : null,
      totalStats: player.totalStats,
      teamSize: player.team.length,
    };
    records.push({
      seat,
      userId: player.userId,
      text: pick?.text ?? null,
      result: outcome.result,
      pokemonId: pokemon?.id ?? null,
      submittedAt: pick?.at ?? null,
    });
  }

  s.roundsPlayed = round.number;
  const over = gameIsOver(s);
  // Si acertaron 0 o 1 jugadores se enseña un Pokémon libre que sí servía (ya repartidos los de esta ronda: nunca es uno ganado).
  const hits = SEATS.filter((seat) => results[seat].result === "VALID").length;
  const example = hits <= 1 ? pickExample(c.deps.catalog, pair, claimedIds(s), c.deps.rng) : null;
  const payload = {
    round: round.number,
    nextRoundAt: over ? null : c.now + seconds(RESULT_PAUSE_SECONDS),
    type1: pair[0],
    type2: pair[1],
    results,
    ...(example ? { example: toPokemonView(example) } : {}),
  };
  s.lastResult = structuredClone(payload);
  emit(c, "all", { name: "round-result", payload });
  c.fx.push({ kind: "persist_round", record: { number: round.number, pair, picks: records } });

  if (over) {
    finish(c, "completed");
  } else {
    s.phase = "round_result";
    schedule(c, c.now + seconds(RESULT_PAUSE_SECONDS), { kind: "result", round: round.number });
  }
}

function gameIsOver(s: GameState): boolean {
  const { roundsLimit, statsGoal } = s.config;
  if (roundsLimit !== null && s.roundsPlayed >= roundsLimit) return true;
  if (statsGoal !== null) {
    return SEATS.some((seat) => (s.players[seat]?.totalStats ?? 0) >= statsGoal);
  }
  return false;
}

// --- Fin de la partida -----------------------------------------------------------------

function winnerByStats(s: GameState): Seat | null {
  const one = s.players[1]?.totalStats ?? 0;
  const two = s.players[2]?.totalStats ?? 0;
  if (one === two) return null;
  return one > two ? 1 : 2;
}

function finish(c: Ctx, reason: GameOutcome["reason"], forcedWinner?: Seat | null): void {
  const { s } = c;
  const winnerSeat = forcedWinner !== undefined ? forcedWinner : winnerByStats(s);
  s.phase = "finished";
  s.outcome = { winnerSeat, reason };

  emit(c, "all", { name: "game-ended", payload: buildGameEnded(s, c.deps.catalog) });
  const finalStats: Partial<Record<Seat, number>> = {};
  for (const seat of SEATS) {
    const player = s.players[seat];
    if (player) finalStats[seat] = player.totalStats;
  }
  c.fx.push({
    kind: "persist_end",
    status: ABANDONED_REASONS.has(reason) ? "abandoned" : "completed",
    outcome: s.outcome,
    finalStats,
  });
}
