import type { RematchClosedReason, RematchRecord, RematchState, RoomConfig, Seat } from "@pokemon-minigames/shared";
import { AppError } from "../http/errors.js";
import { REMATCH_ASK_WINDOW_MS, REMATCH_RECONNECT_GRACE_MS, REMATCH_RESPONSE_MS, REMATCH_ROOM_TTL_SECONDS, seconds } from "./constants.js";
import { SEATS } from "./engine/types.js";
import type { Broadcaster, Clock, Scheduler } from "./ports.js";
import { mirrorRecord } from "./rematch-record.js";

export interface RematchPlayer {
  userId: string;
  username: string;
  isGuest: boolean;
  /** El avatar que tenía en la sala que acaba de terminar: la revancha lo copia. */
  avatarId: number | null;
}

export interface RematchDeps {
  clock: Clock;
  scheduler: Scheduler;
  broadcaster: Broadcaster;
  /** Quita la sala terminada del almacén: se llama una vez, al cerrarse la oferta (por el motivo que sea). */
  release(code: string): void;
  /**
   * Crea la sala de la revancha (código nuevo, los mismos jugadores y asientos, la misma configuración). Si uno de los
   * dos ya está en otra sala lanza `AppError` con código `ALREADY_IN_GAME` y `details: { seat }`.
   */
  createRoom(input: { players: Record<Seat, RematchPlayer>; config: RoomConfig }): Promise<{ code: string }>;
  /** Cancela una sala de revancha recién creada (alguien se fue mientras se creaba): sin partida y fuera del almacén. */
  cancelRoom(code: string): void;
  logger?: { error(message: string, error?: unknown): void };
}

type CloseReason = Exclude<RematchClosedReason, "self">;

interface Offer {
  code: string;
  players: Record<Seat, RematchPlayer>;
  config: RoomConfig;
  /** `open`: nadie ha pedido; `requested`: alguien pidió y espera; `creating`: los dos aceptaron y se crea la sala. */
  phase: "open" | "requested" | "creating";
  requestedBy: Seat | null;
  /** Hasta cuándo vale el reloj vigente: el tope para pedir o el plazo para responder (hora del servidor, ms). */
  deadline: number;
  /** El récord visto desde el asiento 1. */
  record: RematchRecord | null;
  cancelAskWindow: () => void;
  cancelResponse: (() => void) | null;
  /** Una recarga no cuenta como salir: cada desconexión tiene unos segundos para volver. */
  grace: Partial<Record<Seat, () => void>>;
  /** Quien salió mientras se creaba la sala: la sala nueva se cancela al terminar de crearse. */
  leftDuringCreate: Seat | null;
}

/** Tras crear la sala, durante un rato la sala vieja «apunta» a la nueva (para quien recargó o reconectó en ese momento). */
interface Forward {
  code: string;
  userIds: string[];
  cancel: () => void;
}

const normalizeCode = (code: string): string => code.trim().toUpperCase();

/**
 * La oferta de revancha de una partida terminada. Vive aquí y no en `GameRoom`: la sala ya terminó y lo único que queda
 * es decidir si hay otra. Tres relojes la acotan (5 min para pedir, 60 s para responder desde la primera petición y 10 s
 * de reconexión), así que nada queda vivo para siempre; cada cierre cancela todos los temporizadores y libera la sala.
 */
export class RematchCoordinator {
  private readonly offers = new Map<string, Offer>();
  private readonly forwards = new Map<string, Forward>();

  constructor(private readonly deps: RematchDeps) {}

