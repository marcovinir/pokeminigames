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

/** La forma que escribe `toISOString()` para años de cuatro cifras. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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
  // Un año negativo, de seis cifras o el cero los acepta JavaScript pero no el timestamptz de PostgreSQL: darían un 500.
  if (!ISO_DATE.test(date) || Number.isNaN(endedAt.getTime()) || endedAt.getUTCFullYear() < 1 || endedAt.toISOString() !== date || !UUID.test(id)) {
    throw new InvalidCursorError();
  }
  return { endedAt, id };
}
