import type { Mail, Mailer } from "./mailer.js";

/**
 * Imprime el correo en la consola del servidor, para probar el flujo completo en el PC sin Resend. Escribe el código, así
 * que la configuración lo prohíbe en producción.
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: (line: string) => void = console.log) {}

  async send(mail: Mail): Promise<void> {
    this.log(`[correo simulado] para ${mail.to} — ${mail.subject}\n${mail.text}`);
  }
}
