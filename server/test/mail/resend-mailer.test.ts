import { describe, expect, it } from "vitest";
import { MailerError } from "../../src/mail/mailer.js";
import { ResendMailer } from "../../src/mail/resend-mailer.js";

const mail = { to: "ash@example.com", subject: "Tu código", text: "texto", html: "<p>html</p>" };
const FROM = "Pokémon Minigames <no-responder@ejemplo.me>";

interface Call {
  url: string;
  init: RequestInit;
}

/** Un `fetch` falso que responde (o falla) con lo que se le dé y apunta cada llamada. */
function fakeFetch(outcome: Response | Error) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (outcome instanceof Error) throw outcome;
    return outcome.clone();
  }) as typeof fetch;
  return { fn, calls };
}

async function failureOf(promise: Promise<unknown>): Promise<MailerError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MailerError);
  return error as MailerError;
}

describe("ResendMailer", () => {
  it("envía un POST a la API de Resend con la clave, el remitente, el destinatario y el contenido", async () => {
    const { fn, calls } = fakeFetch(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    const mailer = new ResendMailer({ apiKey: "re_clave_secreta", from: FROM, fetch: fn });
    await mailer.send(mail);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: "Bearer re_clave_secreta", "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ from: FROM, to: ["ash@example.com"], subject: "Tu código", text: "texto", html: "<p>html</p>" });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("una respuesta que no es 2xx lanza un MailerError con el estado y el nombre del error, sin la dirección ni el mensaje del proveedor", async () => {
    const body = { name: "validation_error", message: "La dirección ash@example.com no es válida", statusCode: 422 };
    const { fn } = fakeFetch(new Response(JSON.stringify(body), { status: 422 }));
    const error = await failureOf(new ResendMailer({ apiKey: "re_x", from: FROM, fetch: fn }).send(mail));
    expect(error.status).toBe(422);
    expect(error.message).toContain("422");
    expect(error.message).toContain("validation_error");
    expect(error.message).not.toContain("ash@example.com");
  });

  it("si el cuerpo del error no es JSON, el mensaje lleva solo el estado", async () => {
    const { fn } = fakeFetch(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const error = await failureOf(new ResendMailer({ apiKey: "re_x", from: FROM, fetch: fn }).send(mail));
    expect(error.status).toBe(502);
    expect(error.message).toBe("Resend respondió 502");
  });

  it("agotar la cuota (429) y una clave rechazada (403) son errores con su estado", async () => {
    for (const status of [429, 403]) {
      const { fn } = fakeFetch(new Response(JSON.stringify({ name: "rate_limit_exceeded" }), { status }));
      const error = await failureOf(new ResendMailer({ apiKey: "re_x", from: FROM, fetch: fn }).send(mail));
      expect(error.status).toBe(status);
    }
  });

  it("un fallo de red lanza un MailerError sin estado", async () => {
    const { fn } = fakeFetch(new TypeError("fetch failed"));
    const error = await failureOf(new ResendMailer({ apiKey: "re_x", from: FROM, fetch: fn }).send(mail));
    expect(error.status).toBeNull();
    expect(error.message).toBe("No se pudo conectar con Resend");
  });

  it("si Resend no responde a tiempo, lo dice (y de verdad se corta al pasar el tiempo máximo)", async () => {
    const hanging = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      })) as typeof fetch;
    const started = Date.now();
    const error = await failureOf(new ResendMailer({ apiKey: "re_x", from: FROM, fetch: hanging, timeoutMs: 30 }).send(mail));
    expect(error.status).toBeNull();
    expect(error.message).toBe("Resend no respondió a tiempo");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("espera como máximo 8 segundos si no se dice otra cosa", async () => {
    const seen: AbortSignal[] = [];
    const spy = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(init!.signal!);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await new ResendMailer({ apiKey: "re_x", from: FROM, fetch: spy }).send(mail);
    expect(seen[0]!.aborted).toBe(false);
  });

  it("la clave de la API no aparece en ningún mensaje de error", async () => {
    for (const outcome of [new Response("{}", { status: 401 }), new TypeError("fetch failed")]) {
      const { fn } = fakeFetch(outcome);
      const error = await failureOf(new ResendMailer({ apiKey: "re_clave_secreta", from: FROM, fetch: fn }).send(mail));
      expect(error.message).not.toContain("re_clave_secreta");
    }
  });
});
