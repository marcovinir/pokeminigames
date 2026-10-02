import type { ServerEvent, ServerEventName, TypeName } from "@pokemon-minigames/shared";
import type { StoreApi } from "zustand";
import type { GameStoreState } from "./store";

/** Lo que el cliente de juego necesita de un socket (el `Socket` de socket.io lo cumple). */
export interface SocketLike {
  connected: boolean;
  on(event: string, handler: (...args: any[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  connect(): unknown;
  disconnect(): unknown;
}

/** Acciones del jugador durante una partida. La interfaz solo depende de esto. */
export interface GameClientApi {
  /** Entra (o reconecta) a una sala y empieza a recibir su estado. */
  join(code: string): void;
  chooseType(type: TypeName): void;
  submit(text: string): void;
  /** Sale de la sala: cancela la espera o abandona la partida. */
  leave(): void;
  /** Cierra la conexión y limpia el estado (al salir de la pantalla de la sala). */
  dispose(): void;
}

export interface GameClientDeps {
  createSocket(): SocketLike;
  store: StoreApi<GameStoreState>;
  /** Renueva la sesión; se usa si el servidor rechaza el token del socket por caducado. */
  refreshSession(): Promise<unknown>;
  /** Se llama si la sesión no se pudo renovar: hay que volver a iniciar sesión. */
  onSessionLost?(): void;
  /** Hora actual del navegador; se reemplaza en las pruebas. */
  now?: () => number;
}

// Un `Record` exige listar todos los eventos: si `shared` añade uno, esto deja de compilar.
const SERVER_EVENTS: Record<ServerEventName, true> = {
  "room-state": true,
  "player-joined": true,
  "game-starting": true,
  "choose-types": true,
  "type-received": true,
  "round-started": true,
  "answer-received": true,
  "round-result": true,
  "game-ended": true,
  "opponent-disconnected": true,
  "opponent-reconnected": true,
  error: true,
};
const SERVER_EVENT_NAMES = Object.keys(SERVER_EVENTS) as ServerEventName[];

/**
 * Envuelve el socket: entrega al almacén cada evento del servidor y envía las acciones del
 * jugador. No contiene reglas del juego: el servidor es la autoridad.
 */
export class GameClient implements GameClientApi {
  private socket: SocketLike | null = null;
  private code: string | null = null;
  private retriedAuth = false;

  constructor(private readonly deps: GameClientDeps) {}

  join(code: string): void {
    const { store } = this.deps;
    this.code = code;
    store.getState().reset();
    store.getState().setConnection("connecting");
    const socket = this.ensureSocket();
    if (socket.connected) socket.emit("join-room", { code });
    else socket.connect();
  }

  chooseType(type: TypeName): void {
    this.socket?.emit("choose-type", { type });
  }

  submit(text: string): void {
    this.socket?.emit("submit-pokemon", { text });
  }

  leave(): void {
    this.socket?.emit("leave-room");
  }

  dispose(): void {
    const socket = this.socket;
    this.socket = null;
    this.code = null;
    socket?.disconnect();
    this.deps.store.getState().reset();
  }

  private ensureSocket(): SocketLike {
    if (this.socket) return this.socket;
    const { store } = this.deps;
    const now = this.deps.now ?? Date.now;
    const socket = this.deps.createSocket();
    this.socket = socket;
    // Un socket ya descartado (dispose) no debe seguir tocando el estado.
    const current = (): boolean => this.socket === socket;

    socket.on("connect", () => {
      if (!current()) return;
      this.retriedAuth = false;
      store.getState().setConnection("connected");
      // También al reconectar: el servidor responde con `room-state` y el estado se reemplaza.
      // Con la partida ya terminada no se vuelve a entrar: la sala ya no existe y se perdería el resumen.
      if (this.code && store.getState().view.phase !== "finished") socket.emit("join-room", { code: this.code });
    });
    socket.on("disconnect", (reason: string) => {
      if (!current()) return;
      // Si lo cierra el servidor (otra pestaña tomó la partida) socket.io no reconecta por su cuenta.
      store.getState().setConnection(reason === "io server disconnect" ? "replaced" : "disconnected");
    });
    socket.on("connect_error", (error: Error) => {
      if (!current()) return;
      store.getState().setConnection("disconnected");
      // El access token del handshake pudo caducar: se renueva y se reintenta, una sola vez.
      if (error.message === "UNAUTHORIZED" && !this.retriedAuth) {
        this.retriedAuth = true;
        void this.deps.refreshSession().then((session) => {
          if (!current()) return;
          if (session) socket.connect();
          else this.deps.onSessionLost?.();
        });
      }
    });
    for (const name of SERVER_EVENT_NAMES) {
      socket.on(name, (payload: unknown) => {
        if (current()) store.getState().receive({ name, payload } as ServerEvent, now());
      });
    }
    return socket;
  }
}
