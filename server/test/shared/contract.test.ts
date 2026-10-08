import {
  ERROR_CODES,
  GAME_END_REASONS,
  THEME_MODES,
  THEME_NAMES,
  TYPE_NAMES,
  normalizeName as sharedNormalizeName,
} from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { normalizeName as serverNormalizeName } from "../../src/catalog/normalize.js";
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

  it("incluye los códigos de la verificación por correo (etapa 7)", () => {
    for (const code of ["EMAIL_NOT_VERIFIED", "INVALID_CODE", "EMAIL_SEND_FAILED"]) expect(ERROR_CODES).toContain(code);
  });

  it("los motivos de fin y las opciones de tema no se repiten", () => {
    expect(new Set(GAME_END_REASONS).size).toBe(GAME_END_REASONS.length);
    expect(GAME_END_REASONS).toHaveLength(7);
    expect(THEME_NAMES).toEqual(["clasico", "pokedex"]);
    expect(THEME_MODES).toEqual(["auto", "claro", "oscuro"]);
  });

  it("los códigos de error no se repiten e incluyen los de salas y partida", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ["ALREADY_IN_GAME", "ROOM_NOT_FOUND", "ROOM_FULL", "ROOM_CLOSED", "NOT_IN_ROOM", "WRONG_PHASE", "ALREADY_ANSWERED", "ALREADY_CHOSEN", "INVALID_TYPE", "RATE_LIMITED"]) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});
