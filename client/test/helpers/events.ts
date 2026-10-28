import type {
  SilhouetteReveal,
  GameEndedPayload,
  PokemonView,
  RematchState,
  RoomStateView,
  RoundResultPayload,
  ServerEvent,
  TypeName,
} from "@pokemon-minigames/shared";

/** Hora del servidor que usan por defecto los datos de prueba. */
export const SERVER_NOW = 1_000_000;

export function pokemon(id: number, total = 500, overrides: Partial<PokemonView> = {}): PokemonView {
  const base = Math.floor(total / 6);
  return {
    id,
    names: { es: `Poke${id}`, en: `Mon${id}` },
    spriteUrl: `https://example.com/${id}.png`,
    types: ["fire", "flying"] as TypeName[],
    stats: { hp: total - base * 5, attack: base, defense: base, spAttack: base, spDefense: base, speed: base },
    totalStats: total,
    ...overrides,
  };
}

const player = (seat: 1 | 2, username: string, extra: object = {}) => ({
  seat,
  username,
  connected: true,
  totalStats: 0,
  teamSize: 0,
  ...extra,
});

export function roomState(overrides: Partial<RoomStateView> = {}): RoomStateView {
  return {
    serverNow: SERVER_NOW,
    code: "ABC234",
    phase: "waiting",
    config: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null },
    mySeat: 1,
    players: [player(1, "ash"), player(2, "misty")],
    myTeam: [],
    opponentTeam: [],
    roundsPlayed: 0,
    startsAt: null,
    opponentGraceEndsAt: null,
    round: null,
    ...overrides,
  };
}

export function roundResult(overrides: Partial<RoundResultPayload> = {}): RoundResultPayload {
  return {
    round: 1,
    nextRoundAt: SERVER_NOW + 6000,
    type1: "flying",
    type2: "fire",
    results: {
      1: { seat: 1, result: "VALID", text: "Poke1", pokemon: pokemon(1, 500), totalStats: 500, teamSize: 1 },
      2: { seat: 2, result: "NOT_FOUND", text: "zzz", pokemon: null, totalStats: 0, teamSize: 0 },
    },
    ...overrides,
  };
}

export function gameEnded(overrides: Partial<GameEndedPayload> = {}): GameEndedPayload {
  return {
    winnerSeat: 1,
    reason: "completed",
    teams: { 1: [pokemon(1, 500), pokemon(2, 300)], 2: [pokemon(3, 400)] },
    totals: { 1: 800, 2: 400 },
    ...overrides,
  };
}

/** Atajos para armar eventos del servidor completos. */
/** Una revelación de silueta: por defecto, el n.º 94 en la ronda 1, acertado por el asiento 1 en 3,2 s. */
export function silhouetteReveal(overrides: Partial<SilhouetteReveal> = {}): SilhouetteReveal {
  return {
    round: 1,
    pokemon: pokemon(94),
    answers: { 1: { text: "Gengar", correct: true, ms: 3200, points: 808 }, 2: { text: null, correct: false, ms: null, points: 0 } },
    ...overrides,
  };
}

export const event = {
  silhouetteRoundStarted: (round = 1, deadline = SERVER_NOW + 15_000, silhouetteUrl = "/silhouettes/tok1"): ServerEvent => ({
    name: "silhouette-round-started",
    payload: { serverNow: SERVER_NOW, round, totalRounds: 10, deadline, silhouetteUrl },
  }),
  silhouetteAnswerReceived: (ms: number): ServerEvent => ({ name: "silhouette-answer-received", payload: { ms } }),
  silhouetteRoundResult: (reveal: SilhouetteReveal = silhouetteReveal(), totals: Record<1 | 2, number> = { 1: 808, 2: 0 }, nextRoundAt: number | null = SERVER_NOW + 6000): ServerEvent => ({
    name: "silhouette-round-result",
    payload: { serverNow: SERVER_NOW, reveal, totals, nextRoundAt },
  }),
  roomState: (overrides?: Partial<RoomStateView>): ServerEvent => ({ name: "room-state", payload: roomState(overrides) }),
  rematchState: (overrides: Partial<RematchState> = {}): ServerEvent => ({
    name: "rematch-state",
    payload: { serverNow: SERVER_NOW, status: "open", deadline: SERVER_NOW + 300_000, ...overrides },
  }),
  rematchRoom: (code: string): ServerEvent => ({ name: "rematch-room", payload: { code } }),
  playerJoined: (username: string, guest?: boolean, avatarId?: number): ServerEvent => ({
    name: "player-joined",
    payload: { username, ...(guest ? { guest: true } : {}), ...(avatarId ? { avatarId } : {}) },
  }),
  gameStarting: (startsAt: number, serverNow = SERVER_NOW): ServerEvent => ({
    name: "game-starting",
    payload: { startsAt, serverNow },
  }),
  chooseTypes: (round: number, deadline: number, serverNow = SERVER_NOW): ServerEvent => ({
    name: "choose-types",
    payload: { round, deadline, serverNow },
  }),
  typeReceived: (round: number): ServerEvent => ({ name: "type-received", payload: { round } }),
  roundStarted: (
    round: number,
    deadline: number,
    options: { serverNow?: number; typesNotice?: "pair_replaced"; type1?: TypeName; type2?: TypeName } = {},
  ): ServerEvent => ({
    name: "round-started",
    payload: {
      serverNow: options.serverNow ?? SERVER_NOW,
      round,
      type1: options.type1 ?? "flying",
      type2: options.type2 ?? "fire",
      deadline,
      ...(options.typesNotice ? { typesNotice: options.typesNotice } : {}),
    },
  }),
  answerReceived: (round: number): ServerEvent => ({ name: "answer-received", payload: { round } }),
  opponentAnswered: (round: number): ServerEvent => ({ name: "opponent-answered", payload: { round } }),
  roundResult: (overrides?: Partial<RoundResultPayload>): ServerEvent => ({ name: "round-result", payload: roundResult(overrides) }),
  gameEnded: (overrides?: Partial<GameEndedPayload>): ServerEvent => ({ name: "game-ended", payload: gameEnded(overrides) }),
  opponentDisconnected: (graceEndsAt: number, serverNow = SERVER_NOW): ServerEvent => ({
    name: "opponent-disconnected",
    payload: { graceEndsAt, serverNow },
  }),
  opponentReconnected: (): ServerEvent => ({ name: "opponent-reconnected", payload: undefined }),
  error: (code: import("@pokemon-minigames/shared").ErrorCode, message = "mensaje"): ServerEvent => ({
    name: "error",
    payload: { code, message },
  }),
};
