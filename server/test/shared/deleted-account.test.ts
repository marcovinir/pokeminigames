import { DELETED_USERNAME_PREFIX, deletedUsernameFor, isDeletedUsername } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";

describe("nombre de relleno de las cuentas borradas", () => {
  it("es el prefijo y los 12 primeros caracteres hexadecimales del id, y es un nombre válido", () => {
    const name = deletedUsernameFor("3f2a9c1e-77b4-4d1a-9e2f-0123456789ab");
    expect(DELETED_USERNAME_PREFIX).toBe("borrada_");
    expect(name).toBe("borrada_3f2a9c1e77b4");
    expect(name).toMatch(/^[A-Za-z0-9_]{3,30}$/);
  });

  it("reconoce el prefijo sin distinguir mayúsculas", () => {
    expect(isDeletedUsername("borrada_abc")).toBe(true);
    expect(isDeletedUsername("Borrada_ABC")).toBe(true);
    expect(isDeletedUsername("ash")).toBe(false);
    expect(isDeletedUsername("borradaX")).toBe(false);
  });
});
