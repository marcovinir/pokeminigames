import { describe, expect, it } from "vitest";
import config from "../../vite.config";

describe("proxy de desarrollo", () => {
  const proxy = (config.server?.proxy ?? {}) as Record<string, unknown>;

  it.each(["/auth", "/rooms", "/pokemon", "/stats", "/users", "/socket.io"])(
    "reenvía %s al servidor del juego (con la API en el mismo origen la cookie de sesión funciona)",
    (prefix) => {
      expect(Object.keys(proxy)).toContain(prefix);
    },
  );

  it("las pantallas del cliente no se reenvían al servidor", () => {
    for (const route of ["/perfil", "/jugador", "/sala", "/login", "/registro"]) {
      expect(Object.keys(proxy)).not.toContain(route);
    }
  });

  it("el WebSocket de Socket.io va con ws activado", () => {
    expect(proxy["/socket.io"]).toMatchObject({ ws: true });
  });
});