  /**
   * Abre la oferta de una sala que acaba de terminar con normalidad y se lo cuenta a los dos. `record` es el récord visto
   * desde el asiento 1 (lo arma quien abre la oferta, tras guardar la partida), o `null` si no hay: cuando llega se
   * reenvía el estado con él.
   */
  open(input: { code: string; players: Record<Seat, RematchPlayer>; config: RoomConfig; record: Promise<RematchRecord | null> | null }): void {
    const { code } = input;
    const offer: Offer = {
      code,
      players: input.players,
      config: input.config,
      phase: "open",
      requestedBy: null,
      deadline: this.deps.clock.now() + REMATCH_ASK_WINDOW_MS,
      record: null,
      cancelAskWindow: () => {},
      cancelResponse: null,
      grace: {},
      leftDuringCreate: null,
    };
    offer.cancelAskWindow = this.deps.scheduler.schedule(REMATCH_ASK_WINDOW_MS, () => this.close(offer, "unavailable"));
    this.offers.set(code, offer);
    this.sendAll(offer);

    input.record?.then(
      (record) => {
        if (this.offers.get(code) !== offer || !record) return;
        offer.record = record;
        this.sendAll(offer);
      },
      (error) => this.deps.logger?.error(`No se pudo leer el récord de la revancha (sala ${code})`, error),
    );
  }

  has(code: string): boolean {
    return this.offers.has(code);
  }

  /**
   * Si los dos aceptaron hace poco (lo que dura la sala de revancha esperando), el código de la sala nueva para esa
   * persona: quien recarga o reconecta justo cuando el rival acepta se perdió `rematch-room` y así lo recupera.
   */
  forwardFor(oldCode: string, userId: string): string | null {
    const forward = this.forwards.get(normalizeCode(oldCode));
    return forward && forward.userIds.includes(userId) ? forward.code : null;
  }

  /** El estado vigente para ese asiento, o `null` si no hay oferta (se usa al reconectar). */
  stateFor(code: string, seat: Seat): RematchState | null {
    const offer = this.offers.get(code);
    return offer ? this.stateOf(offer, seat) : null;
  }

  /** Pedir la revancha o aceptar la que pidió el rival. */
  request(code: string, seat: Seat): void {
    const offer = this.offers.get(code);
    if (!offer || offer.phase === "creating") return;

    if (offer.phase === "open") {
      offer.phase = "requested";
      offer.requestedBy = seat;
      offer.deadline = this.deps.clock.now() + REMATCH_RESPONSE_MS;
      // Desde la primera petición manda el plazo de responder: el tope para pedir ya no cuenta.
      offer.cancelAskWindow();
      offer.cancelResponse = this.deps.scheduler.schedule(REMATCH_RESPONSE_MS, () => this.close(offer, "timeout"));
      this.sendAll(offer);
      return;
    }
    if (offer.requestedBy === seat) return;

    // Los dos quieren. El cambio de fase es síncrono: una petición más no puede crear una segunda sala.
    offer.phase = "creating";
    offer.cancelResponse?.();
    offer.cancelResponse = null;
    this.sendAll(offer);
    void this.create(offer);
  }

  /** Cancelar la que pedí o rechazar la que pidió el rival: el otro ve «ya no quiere». Sin petición en marcha no hace nada. */
  cancel(code: string, seat: Seat): void {
    const offer = this.offers.get(code);
    if (!offer || offer.phase !== "requested") return;
    this.close(offer, "declined", seat);
  }

  /** Salir (volver al lobby, irse o cerrar la pestaña sin volver): el otro ve «se fue». */
  leave(code: string, seat: Seat): void {
    const offer = this.offers.get(code);
    if (!offer) return;
    // Mientras se crea la sala no se puede cerrar todavía: se anota y la sala nueva se cancela en cuanto exista.
    if (offer.phase === "creating") {
      offer.leftDuringCreate = seat;
      return;
    }
    this.close(offer, "left", seat);
  }

  /** El socket de ese asiento se soltó: si no vuelve en unos segundos cuenta como salir. */
  disconnected(code: string, seat: Seat): void {
    const offer = this.offers.get(code);
    if (!offer || offer.phase === "creating") return;
    offer.grace[seat]?.();
    offer.grace[seat] = this.deps.scheduler.schedule(REMATCH_RECONNECT_GRACE_MS, () => {
      delete offer.grace[seat];
      this.leave(code, seat);
    });
  }

