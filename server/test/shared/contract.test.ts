import {
  type ClientToServerEvents,
  ERROR_CODES,
  GAME_END_REASONS,
  type RematchState,
  type RoomStateView,
  type ServerToClientEvents,
  THEME_MODES,
  THEME_NAMES,
  TYPE_NAMES,
  normalizeName as sharedNormalizeName,
} from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { normalizeName as serverNormalizeName } from "../../src/catalog/normalize.js";
import {
  REMATCH_ASK_WINDOW_MS,
  REMATCH_END_REASONS,
  REMATCH_RECENT_GAMES,
  REMATCH_RECONNECT_GRACE_MS,
  REMATCH_RESPONSE_MS,
  REMATCH_ROOM_TTL_SECONDS,
} from "../../src/game/constants.js";
import { TYPE_NAMES as SNAPSHOT_TYPE_NAMES, typeId } from "../../src/catalog/snapshot.js";

describe("paquete shared", () => {
  it("define los 18 tipos sin repetir, y el servidor usa esa misma lista", () => {
    expect(TYPE_NAMES).toHaveLength(18);
    expect(new Set(TYPE_NAMES).size).toBe(18);
    expect(SNAPSHOT_TYPE_NAMES).toBe(TYPE_NAMES);
    expect(typeId("normal")).toBe(1);
    expect(typeId("fairy")).toBe(18);
  });

  it("normalizeName es una sola función: el servidor y el cliente normalizan igual", () => {
    expect(serverNormalizeName).toBe(sharedNormalizeName);
    expect(sharedNormalizeName("Nidoran♀")).toBe("nidoranf");
    expect(sharedNormalizeName("  Épsilon ")).toBe("epsilon");
  });

  it("incluye el código de jugador inexistente", () => {
    expect(ERROR_CODES).toContain("USER_NOT_FOUND");
  });

  it("los motivos de fin y las opciones de tema no se repiten", () => {
    expect(new Set(GAME_END_REASONS).size).toBe(GAME_END_REASONS.length);
    expect(GAME_END_REASONS).toHaveLength(7);
    expect(THEME_NAMES).toEqual(["clasico", "pokedex"]);
    expect(THEME_MODES).toEqual(["auto", "claro", "oscuro"]);
  });

  it("incluye los códigos del modo invitado", () => {
    expect(ERROR_CODES).toContain("ACCOUNT_REQUIRED");
    expect(ERROR_CODES).toContain("NAME_IN_USE");
  });

  it("los eventos de la revancha existen en el contrato con la carga acordada", () => {
    const state: RematchState = { serverNow: 1, status: "mine", deadline: 2, record: { mine: 3, theirs: 2, draws: 0, played: 5, recent: ["won", "lost"] } };
    const toClient = {
      "rematch-state": (payload: RematchState) => void payload,
      "rematch-room": (payload: { code: string }) => void payload,
    } satisfies Partial<ServerToClientEvents>;
    const toServer = { "rematch-request": () => {}, "rematch-cancel": () => {} } satisfies Partial<ClientToServerEvents>;
    const roomState: Pick<RoomStateView, "rematch"> = { rematch: true };
    expect(Object.keys(toClient)).toEqual(["rematch-state", "rematch-room"]);
    expect(Object.keys(toServer)).toEqual(["rematch-request", "rematch-cancel"]);
    expect(state.record?.played).toBe(5);
    expect(roomState.rematch).toBe(true);
  });

  it("los relojes de la revancha valen 5 min, 60 s, 10 s y 30 s, y solo completed y exhausted permiten oferta", () => {
    expect(REMATCH_ASK_WINDOW_MS).toBe(5 * 60 * 1000);
    expect(REMATCH_RESPONSE_MS).toBe(60 * 1000);
    expect(REMATCH_RECONNECT_GRACE_MS).toBe(10 * 1000);
    expect(REMATCH_ROOM_TTL_SECONDS).toBe(30);
    expect(REMATCH_RECENT_GAMES).toBe(5);
    expect([...REMATCH_END_REASONS]).toEqual(["completed", "exhausted"]);
  });

  it("los códigos de error no se repiten e incluyen los de salas y partida", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ["ALREADY_IN_GAME", "ROOM_NOT_FOUND", "ROOM_FULL", "ROOM_CLOSED", "NOT_IN_ROOM", "WRONG_PHASE", "ALREADY_ANSWERED", "ALREADY_CHOSEN", "INVALID_TYPE", "RATE_LIMITED"]) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});
