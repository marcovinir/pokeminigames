import { GAME_END_REASONS, type GameResult } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { RESULT_LABELS, describeConfig, errorMessage, historyReason } from "../../src/i18n/es";

const RESULTS: GameResult[] = ["won", "drawn", "lost"];

describe("textos del historial", () => {
  it("cada resultado tiene su palabra", () => {
    expect(RESULT_LABELS).toEqual({ won: "Ganaste", drawn: "Empate", lost: "Perdiste" });
  });

  it("todos los motivos de fin tienen un texto para cada resultado, y ninguno está vacío", () => {
    for (const reason of GAME_END_REASONS) {
      for (const result of RESULTS) {
        expect(historyReason(reason, result), `${reason}/${result}`).not.toBe("");
      }
    }
  });

  it("el motivo se cuenta desde el lado de quien mira", () => {
    expect(historyReason("forfeit", "won")).toBe("Tu rival abandonó");
    expect(historyReason("forfeit", "lost")).toBe("Abandonaste la partida");
    expect(historyReason("disconnect", "won")).toBe("Tu rival se desconectó");
    expect(historyReason("disconnect", "lost")).toBe("Te desconectaste");
    expect(historyReason("exhausted", "won")).toBe("Se agotaron los pares de tipos jugables");
  });

  it("una partida sin motivo guardado se muestra como una partida normal", () => {
    expect(historyReason(null, "won")).toBe(historyReason("completed", "won"));
    expect(historyReason("completed", "drawn")).toBe("La partida terminó");
  });

  it("describe la configuración de la partida", () => {
    const base = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null } as const;
    expect(describeConfig(base)).toBe("Tipos aleatorios · 3 rondas");
    expect(describeConfig({ ...base, typeMode: "chosen", lengthMode: "custom", roundsLimit: 7 })).toBe(
      "Tipos elegidos · hasta 7 rondas",
    );
    expect(describeConfig({ ...base, lengthMode: "custom", roundsLimit: null, statsGoal: 2500 })).toBe(
      "Tipos aleatorios · meta de 2500 puntos",
    );
  });

  it("concuerda en singular cuando el máximo es una sola ronda", () => {
    const base = { typeMode: "random", lengthMode: "custom", roundsLimit: 1, statsGoal: null } as const;
    expect(describeConfig(base)).toBe("Tipos aleatorios · hasta 1 ronda");
  });
});

describe("mensajes de error", () => {
  it("los errores del modo invitado tienen su mensaje en español", () => {
    expect(errorMessage("ACCOUNT_REQUIRED")).toBe("Necesitas una cuenta para esto.");
    expect(errorMessage("NAME_IN_USE")).toBe("Ya hay alguien con ese nombre en la sala. Entra con otro nombre.");
  });

  it("una petición de otro origen tiene su propio mensaje, no el genérico", () => {
    expect(errorMessage("FORBIDDEN")).toBe("Esa petición no está permitida desde este sitio.");
    expect(errorMessage("FORBIDDEN")).not.toBe(errorMessage("INTERNAL_ERROR"));
  });

  it("un jugador inexistente tiene su propio mensaje, no el genérico", () => {
    expect(errorMessage("USER_NOT_FOUND")).toBe("No encontramos a ese jugador.");
    expect(errorMessage("USER_NOT_FOUND")).not.toBe(errorMessage("INTERNAL_ERROR"));
  });
});