  /** Volvió: se cancela la cuenta de salida y se le reenvía el estado vigente. */
  reconnected(code: string, seat: Seat): void {
    const offer = this.offers.get(code);
    if (!offer) return;
    offer.grace[seat]?.();
    delete offer.grace[seat];
    this.send(offer, seat, this.stateOf(offer, seat));
  }

  // --- Internos ---------------------------------------------------------------------------------------------------

  private async create(offer: Offer): Promise<void> {
    try {
      const { code } = await this.deps.createRoom({ players: offer.players, config: offer.config });
      if (this.offers.get(offer.code) !== offer) return;
      if (offer.leftDuringCreate !== null) {
        // Alguien se fue mientras se creaba: no se juega. Quien se queda ve «se fue», como con cualquier salida.
        this.deps.cancelRoom(code);
        this.close(offer, "left", offer.leftDuringCreate);
        return;
      }
      this.finish(offer);
      this.addForward(offer, code);
      for (const seat of SEATS) this.deps.broadcaster.toSeat(offer.code, seat, { name: "rematch-room", payload: { code } });
    } catch (error) {
      if (error instanceof AppError && error.code === "ALREADY_IN_GAME") {
        // Quien ya estaba en otra sala cuenta como «se fue» para el otro; a esa persona (si aún tiene abierta la pestaña
        // vieja en el resumen) se le dice que la revancha ya no está, para que no se quede en «¡Revancha!».
        const busy = (error.details as { seat?: Seat } | undefined)?.seat;
        this.close(offer, "left", busy);
        if (busy) this.send(offer, busy, { serverNow: this.deps.clock.now(), status: "closed", deadline: null, closedReason: "unavailable" });
        return;
      }
      this.deps.logger?.error(`No se pudo crear la sala de la revancha (sala ${offer.code})`, error);
      this.close(offer, "failed");
    }
  }

  /** Cierra la oferta con un aviso. `by`: quien lo provocó (si canceló no recibe aviso, si se fue tampoco). */
  private close(offer: Offer, reason: CloseReason, by?: Seat): void {
    if (this.offers.get(offer.code) !== offer) return;
    this.finish(offer);
    const serverNow = this.deps.clock.now();
    for (const seat of SEATS) {
      if (reason === "left" && seat === by) continue;
      const closedReason: RematchClosedReason = reason === "declined" && seat === by ? "self" : reason;
      this.send(offer, seat, { serverNow, status: "closed", deadline: null, closedReason });
    }
  }

  private addForward(offer: Offer, code: string): void {
    const key = normalizeCode(offer.code);
    this.forwards.get(key)?.cancel();
    const cancel = this.deps.scheduler.schedule(seconds(REMATCH_ROOM_TTL_SECONDS), () => this.forwards.delete(key));
    this.forwards.set(key, { code, userIds: SEATS.map((seat) => offer.players[seat].userId), cancel });
  }

  /** Quita la oferta, cancela todos sus temporizadores y libera la sala terminada. */
  private finish(offer: Offer): void {
    this.offers.delete(offer.code);
    offer.cancelAskWindow();
    offer.cancelResponse?.();
    for (const cancel of Object.values(offer.grace)) cancel();
    offer.grace = {};
    this.deps.release(offer.code);
  }

  private stateOf(offer: Offer, seat: Seat): RematchState {
    const serverNow = this.deps.clock.now();
    const record = offer.record ? (seat === 1 ? offer.record : mirrorRecord(offer.record)) : null;
    const withRecord = record ? { record } : {};
    switch (offer.phase) {
      case "open":
        return { serverNow, status: "open", deadline: offer.deadline, ...withRecord };
      case "requested":
        return { serverNow, status: offer.requestedBy === seat ? "mine" : "theirs", deadline: offer.deadline, ...withRecord };
      case "creating":
        return { serverNow, status: "starting", deadline: null, ...withRecord };
    }
  }

  private sendAll(offer: Offer): void {
    for (const seat of SEATS) this.send(offer, seat, this.stateOf(offer, seat));
  }

  private send(offer: Offer, seat: Seat, state: RematchState): void {
    this.deps.broadcaster.toSeat(offer.code, seat, { name: "rematch-state", payload: state });
  }
}

