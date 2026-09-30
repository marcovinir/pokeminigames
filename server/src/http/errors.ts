import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "EMAIL_TAKEN"
  | "USERNAME_TAKEN"
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "INVALID_REFRESH_TOKEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

/** Error esperado de la aplicación: se convierte en una respuesta HTTP con código tipado. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Ruta no encontrada" } });
};

function errorType(err: unknown): unknown {
  return typeof err === "object" && err !== null ? (err as { type?: unknown }).type : undefined;
}

// Express identifica un manejador de errores por tener 4 parámetros.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    });
    return;
  }
  if (errorType(err) === "entity.parse.failed") {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "El cuerpo no es JSON válido" } });
    return;
  }
  if (errorType(err) === "entity.too.large") {
    res.status(413).json({ error: { code: "VALIDATION_ERROR", message: "El cuerpo es demasiado grande" } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } });
};
