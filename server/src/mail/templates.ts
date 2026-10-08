import { CODE_LENGTH, CODE_TTL_MINUTES } from "../auth/code-policy.js";
import type { Mail } from "./mailer.js";

/** Escapa lo que cambia el significado del HTML. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Nada ajeno entra en un correo: el código son exactamente seis dígitos o no se escribe. */
function assertCode(code: string): void {
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) throw new RangeError("El código debe tener seis dígitos");
}

/** HTML mínimo con estilos en línea: sin imágenes ni enlaces (nada que rastrear y mejor entrega). */
function page(intro: string, code: string, outro: string): string {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#14263f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="420" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:12px;padding:24px">
<tr><td>
<p style="margin:0 0 12px;font-size:16px">${escapeHtml(intro)}</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:bold;letter-spacing:8px;font-family:'Courier New',Courier,monospace">${escapeHtml(code)}</p>
<p style="margin:0;font-size:14px;color:#40536e">${escapeHtml(outro)}</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

const EXPIRES = `Caduca en ${CODE_TTL_MINUTES} minutos. Si no lo pediste, ignora este mensaje.`;

/** El código para verificar el correo de una cuenta nueva. No lleva el nombre de usuario ni ningún otro dato. */
export function verificationMail(to: string, code: string): Mail {
  assertCode(code);
  return {
    to,
    subject: "Tu código de Pokémon Minigames",
    text: `Tu código de verificación es ${code}.\n${EXPIRES}`,
    html: page("Tu código de verificación es:", code, EXPIRES),
  };
}

/** El código para cambiar la contraseña. Aclara que, si no se pidió, la contraseña no cambia. */
export function passwordResetMail(to: string, code: string): Mail {
  assertCode(code);
  const outro = `Caduca en ${CODE_TTL_MINUTES} minutos. Si no lo pediste, ignora este mensaje: tu contraseña no cambia.`;
  return {
    to,
    subject: "Código para cambiar tu contraseña de Pokémon Minigames",
    text: `Tu código para cambiar la contraseña es ${code}.\n${outro}`,
    html: page("Tu código para cambiar la contraseña es:", code, outro),
  };
}
