import type {
  AuctionSalePayload,
  BattleAction,
  BattleNote,
  BattleSwitch,
  AuctionStateView,
  ErrorCode,
  GameEndedPayload,
  GamePhase,
  PokemonView,
  RematchState,
  RoomConfig,
  RoomPlayerView,
  RoundResultPayload,
  Seat,
  ServerEvent,
  SilhouetteReveal,
  SilhouetteRoundView,
  SilhouetteStateView,
  TypeName,
} from "@pokemon-minigames/shared";
import { isSilhouetteConfig } from "@pokemon-minigames/shared";
import { clockOffset } from "./clock";
import { rivalSeat } from "./seats";

export interface RoundView {
  number: number;
  pair: [TypeName, TypeName] | null;
  deadline: number | null;
  /** Ya envié mi respuesta en esta ronda. */
  answered: boolean;
  /** Ya elegí mi tipo en esta ronda. */
  typeChosen: boolean;
  /** El rival ya respondió en esta ronda (sin saber qué). */
  opponentAnswered: boolean;
  /** El par elegido no era válido y el servidor sorteó otro. */
  typesNotice?: "pair_replaced";
}

/** Lo propio de una partida de silueta. */
export interface SilhouetteView {
  totalRounds: number;
  /** La ronda abierta (nunca dice qué Pokémon es). */
  round: SilhouetteRoundView | null;
  reveals: SilhouetteReveal[];
  /** La revelación de la última ronda cerrada (la que se ve en la pausa). */
  lastReveal: SilhouetteReveal | null;
  /** Cuándo empieza la ronda siguiente (null en la última o si no se sabe). */
  nextRoundAt: number | null;
}

function silhouetteFrom(state: SilhouetteStateView, previous: SilhouetteView | null): SilhouetteView {
  const lastReveal = state.reveals.at(-1) ?? null;
  return {
    totalRounds: state.totalRounds,
    round: state.round ? { ...state.round } : null,
    reveals: state.reveals,
    lastReveal,
    // Si se reconecta durante la pausa del resultado, la hora de la ronda siguiente que ya se conocía sigue valiendo.
    nextRoundAt: previous?.lastReveal?.round === lastReveal?.round ? (previous?.nextRoundAt ?? null) : null,
  };
}

/** Todo lo que la interfaz sabe de la partida; se reconstruye a partir de los eventos del servidor. */
export interface GameView {
  code: string | null;
  /** `null` mientras no ha llegado el primer `room-state`. */
  phase: GamePhase | null;
  config: RoomConfig | null;
  mySeat: Seat | null;
  players: RoomPlayerView[];
  myTeam: PokemonView[];
  /** Los Pokémon que el rival ya ganó (solo lo revelado, en el orden en que los fue ganando). */
  opponentTeam: PokemonView[];
  roundsPlayed: number;
  startsAt: number | null;
  round: RoundView | null;
  lastResult: RoundResultPayload | null;
  opponentGraceEndsAt: number | null;
  ended: GameEndedPayload | null;
  /** La oferta de revancha tras terminar la partida; `null` mientras no hay ninguna. */
  rematchOffer: RematchState | null;
  /** Esta sala nació de una revancha (los dos asientos ya estaban ocupados). */
  isRematchRoom: boolean;
  /** El código de la sala nueva cuando los dos aceptaron: hay que entrar a ella. */
  nextRoom: string | null;
  /** Solo en las salas de silueta; en «Doble tipo», null. */
  silhouette: SilhouetteView | null;
  /** Solo en las salas de subasta. */
  auction: AuctionStateView | null;
  /** Cómo se cerró el último lote, para anunciarlo. */
  lastSale: AuctionSalePayload | null;
  /** Los últimos turnos del combate, con los nombres de quienes pelearon entonces. Se pierde al recargar. */
  battleLog: BattleLogEntry[];
  lastRoundEnd: { round: number; loser: Seat; atLimit: boolean } | null;
  /** Hora del servidor menos hora del navegador. */
  clockOffset: number;
  lastError: { code: ErrorCode; message: string } | null;
}

