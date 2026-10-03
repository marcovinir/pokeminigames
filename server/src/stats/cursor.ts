/** Posición en el historial: la fecha de fin y el id de la última partida entregada. */
export interface HistoryCursor {
  endedAt: Date;
  id: string;
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Cursor inválido");
    this.name = "InvalidCursorError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Texto opaco y seguro para una URL; el cliente solo lo devuelve tal cual. */
export function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(`${cursor.endedAt.toISOString()}|${cursor.id}`).toString("base64url");
}

export function decodeCursor(text: string): HistoryCursor {
  const parts = Buffer.from(text, "base64url").toString("utf8").split("|");
  if (parts.length !== 2) throw new InvalidCursorError();
  const [date, id] = parts as [string, string];
  const endedAt = new Date(date);
  if (Number.isNaN(endedAt.getTime()) || endedAt.toISOString() !== date || !UUID.test(id)) {
    throw new InvalidCursorError();
  }
  return { endedAt, id };
}
