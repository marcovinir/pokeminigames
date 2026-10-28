import type { ErrorCode, Seat, ServerEvent, SilhouetteAnswer, SilhouetteConfig } from "@pokemon-minigames/shared";
import {
  RECONNECT_GRACE_SECONDS,
  REMATCH_ROOM_TTL_SECONDS,
  RESULT_PAUSE_SECONDS,
  ROUND_SECONDS,
  START_COUNTDOWN_SECONDS,
  WAITING_ROOM_TTL_MINUTES,
  minutes,
  seconds,
} from "../constants.js";
import { type Effect, type GameEvent, type GameOutcome, type PlayerState, type SeatOccupant, SEATS, type TimerId, otherSeat } from "../engine/types.js";
import { toPokemonView } from "../engine/view.js";
import { pickOne } from "../rng.js";
import { silhouettePoints } from "./points.js";
import { silhouettePool } from "./pool.js";
import type { SilhouetteDeps, SilhouetteState } from "./types.js";
import { buildSilhouetteGameEnded } from "./view.js";

/*
 * El motor de «¿Quién es ese Pokémon?»: un reductor puro con el mismo patrón que el de «Doble tipo» (estado + evento +
 * hora → estado nuevo + efectos). La sala, las conexiones, la cuenta atrás y las desconexiones se comportan igual que
 * allí; lo propio son las rondas: una silueta, un solo intento y puntos por rapidez. Nada se guarda en la base de datos.
 */


interface Ctx {
  s: SilhouetteState;
  fx: Effect[];
  now: number;
  deps: SilhouetteDeps;
}

export interface SilhouetteResult {
  state: SilhouetteState;
  effects: Effect[];
}

function newPlayer(seat: Seat, { userId, username, guest, avatarId }: SeatOccupant): PlayerState {
  return { seat, userId, username, ...(guest ? { guest: true } : {}), ...(avatarId ? { avatarId } : {}), connected: false, totalStats: 0, team: [] };
}

function inGame(s: SilhouetteState): boolean {
  return s.phase === "round_active" || s.phase === "round_result";
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

/** Estado inicial de una sala de silueta: el creador ocupa el asiento 1. */
export function createSilhouetteGame(
  config: SilhouetteConfig,
  creator: SeatOccupant,
  now: number,
  options: { rematch?: boolean } = {},
): SilhouetteResult {
  const state: SilhouetteState = {
    phase: "waiting",
    config,
    players: { 1: newPlayer(1, creator) },
    round: null,
    roundsPlayed: 0,
    used: [],
    reveals: [],
    expiresAt: now + (options.rematch ? seconds(REMATCH_ROOM_TTL_SECONDS) : minutes(WAITING_ROOM_TTL_MINUTES)),
    ...(options.rematch ? { rematch: true as const } : {}),
    startsAt: null,
    graceEndsAt: {},
    outcome: null,
  };
  return { state, effects: [{ kind: "schedule", at: state.expiresAt, timer: { kind: "expire" } }] };
}

export function reduceSilhouette(prev: SilhouetteState, event: GameEvent, now: number, deps: SilhouetteDeps): SilhouetteResult {
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
    case "SUBMIT":
      onSubmit(c, event.seat, event.text);
      break;
    case "LEAVE":
      onLeave(c, event.seat);
      break;
    case "TIMER":
      onTimer(c, event.timer);
      break;
    case "CHOOSE_TYPE":
      // En la silueta no se eligen tipos.
      reject(c, event.seat, "WRONG_PHASE", "En este juego no se eligen tipos");
      break;
  }
  return { state: c.s, effects: c.fx };
}

// --- Sala y conexiones (como en «Doble tipo») -------------------------------------------

function onJoined(c: Ctx, joiner: SeatOccupant): void {
  if (c.s.phase !== "waiting" || c.s.players[2]) return;
  const player = newPlayer(2, joiner);
  c.s.players[2] = player;
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
      delete s.players[2];
      backToWaiting(c);
      if (s.phase === "waiting") c.fx.push({ kind: "send_state", to: 1 });
    }
    return;
  }
  // En la pausa de la última revelación ya se jugaron todas las rondas: termina como completada, no como abandono.
  if (s.phase === "round_result" && s.roundsPlayed >= s.config.rounds) {
    finish(c, "completed");
    return;
  }
  if (inGame(s)) finish(c, "forfeit", otherSeat(seat));
}