export interface BattleLogEntry {
  round: number;
  turn: number;
  actions: BattleAction[];
  names: Record<Seat, string>;
  /** Quiénes entraron a pelear en este turno. */
  entered: string[];
  entryNotes: BattleNote[];
  endNotes: BattleNote[];
  abilityNames: Record<string, string>;
}

const BATTLE_LOG_MAX = 30;

/** Quiénes pelean ahora mismo: el `room-state` con los PS nuevos llega después del `battle-turn`. */
function fightingNames(view: GameView, switches: BattleSwitch[]): Record<Seat, string> {
  const battle = view.auction?.battle;
  const rivalSeat = view.mySeat === 2 ? 1 : 2;
  const titular = (seat: Seat, fallback: number | null | undefined) => switches.find((one) => one.seat === seat)?.pokemonId ?? fallback;
  const myId = titular(rivalSeat === 1 ? 2 : 1, battle?.myTitular);
  const rivalId = titular(rivalSeat, battle?.rivalTitular);
  const mine = battle?.myTeam.find((one) => one.pokemon.id === myId)?.pokemon.names.es ?? "Tu Pokémon";
  const theirs = battle?.rivalTeam.find((one) => one.pokemon.id === rivalId)?.pokemon.names.es ?? "Rival";
  return view.mySeat === 2 ? { 1: theirs, 2: mine } : { 1: mine, 2: theirs };
}

export const initialGameView: GameView = {
  code: null,
  phase: null,
  config: null,
  mySeat: null,
  players: [],
  myTeam: [],
  opponentTeam: [],
  roundsPlayed: 0,
  startsAt: null,
  round: null,
  lastResult: null,
  opponentGraceEndsAt: null,
  ended: null,
  rematchOffer: null,
  isRematchRoom: false,
  nextRoom: null,
  silhouette: null,
  auction: null,
  lastSale: null,
  battleLog: [],
  lastRoundEnd: null,
  clockOffset: 0,
  lastError: null,
};

/** Errores con los que la sala ya no existe para quien la pide (los mismos con los que la sala muestra «ya no existe»). */
const ROOM_GONE: ReadonlySet<string> = new Set(["ROOM_NOT_FOUND", "NOT_IN_ROOM", "ROOM_CLOSED"]);
/** Estados de la oferta que siguen esperando algo del servidor. */
const LIVE_OFFER: ReadonlySet<string> = new Set(["open", "mine", "theirs", "starting"]);

function setConnected(players: RoomPlayerView[], seat: Seat | null, connected: boolean): RoomPlayerView[] {
  return players.map((p) => (p.seat !== seat ? { ...p, connected } : p));
}

/**
 * Aplica un evento del servidor al estado. Es una función pura: no toca la red ni el reloj.
 * `receivedAt` (hora del navegador al recibirlo) sirve para calcular el desfase del reloj.
 * `room-state` reemplaza el estado completo: es la vía de recuperación tras recargar o reconectar.
 */
