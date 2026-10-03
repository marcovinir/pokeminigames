import { describe, expect, it } from "vitest";
import { InvalidCursorError, decodeCursor, encodeCursor } from "../../src/stats/cursor.js";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("cursor del historial", () => {
  it("se puede codificar y volver a leer, sin perder los milisegundos", () => {
    const endedAt = new Date("2026-10-01T12:34:56.789Z");
    const text = encodeCursor({ endedAt, id });
    expect(decodeCursor(text)).toEqual({ endedAt, id });
  });

  it("es un texto opaco que se puede poner en una URL", () => {
    const text = encodeCursor({ endedAt: new Date("2026-10-01T12:34:56.789Z"), id });
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ["vacío", ""],
    ["texto cualquiera", "hola"],
    ["base64 que no es un cursor", Buffer.from("otra cosa").toString("base64url")],
    ["fecha inválida", Buffer.from(`no-es-fecha|${id}`).toString("base64url")],
    ["id que no es un uuid", Buffer.from("2026-10-01T12:34:56.789Z|123").toString("base64url")],
    ["sin id", Buffer.from("2026-10-01T12:34:56.789Z|").toString("base64url")],
    ["con partes de más", Buffer.from(`2026-10-01T12:34:56.789Z|${id}|x`).toString("base64url")],
    // Fechas que JavaScript acepta y escribe igual, pero que PostgreSQL no admite en un timestamptz.
    ["año negativo", Buffer.from(`-271821-04-20T00:00:00.000Z|${id}`).toString("base64url")],
    ["año de seis cifras", Buffer.from(`+010000-01-01T00:00:00.000Z|${id}`).toString("base64url")],
    ["año cero", Buffer.from(`0000-01-01T00:00:00.000Z|${id}`).toString("base64url")],
  ])("rechaza un cursor inválido: %s", (_name, text) => {
    expect(() => decodeCursor(text)).toThrow(InvalidCursorError);
  });
});
