import { type Request, type Response, Router } from "express";
import { AppError } from "../http/errors.js";
import { tooManyRequests } from "../http/rate-limit.js";
import { emailOnlySchema, resetPasswordSchema, verifyEmailSchema } from "./auth.schemas.js";
import type { AuthResult, AuthService } from "./auth.service.js";
import type { CodeLimits } from "./code-limits.js";

export const SEND_LIMIT_MESSAGE = "Pediste demasiados códigos. Inténtalo de nuevo más tarde.";
const CHECK_LIMIT_MESSAGE = "Demasiados intentos con el código. Inténtalo de nuevo más tarde.";

const clientIp = (req: Request): string => req.ip ?? "desconocida";

/** Si el límite no deja pasar, 429 con la espera en el cuerpo y en `Retry-After`. */
export function rejectWhenBlocked(res: Response, wait: number | null, message: string): void {
  if (wait === null) return;
  res.set("Retry-After", String(wait));
  throw tooManyRequests(wait, message);
}

/** Un fallo en una tarea de segundo plano (nadie espera su respuesta): se anota sin dirección ni código. */
export function logBackgroundFailure(error: unknown): void {
  console.error(`[correo] Falló una tarea en segundo plano: ${error instanceof Error ? error.name : "error desconocido"}`);
}

const isInvalidCode = (error: unknown): boolean => error instanceof AppError && error.code === "INVALID_CODE";

export interface RecoveryRouterDeps {
  authService: AuthService;
  codeLimits: CodeLimits;
  /** Abre la sesión (cookie de refresco y cuerpo) con el resultado de verificar el correo. */
  openSession(res: Response, result: AuthResult): void;
}

/**
 * Verificar el correo, reenviar el código y cambiar la contraseña. Solo se monta con la verificación activa.
 * `resend` y `forgot` contestan siempre lo mismo y **antes** de buscar la cuenta y enviar: ni el cuerpo ni el tiempo de
 * respuesta delatan si el correo existe, y sus límites dependen del correo y la IP, nunca de la cuenta.
 */
export function createRecoveryRouter({ authService, codeLimits, openSession }: RecoveryRouterDeps): Router {
  const router = Router();

  router.post("/verify-email", async (req, res) => {
    // El formato se valida antes de tocar los límites: un código mal escrito no gasta ningún intento.
    const input = verifyEmailSchema.parse(req.body);
    const ip = clientIp(req);
    // El intento se reserva ANTES de comprobar el código (la comprobación espera a la base de datos): si no, los intentos
    // en paralelo pasarían todos con la cuenta aún a cero.
    rejectWhenBlocked(res, codeLimits.reserveFailure(ip, input.email), CHECK_LIMIT_MESSAGE);
    let result: AuthResult;
    try {
      result = await authService.verifyEmail(input);
    } catch (error) {
      // Un fallo nuestro (la base de datos, p. ej.) no es un intento fallido de quien escribió el código.
      if (!isInvalidCode(error)) codeLimits.releaseFailure(ip, input.email);
      throw error;
    }
    codeLimits.forgiveFailure(ip, input.email);
    openSession(res, result);
  });

  router.post("/verification/resend", (req, res) => {
    const { email } = emailOnlySchema.parse(req.body);
    rejectWhenBlocked(res, codeLimits.reserveSend(clientIp(req), email), SEND_LIMIT_MESSAGE);
    void authService.resendVerification(email).catch(logBackgroundFailure);
    res.status(202).json({ ok: true });
  });

  router.post("/password/forgot", (req, res) => {
    const { email } = emailOnlySchema.parse(req.body);
    rejectWhenBlocked(res, codeLimits.reserveSend(clientIp(req), email), SEND_LIMIT_MESSAGE);
    void authService.requestPasswordReset(email).catch(logBackgroundFailure);
    res.status(202).json({ ok: true });
  });

  router.post("/password/reset", async (req, res) => {
    // La contraseña nueva también se valida antes de reservar el intento: una demasiado corta no gasta el código.
    const input = resetPasswordSchema.parse(req.body);
    const ip = clientIp(req);
    rejectWhenBlocked(res, codeLimits.reserveFailure(ip, input.email), CHECK_LIMIT_MESSAGE);
    try {
      await authService.resetPassword(input);
    } catch (error) {
      if (!isInvalidCode(error)) codeLimits.releaseFailure(ip, input.email);
      throw error;
    }
    codeLimits.forgiveFailure(ip, input.email);
    res.status(204).end();
  });

  return router;
}