export function applyServerEvent(view: GameView, event: ServerEvent, receivedAt: number): GameView {
  switch (event.name) {
    case "room-state": {
      const state = event.payload;
      return {
        ...view,
        code: state.code,
        phase: state.phase,
        config: state.config,
        mySeat: state.mySeat,
        players: state.players,
        myTeam: state.myTeam,
        opponentTeam: state.opponentTeam,
        roundsPlayed: state.roundsPlayed,
        startsAt: state.startsAt,
        isRematchRoom: state.rematch === true,
        round: state.round && {
          number: state.round.number,
          pair: state.round.pair,
          deadline: state.round.deadline,
          answered: state.round.answered,
          typeChosen: state.round.typeChosen,
          opponentAnswered: state.round.opponentAnswered,
        },
        // Si se reconecta durante la pausa del resultado, el último resultado todavía sirve.
        lastResult: state.lastResult ?? (view.lastResult?.round === state.roundsPlayed ? view.lastResult : null),
        opponentGraceEndsAt: state.opponentGraceEndsAt,
        silhouette: state.silhouette ? silhouetteFrom(state.silhouette, view.silhouette) : null,
        auction: state.auction ?? null,
        ended: null,
        clockOffset: clockOffset(state.serverNow, receivedAt),
        lastError: null,
      };
    }

    case "player-joined": {
      const { username, guest, avatarId } = event.payload;
      // `guest` y `avatarId` solo están cuando aplican: quien llega sustituye al anterior, no hereda ni su marca ni su avatar.
      const joiner = (rest: Omit<RoomPlayerView, "guest" | "avatarId">): RoomPlayerView => ({
        ...rest,
        username,
        ...(guest ? { guest: true } : {}),
        ...(avatarId ? { avatarId } : {}),
      });
      const exists = view.players.some((p) => p.seat !== view.mySeat);
      return {
        ...view,
        players: exists
          ? view.players.map((p) => {
              if (p.seat === view.mySeat) return p;
              const { guest: _guest, avatarId: _avatar, ...rest } = p;
              return joiner(rest);
            })
          : [
              ...view.players,
              joiner({ seat: rivalSeat(view.mySeat ?? 2), username, connected: false, totalStats: 0, teamSize: 0 }),
            ],
      };
    }

    case "game-starting":
      return {
        ...view,
        phase: "starting",
        startsAt: event.payload.startsAt,
        clockOffset: clockOffset(event.payload.serverNow, receivedAt),
      };

    case "choose-types":
      return {
        ...view,
        phase: "choosing_types",
        startsAt: null,
        round: { number: event.payload.round, pair: null, deadline: event.payload.deadline, answered: false, typeChosen: false, opponentAnswered: false },
        clockOffset: clockOffset(event.payload.serverNow, receivedAt),
        lastError: null,
      };

    case "type-received":
      return view.round ? { ...view, round: { ...view.round, typeChosen: true } } : view;

    case "round-started": {
      const { round, type1, type2, deadline, typesNotice, serverNow } = event.payload;
      return {
        ...view,
        phase: "round_active",
        startsAt: null,
        round: {
          number: round,
          pair: [type1, type2],
          deadline,
          answered: false,
          typeChosen: view.round?.number === round ? view.round.typeChosen : false,
          opponentAnswered: false,
          ...(typesNotice ? { typesNotice } : {}),
        },
        lastResult: null,
        clockOffset: clockOffset(serverNow, receivedAt),
        lastError: null,
      };
    }

    case "opponent-answered": {
      // Solo cuenta para la ronda abierta: un aviso atrasado de otra ronda no se muestra.
      const { round } = event.payload;
      if (view.round?.number === round) return { ...view, round: { ...view.round, opponentAnswered: true } };
      const silhouetteRound = view.silhouette?.round;
      if (view.silhouette && silhouetteRound?.number === round) {
        return { ...view, silhouette: { ...view.silhouette, round: { ...silhouetteRound, opponentAnswered: true } } };
      }
      return view;
    }

    case "answer-received":
      return view.round ? { ...view, round: { ...view.round, answered: true } } : view;

    case "round-result": {
      const result = event.payload;
      const mine = view.mySeat ? result.results[view.mySeat].pokemon : null;
      const rival: Seat | null = view.mySeat === null ? null : rivalSeat(view.mySeat);
      const theirs = rival ? result.results[rival].pokemon : null;
      return {
        ...view,
        phase: "round_result",
        roundsPlayed: result.round,
        lastResult: result,
        lastError: null,
        players: view.players.map((p) => ({
          ...p,
          totalStats: result.results[p.seat].totalStats,
          teamSize: result.results[p.seat].teamSize,
        })),
        myTeam: mine && !view.myTeam.some((p) => p.id === mine.id) ? [...view.myTeam, mine] : view.myTeam,
        opponentTeam: theirs && !view.opponentTeam.some((p) => p.id === theirs.id) ? [...view.opponentTeam, theirs] : view.opponentTeam,
      };
    }

    case "game-ended":
      return { ...view, phase: "finished", ended: event.payload, opponentGraceEndsAt: null, lastError: null };

    case "opponent-disconnected":
      return {
        ...view,
        opponentGraceEndsAt: event.payload.graceEndsAt,
        players: setConnected(view.players, view.mySeat, false),
        clockOffset: clockOffset(event.payload.serverNow, receivedAt),
      };

    case "opponent-reconnected":
      return { ...view, opponentGraceEndsAt: null, players: setConnected(view.players, view.mySeat, true) };

    case "error": {
      // La sala vieja ya no existe para esta persona (se cortó más de 10 s, o la oferta se cerró sin que llegara el aviso):
      // la oferta no puede seguir viva en pantalla, o se quedaría esperando para siempre.
      const offer = view.rematchOffer;
      if (offer && LIVE_OFFER.has(offer.status) && ROOM_GONE.has(event.payload.code)) {
        return { ...view, lastError: event.payload, rematchOffer: { ...offer, status: "closed", closedReason: "unavailable", deadline: null } };
      }
      return { ...view, lastError: event.payload };
    }

    case "rematch-state":
      return { ...view, rematchOffer: event.payload, clockOffset: clockOffset(event.payload.serverNow, receivedAt) };

    case "rematch-room":
      return { ...view, nextRoom: event.payload.code };

    case "silhouette-round-started": {
      const { round, totalRounds, deadline, silhouetteUrl, serverNow } = event.payload;
      const base = view.silhouette ?? { totalRounds, round: null, reveals: [], lastReveal: null, nextRoundAt: null };
      return {
        ...view,
        phase: "round_active",
        silhouette: { ...base, totalRounds, round: { number: round, deadline, silhouetteUrl, answered: false, answeredMs: null, opponentAnswered: false }, nextRoundAt: null },
        clockOffset: clockOffset(serverNow, receivedAt),
      };
    }

    case "auction-sale":
      return { ...view, lastSale: event.payload };

    case "battle-turn": {
      const { round, turn, actions, switches = [], entryNotes = [], endNotes = [] } = event.payload;
      const names = fightingNames(view, switches);
      const battle = view.auction?.battle;
      const abilityNames = Object.fromEntries([...(battle?.myTeam ?? []), ...(battle?.rivalTeam ?? [])].flatMap((one) => (one.ability ? [[one.ability.id, one.ability.name]] : [])));
      return { ...view, battleLog: [...view.battleLog, { round, turn, actions, names, entered: switches.map((one) => names[one.seat]), entryNotes, endNotes, abilityNames }].slice(-BATTLE_LOG_MAX) };
    }

    case "battle-round-ended":
      return { ...view, lastRoundEnd: event.payload };

    // Lo que cambia llega en `room-state`.
    case "auction-reveal":
      return view;

    case "silhouette-answer-received": {
      const silhouette = view.silhouette;
      if (!silhouette?.round) return view;
      return { ...view, silhouette: { ...silhouette, round: { ...silhouette.round, answered: true, answeredMs: event.payload.ms } } };
    }

    case "silhouette-round-result": {
      const { reveal, totals, nextRoundAt, serverNow } = event.payload;
      const silhouette = view.silhouette ?? { totalRounds: view.config && isSilhouetteConfig(view.config) ? view.config.rounds : reveal.round, round: null, reveals: [], lastReveal: null, nextRoundAt: null };
      return {
        ...view,
        phase: "round_result",
        roundsPlayed: reveal.round,
        players: view.players.map((p) => ({ ...p, totalStats: totals[p.seat] })),
        silhouette: { ...silhouette, round: null, reveals: [...silhouette.reveals.filter((r) => r.round !== reveal.round), reveal], lastReveal: reveal, nextRoundAt },
        clockOffset: clockOffset(serverNow, receivedAt),
      };
    }
  }
}
