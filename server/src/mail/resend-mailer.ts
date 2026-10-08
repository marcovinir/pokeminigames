import { type Mail, type Mailer, MailerError } from "./mailer.js";

const ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 8000;

export interface ResendMailerOptions {
  apiKey: string;
  /** «Nombre <dirección>» o solo la dirección, de un dominio verificado en Resend. */
  from: string;
  /** Reemplazable en las pruebas. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** El nombre del error que informa Resend (`validation_error`, `rate_limit_exceeded`…); nunca su mensaje, que puede repetir la dirección. */
async function providerErrorName(response: Response): Promise<string | null> {
  try {
    const data: unknown = await response.json();
    const name = typeof data === "object" && data !== null ? (data as { name?: unknown }).name : undefined;
    return typeof name === "string" && /^[a-z_]{1,60}$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

const isTimeout = (error: unknown): boolean => error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

/** Envía por la API HTTP de Resend (Render gratis bloquea el correo por SMTP). Sin SDK: es una sola llamada. */
export class ResendMailer implements Mailer {
  constructor(private readonly options: ResendMailerOptions) {}

  async send(mail: Mail): Promise<void> {
    const doFetch = this.options.fetch ?? globalThis.fetch.bind(globalThis);
    let response: Response;
    try {
      response = await doFetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.options.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new MailerError(null, isTimeout(error) ? "Resend no respondió a tiempo" : "No se pudo conectar con Resend");
    }
    if (response.ok) return;
    const name = await providerErrorName(response);
    throw new MailerError(response.status, `Resend respondió ${response.status}${name ? ` (${name})` : ""}`);
  }
}
