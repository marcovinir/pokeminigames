import { describe, expect, it } from "vitest";
import { ConsoleMailer } from "../../src/mail/console-mailer.js";
import { createMailer } from "../../src/mail/create-mailer.js";
import { MailerError } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";
import { ResendMailer } from "../../src/mail/resend-mailer.js";

const mail = { to: "ash@example.com", subject: "s", text: "t", html: "<p>t</p>" };

describe("createMailer", () => {
  it("elige la versión según MAIL_PROVIDER", () => {
    expect(createMailer({ MAIL_PROVIDER: "memory" })).toBeInstanceOf(MemoryMailer);
    expect(createMailer({ MAIL_PROVIDER: "console" })).toBeInstanceOf(ConsoleMailer);
    expect(createMailer({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "a@ejemplo.me" })).toBeInstanceOf(ResendMailer);
  });

  it("sin proveedor (producción con la verificación apagada) da un envío que falla con un error claro y nunca envía", async () => {
    const mailer = createMailer({});
    const error = await mailer.send(mail).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MailerError);
    expect((error as MailerError).message).toBe("El envío de correo no está configurado");
  });

  it("Resend sin clave o sin remitente es un error de programación: la configuración ya lo impide", () => {
    expect(() => createMailer({ MAIL_PROVIDER: "resend", MAIL_FROM: "a@ejemplo.me" })).toThrow(/RESEND_API_KEY/);
    expect(() => createMailer({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x" })).toThrow(/MAIL_FROM/);
  });

  it("pasa el fetch y el registro que se le den (para las pruebas)", async () => {
    let called = false;
    const fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof globalThis.fetch;
    await createMailer({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "a@ejemplo.me" }, { fetch }).send(mail);
    expect(called).toBe(true);

    const lines: string[] = [];
    await createMailer({ MAIL_PROVIDER: "console" }, { log: (line) => lines.push(line) }).send(mail);
    expect(lines).toHaveLength(1);
  });
});
