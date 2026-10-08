/** Un correo listo para enviar. */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Quien envía correos: Resend en producción, la consola en desarrollo y la memoria en las pruebas. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Un correo que no se pudo enviar. `status` es el de la respuesta del proveedor, o nulo si ni siquiera respondió. El mensaje
 * nunca lleva la dirección, el código ni la clave: se escribe en el registro del servidor y a quien usa la aplicación no
 * le llega nada del proveedor.
 */
export class MailerError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "MailerError";
  }
}
