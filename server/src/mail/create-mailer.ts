import { ConsoleMailer } from "./console-mailer.js";
import { type Mail, type Mailer, MailerError } from "./mailer.js";
import { MemoryMailer } from "./memory-mailer.js";
import { ResendMailer } from "./resend-mailer.js";

/** Lo que el servicio de correo toma de la configuración. */
export interface MailerEnv {
  MAIL_PROVIDER?: "resend" | "console" | "memory";
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

export interface MailerDeps {
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

/** Sin proveedor (producción con la verificación apagada) nada debería enviar: si algo lo intenta, falla con un error claro. */
class DisabledMailer implements Mailer {
  async send(_mail: Mail): Promise<void> {
    throw new MailerError(null, "El envío de correo no está configurado");
  }
}

export function createMailer(env: MailerEnv, deps: MailerDeps = {}): Mailer {
  switch (env.MAIL_PROVIDER) {
    case "resend":
      // La configuración ya exige las dos variables con Resend: esto solo protege de un uso equivocado desde el código.
      if (!env.RESEND_API_KEY) throw new Error("Falta RESEND_API_KEY");
      if (!env.MAIL_FROM) throw new Error("Falta MAIL_FROM");
      return new ResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM, fetch: deps.fetch });
    case "console":
      return new ConsoleMailer(deps.log);
    case "memory":
      return new MemoryMailer();
    default:
      return new DisabledMailer();
  }
}
