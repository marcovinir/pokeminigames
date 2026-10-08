import { describe, expect, it } from "vitest";
import { escapeHtml, passwordResetMail, verificationMail } from "../../src/mail/templates.js";

describe("el correo de verificación", () => {
  const mail = verificationMail("ash@example.com", "048213");

  it("va a la dirección dada y su asunto no lleva datos personales", () => {
    expect(mail.to).toBe("ash@example.com");
    expect(mail.subject).toBe("Tu código de Pokémon Minigames");
  });

  it("el texto lleva solo el código, cuánto dura y qué hacer si no se pidió", () => {
    expect(mail.text).toBe("Tu código de verificación es 048213.\nCaduca en 10 minutos. Si no lo pediste, ignora este mensaje.");
  });

  it("el HTML lleva el mismo código y las mismas frases, sin enlaces, imágenes ni direcciones web", () => {
    expect(mail.html).toContain("048213");
    expect(mail.html).toContain("Caduca en 10 minutos. Si no lo pediste, ignora este mensaje.");
    expect(mail.html).not.toMatch(/href|<img|https?:|<script/i);
    expect(mail.html).toMatch(/^<!doctype html>/i);
    expect(mail.html).toContain('lang="es"');
  });

  it("no lleva el nombre de usuario ni la dirección en el contenido", () => {
    expect(mail.text).not.toContain("ash");
    expect(mail.html).not.toContain("ash@example.com");
  });
});

describe("el correo para cambiar la contraseña", () => {
  const mail = passwordResetMail("ash@example.com", "999000");

  it("tiene su propio asunto y su propio texto, que aclara que la contraseña no cambia si no se pidió", () => {
    expect(mail.subject).toBe("Código para cambiar tu contraseña de Pokémon Minigames");
    expect(mail.text).toBe(
      "Tu código para cambiar la contraseña es 999000.\nCaduca en 10 minutos. Si no lo pediste, ignora este mensaje: tu contraseña no cambia.",
    );
  });

  it("el HTML repite el código y no lleva enlaces", () => {
    expect(mail.html).toContain("999000");
    expect(mail.html).not.toMatch(/href|<img|https?:|<script/i);
  });
});

describe("el código que se escribe en el correo", () => {
  it("tiene que ser de seis dígitos: cualquier otra cosa se rechaza (nada ajeno entra en el correo)", () => {
    for (const bad of ["12345", "1234567", "12a456", "<b>123", "12 456", ""]) {
      expect(() => verificationMail("a@b.co", bad), bad).toThrow(RangeError);
      expect(() => passwordResetMail("a@b.co", bad), bad).toThrow(RangeError);
    }
  });
});

describe("escapeHtml", () => {
  it("escapa los caracteres que cambian el significado del HTML", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
    expect(escapeHtml("sin nada raro")).toBe("sin nada raro");
  });
});
