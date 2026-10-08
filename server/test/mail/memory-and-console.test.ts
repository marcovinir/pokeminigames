import { describe, expect, it } from "vitest";
import { ConsoleMailer } from "../../src/mail/console-mailer.js";
import { MailerError } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";

const mail = { to: "Ash@Example.com", subject: "Tu código", text: "Tu código es 123456.", html: "<p>123456</p>" };

describe("MemoryMailer", () => {
  it("guarda cada mensaje enviado, en orden", async () => {
    const mailer = new MemoryMailer();
    await mailer.send(mail);
    await mailer.send({ ...mail, subject: "Otro" });
    expect(mailer.sent.map((sent) => sent.subject)).toEqual(["Tu código", "Otro"]);
  });

  it("busca por destinatario sin distinguir mayúsculas", async () => {
    const mailer = new MemoryMailer();
    await mailer.send(mail);
    await mailer.send({ ...mail, to: "misty@example.com" });
    expect(mailer.to("ash@example.com")).toHaveLength(1);
    expect(mailer.to("MISTY@example.com")).toHaveLength(1);
    expect(mailer.to("brock@example.com")).toEqual([]);
  });

  it("guarda una copia: cambiar el original después no altera lo enviado", async () => {
    const mailer = new MemoryMailer();
    const original = { ...mail };
    await mailer.send(original);
    original.text = "otra cosa";
    expect(mailer.sent[0]!.text).toBe("Tu código es 123456.");
  });

  it("puede fallar a propósito (para probar qué pasa cuando el proveedor cae) y volver a funcionar", async () => {
    const mailer = new MemoryMailer();
    mailer.failWith = new MailerError(503, "Resend respondió 503");
    await expect(mailer.send(mail)).rejects.toThrow("Resend respondió 503");
    expect(mailer.sent).toHaveLength(0);
    mailer.failWith = null;
    await mailer.send(mail);
    expect(mailer.sent).toHaveLength(1);
  });

  it("clear vacía el buzón", async () => {
    const mailer = new MemoryMailer();
    await mailer.send(mail);
    mailer.clear();
    expect(mailer.sent).toEqual([]);
  });
});

describe("ConsoleMailer", () => {
  it("imprime el destinatario, el asunto y el texto (para probar el flujo en el PC sin Resend)", async () => {
    const lines: string[] = [];
    await new ConsoleMailer((line) => lines.push(line)).send(mail);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[correo simulado]");
    expect(lines[0]).toContain("Ash@Example.com");
    expect(lines[0]).toContain("Tu código");
    expect(lines[0]).toContain("123456");
  });
});
