import type { Mail, Mailer } from "./mailer.js";

/** Guarda los correos en una lista en vez de enviarlos: las pruebas y la E2E leen de ahí los códigos. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];
  /** Mientras tenga un error, cada envío falla con él (para probar qué pasa cuando el proveedor cae). */
  failWith: Error | null = null;

  async send(mail: Mail): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push({ ...mail });
  }

  /** Lo enviado a una dirección (sin distinguir mayúsculas), del más antiguo al más reciente. */
  to(address: string): Mail[] {
    const wanted = address.toLowerCase();
    return this.sent.filter((mail) => mail.to.toLowerCase() === wanted);
  }

  clear(): void {
    this.sent.length = 0;
  }
}
