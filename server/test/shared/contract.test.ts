import { ERROR_CODES, TYPE_NAMES } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { TYPE_NAMES as SNAPSHOT_TYPE_NAMES, typeId } from "../../src/catalog/snapshot.js";

describe("paquete shared", () => {
  it("define los 18 tipos sin repetir, y el servidor usa esa misma lista", () => {
    expect(TYPE_NAMES).toHaveLength(18);
    expect(new Set(TYPE_NAMES).size).toBe(18);
    expect(SNAPSHOT_TYPE_NAMES).toBe(TYPE_NAMES);
    expect(typeId("normal")).toBe(1);
    expect(typeId("fairy")).toBe(18);
  });

  it("los códigos de error no se repiten e incluyen los de salas y partida", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ["ALREADY_IN_GAME", "ROOM_NOT_FOUND", "ROOM_FULL", "ROOM_CLOSED", "NOT_IN_ROOM", "WRONG_PHASE", "ALREADY_ANSWERED", "ALREADY_CHOSEN", "INVALID_TYPE", "RATE_LIMITED"]) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});