function onTimer(c: Ctx, timer: TimerId): void {
  const { s } = c;
  switch (timer.kind) {
    case "expire":
      if (s.phase === "waiting") finish(c, "expired", null);
      break;
    case "start":
      if (s.phase === "starting" && s.startsAt === timer.startsAt) beginRound(c, 1);
      break;
    case "round":
      if (s.phase === "round_active" && s.round?.number === timer.round) closeRound(c);
      break;
    case "result":
      if (s.phase === "round_result" && s.round?.number === timer.round) {
        if (s.roundsPlayed >= s.config.rounds) finish(c, "completed");
        else beginRound(c, timer.round + 1);
      }
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
    case "choose":
      break;
  }
}

// --- Rondas -----------------------------------------------------------------------------

function beginRound(c: Ctx, number: number): void {
  const { s } = c;
  const pool = silhouettePool(c.deps.catalog, s.config.generations).filter((id) => !s.used.includes(id));
  if (pool.length === 0) {
    finish(c, "exhausted");
    return;
  }
  const pokemonId = pickOne(c.deps.rng, pool);
  const token = c.deps.newToken();
  s.used.push(pokemonId);
  const deadline = c.now + seconds(ROUND_SECONDS);
  s.round = { number, pokemonId, token, startedAt: c.now, deadline, answers: {} };
  s.phase = "round_active";
  c.fx.push({ kind: "register_silhouette", token, pokemonId });
  emit(c, "all", {
    name: "silhouette-round-started",
    payload: { serverNow: c.now, round: number, totalRounds: s.config.rounds, deadline, silhouetteUrl: silhouetteUrl(token) },
  });
  schedule(c, deadline, { kind: "round", round: number });
}

export function silhouetteUrl(token: string): string {
  return `/silhouettes/${token}`;
}

function onSubmit(c: Ctx, seat: Seat, text: string): void {
  const round = c.s.round;
  if (c.s.phase !== "round_active" || !round || c.now > round.deadline) {
    reject(c, seat, "WRONG_PHASE", "Ahora no se pueden enviar respuestas");
    return;
  }
  if (round.answers[seat]) {
    reject(c, seat, "ALREADY_ANSWERED", "Ya enviaste tu respuesta en esta ronda");
    return;
  }
  round.answers[seat] = { text, at: c.now };
  // Solo a quien respondió: si acertó, su texto es el nombre del Pokémon.
  emit(c, seat, { name: "silhouette-answer-received", payload: { ms: c.now - round.startedAt } });
  // Al rival, solo que ya respondió: su texto podría ser el nombre del Pokémon.
  emit(c, seat === 1 ? 2 : 1, { name: "opponent-answered", payload: { round: round.number } });
  if (round.answers[1] && round.answers[2]) closeRound(c);
}

function closeRound(c: Ctx): void {
  const { s } = c;
  const round = s.round!;
  const pokemon = c.deps.catalog.get(round.pokemonId)!;
  const answers = {} as Record<Seat, SilhouetteAnswer>;
  for (const seat of SEATS) {
    const given = round.answers[seat];
    if (!given) {
      answers[seat] = { text: null, correct: false, ms: null, points: 0 };
      continue;
    }
    const ms = given.at - round.startedAt;
    const correct = c.deps.catalog.resolveName(given.text)?.id === round.pokemonId;
    const points = correct ? silhouettePoints(ms) : 0;
    answers[seat] = { text: given.text, correct, ms, points };
    const player = s.players[seat];
    if (player) player.totalStats += points;
  }
  const reveal = { round: round.number, pokemon: toPokemonView(pokemon), answers };
  s.reveals.push(reveal);
  s.roundsPlayed = round.number;
  const over = s.roundsPlayed >= s.config.rounds;
  emit(c, "all", {
    name: "silhouette-round-result",
    payload: {
      serverNow: c.now,
      reveal,
      totals: { 1: s.players[1]?.totalStats ?? 0, 2: s.players[2]?.totalStats ?? 0 },
      nextRoundAt: over ? null : c.now + seconds(RESULT_PAUSE_SECONDS),
    },
  });
  // También la última revelación tiene su pausa: el resumen llega después (con su temporizador `result`).
  s.phase = "round_result";
  schedule(c, c.now + seconds(RESULT_PAUSE_SECONDS), { kind: "result", round: round.number });
}

// --- Fin --------------------------------------------------------------------------------

function winnerByPoints(s: SilhouetteState): Seat | null {
  const one = s.players[1]?.totalStats ?? 0;
  const two = s.players[2]?.totalStats ?? 0;
  if (one === two) return null;
  return one > two ? 1 : 2;
}

function finish(c: Ctx, reason: GameOutcome["reason"], forcedWinner?: Seat | null): void {
  const { s } = c;
  s.phase = "finished";
  s.outcome = { winnerSeat: forcedWinner !== undefined ? forcedWinner : winnerByPoints(s), reason };
  emit(c, "all", { name: "game-ended", payload: buildSilhouetteGameEnded(s, c.deps.catalog) });
}
