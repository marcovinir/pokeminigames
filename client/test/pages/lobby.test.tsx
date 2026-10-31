import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import * as durations from "../../src/game/durations";
import { LobbyPage } from "../../src/pages/Lobby";
import { DEFAULT_FORM, buildRequest } from "../../src/pages/room-form";
import * as serverConstants from "../../../server/src/game/constants";
import * as auctionRules from "../../../server/src/game/auction/rules";
import { fakeServices, renderRoute, ASH, GUEST, signIn } from "../helpers/services";

describe("límites y duraciones del cliente", () => {
  it("coinciden con los del servidor", () => {
    expect(durations.ROUND_MS).toBe(serverConstants.ROUND_SECONDS * 1000);
    expect(durations.AUCTION_WARNING_MS).toBe(auctionRules.INACTIVITY_WARNING_MS);
    expect(durations.AUCTION_REVEAL_MS).toBe(auctionRules.REVEAL_MS);
    expect(durations.BATTLE_LINEUP_MS).toBe(auctionRules.LINEUP_MS);
    expect(durations.BATTLE_MOVE_MS).toBe(auctionRules.MOVE_MS);
    expect(durations.BATTLE_PAUSE_MS).toBe(auctionRules.PAUSE_MS);
    expect(durations.TYPE_CHOICE_MS).toBe(serverConstants.TYPE_CHOICE_SECONDS * 1000);
    expect(durations.START_COUNTDOWN_MS).toBe(serverConstants.START_COUNTDOWN_SECONDS * 1000);
    expect(durations.RESULT_PAUSE_MS).toBe(serverConstants.RESULT_PAUSE_SECONDS * 1000);
    expect(durations.REMATCH_RESPONSE_MS).toBe(serverConstants.REMATCH_RESPONSE_MS);
    expect(durations.CUSTOM_ROUNDS_MIN).toBe(serverConstants.CUSTOM_ROUNDS_MIN);
    expect(durations.CUSTOM_ROUNDS_MAX).toBe(serverConstants.CUSTOM_ROUNDS_MAX);
    expect(durations.CUSTOM_STATS_GOAL_MIN).toBe(serverConstants.CUSTOM_STATS_GOAL_MIN);
    expect(durations.CUSTOM_STATS_GOAL_MAX).toBe(serverConstants.CUSTOM_STATS_GOAL_MAX);
  });
});

describe("buildRequest", () => {
  it("rondas fijas de 3 y de 5", () => {
    expect(buildRequest({ ...DEFAULT_FORM, lengthKind: "fixed-3" })).toEqual({
      ok: true,
      request: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 },
    });
    expect(buildRequest({ ...DEFAULT_FORM, typeMode: "chosen", lengthKind: "fixed-5" })).toEqual({
      ok: true,
      request: { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 5 },
    });
  });

  it("personalizada por rondas y por meta de stats", () => {
    expect(buildRequest({ ...DEFAULT_FORM, lengthKind: "custom-rounds", customRounds: "12" })).toEqual({
      ok: true,
      request: { typeMode: "random", lengthMode: "custom", roundsLimit: 12 },
    });
    expect(buildRequest({ ...DEFAULT_FORM, lengthKind: "custom-stats", statsGoal: "3000" })).toEqual({
      ok: true,
      request: { typeMode: "random", lengthMode: "custom", statsGoal: 3000 },
    });
  });

  it.each([
    ["rondas 0", { lengthKind: "custom-rounds", customRounds: "0" }, "customRounds"],
    ["rondas 21", { lengthKind: "custom-rounds", customRounds: "21" }, "customRounds"],
    ["rondas decimales", { lengthKind: "custom-rounds", customRounds: "2.5" }, "customRounds"],
    ["rondas con texto", { lengthKind: "custom-rounds", customRounds: "diez" }, "customRounds"],
    ["rondas vacías", { lengthKind: "custom-rounds", customRounds: "" }, "customRounds"],
    ["meta 499", { lengthKind: "custom-stats", statsGoal: "499" }, "statsGoal"],
    ["meta 5001", { lengthKind: "custom-stats", statsGoal: "5001" }, "statsGoal"],
    ["meta negativa", { lengthKind: "custom-stats", statsGoal: "-600" }, "statsGoal"],
  ] as const)("rechaza %s", (_name, override, field) => {
    const built = buildRequest({ ...DEFAULT_FORM, ...override });
    expect(built).toMatchObject({ ok: false, field });
  });

  it("acepta los extremos de los rangos", () => {
    for (const customRounds of ["1", "20"]) expect(buildRequest({ ...DEFAULT_FORM, lengthKind: "custom-rounds", customRounds }).ok).toBe(true);
    for (const statsGoal of ["500", "5000"]) expect(buildRequest({ ...DEFAULT_FORM, lengthKind: "custom-stats", statsGoal }).ok).toBe(true);
  });
});

function renderLobby(options: { state?: unknown; services?: ReturnType<typeof fakeServices> } = {}) {
  const services = options.services ?? fakeServices();
  const utils = renderRoute("/", <LobbyPage />, {
    services,
    route: options.state ? { pathname: "/", state: options.state } : "/",
  });
  return { user: userEvent.setup(), ...utils };
}

describe("lobby: crear sala", () => {
  it("por defecto crea una sala aleatoria de 3 rondas y entra a ella", async () => {
    const { services, user } = renderLobby();
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
    expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 });
  });

  it("permite elegir el modo de tipos y el largo de la partida", async () => {
    const { services, user } = renderLobby();
    await user.click(screen.getByRole("radio", { name: /Elegido/ }));
    await user.selectOptions(screen.getByLabelText("Largo de la partida"), "5 rondas");
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await waitFor(() => expect(services.endpoints.rooms.create).toHaveBeenCalled());
    expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 5 });
  });

  it("explica cada modo de tipos", () => {
    renderLobby();
    expect(screen.getByText("El servidor sortea el par de tipos de cada ronda.")).toBeInTheDocument();
    expect(screen.getByText("Cada jugador elige un tipo y juntos forman el par.")).toBeInTheDocument();
  });

  it("la personalizada por rondas pide el máximo y lo valida antes de enviar", async () => {
    const { services, user } = renderLobby();
    await user.selectOptions(screen.getByLabelText("Largo de la partida"), "Personalizada: máximo de rondas");
    const field = screen.getByLabelText("Máximo de rondas");
    await user.clear(field);
    await user.type(field, "25");
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(screen.getByRole("alert")).toHaveTextContent("El máximo de rondas va de 1 a 20.");
    expect(services.endpoints.rooms.create).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "12");
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await waitFor(() => expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ typeMode: "random", lengthMode: "custom", roundsLimit: 12 }));
  });

  it("la personalizada por meta de stats pide la meta y la valida", async () => {
    const { services, user } = renderLobby();
    await user.selectOptions(screen.getByLabelText("Largo de la partida"), "Personalizada: meta de stats");
    const field = screen.getByLabelText("Meta de stats");
    await user.clear(field);
    await user.type(field, "100");
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(screen.getByRole("alert")).toHaveTextContent("La meta de stats va de 500 a 5000.");
    expect(services.endpoints.rooms.create).not.toHaveBeenCalled();
  });

  it("cambiar de largo quita el error anterior", async () => {
    const { user } = renderLobby();
    await user.selectOptions(screen.getByLabelText("Largo de la partida"), "Personalizada: máximo de rondas");
    await user.clear(screen.getByLabelText("Máximo de rondas"));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Largo de la partida"), "3 rondas");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si el servidor rechaza la creación muestra el motivo y se puede reintentar", async () => {
    const { services, user } = renderLobby();
    vi.mocked(services.endpoints.rooms.create).mockRejectedValueOnce(new ApiError(409, "ALREADY_IN_GAME"));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya estás en una partida");
    expect(screen.getByRole("button", { name: "Crear sala" })).toBeEnabled();
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("no crea dos salas si se pulsa dos veces seguidas", async () => {
    const { services, user } = renderLobby();
    let release!: () => void;
    vi.mocked(services.endpoints.rooms.create).mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ code: "ABC234" }))));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(services.endpoints.rooms.create).toHaveBeenCalledTimes(1);
    release();
  });

  it("el formulario siempre parte de los valores por defecto (ya no hay «Jugar de nuevo» que le pase una configuración)", () => {
    renderLobby({ state: { config: { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 1800, typeHints: true } } });
    expect(screen.getByRole("radio", { name: /Elegido/ })).not.toBeChecked();
    expect(screen.getByLabelText("Largo de la partida")).toHaveValue(DEFAULT_FORM.lengthKind);
    expect(screen.getByRole("switch", { name: "Pistas de tipos" })).not.toBeChecked();
  });
});

describe("lobby: unirse a una sala", () => {
  it("normaliza el código (recorta y pasa a mayúsculas) y entra a la sala", async () => {
    const { services, user } = renderLobby();
    await user.type(screen.getByLabelText("Código de sala"), "  abc234 ");
    await user.click(screen.getByRole("button", { name: "Unirse" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
    expect(services.endpoints.rooms.join).toHaveBeenCalledWith("ABC234");
  });

  it("un código vacío no llama al servidor y se corrige al escribir", async () => {
    const { services, user } = renderLobby();
    await user.click(screen.getByRole("button", { name: "Unirse" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe el código de la sala.");
    expect(services.endpoints.rooms.join).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Código de sala"), "A");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["ROOM_NOT_FOUND", "Esa sala no existe o ya terminó."],
    ["ROOM_FULL", "Esa sala ya está llena."],
    ["ROOM_CLOSED", "Esa sala ya empezó o se cerró."],
    ["ALREADY_IN_GAME", "Ya estás en una partida"],
  ] as const)("si el servidor responde %s lo explica en español", async (code, message) => {
    const { services, user } = renderLobby();
    vi.mocked(services.endpoints.rooms.join).mockRejectedValueOnce(new ApiError(409, code));
    await user.type(screen.getByLabelText("Código de sala"), "ZZZZZZ");
    await user.click(screen.getByRole("button", { name: "Unirse" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });
});

describe("lobby: nombre repetido en la sala", () => {
  it.each([
    ["una cuenta", ASH, "Ya hay alguien con tu mismo nombre en esa sala: con esta cuenta no puedes unirte a ella."],
    ["un invitado", GUEST, "Ya hay alguien con ese nombre en la sala. Cierra sesión (arriba a la derecha) y entra como invitado con otro nombre."],
  ] as const)("NAME_IN_USE se explica según quién se une: %s", async (_who, who, message) => {
    const services = fakeServices();
    signIn(services, who);
    const { user } = renderLobby({ services });
    vi.mocked(services.endpoints.rooms.join).mockRejectedValueOnce(new ApiError(409, "NAME_IN_USE"));
    await user.type(screen.getByLabelText("Código de sala"), "ZZZZZZ");
    await user.click(screen.getByRole("button", { name: "Unirse" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});

describe("lobby: volver a tu partida", () => {
  it("si el servidor dice que tienes una sala activa, ofrece volver a ella", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.rooms.current).mockResolvedValueOnce({ code: "XYZ789", phase: "waiting" });
    const { user } = renderLobby({ services });
    expect(await screen.findByText("Tienes una partida en curso (sala XYZ789).")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Volver a tu partida" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/sala/XYZ789");
  });

  it("sin partida activa no muestra nada", async () => {
    const { services } = renderLobby();
    await waitFor(() => expect(services.endpoints.rooms.current).toHaveBeenCalled());
    expect(screen.queryByText(/Tienes una partida en curso/)).not.toBeInTheDocument();
  });

  it("si no se puede consultar, el lobby sigue funcionando", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.rooms.current).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    renderLobby({ services });
    await waitFor(() => expect(services.endpoints.rooms.current).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Crear sala" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("formulario con pistas de tipos (etapa 8)", () => {
  it("las pistas parten apagadas", () => {
    expect(DEFAULT_FORM.typeHints).toBe(false);
  });

  it("buildRequest manda typeHints solo cuando están encendidas", () => {
    expect(buildRequest({ ...DEFAULT_FORM, typeHints: true })).toEqual({
      ok: true,
      request: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, typeHints: true },
    });
    const off = buildRequest({ ...DEFAULT_FORM, typeHints: false });
    expect(off).toEqual({ ok: true, request: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 } });
  });

  it("las pistas viajan en cada largo de partida", () => {
    for (const lengthKind of ["fixed-3", "fixed-5", "custom-rounds", "custom-stats"] as const) {
      const built = buildRequest({ ...DEFAULT_FORM, lengthKind, typeHints: true });
      expect(built.ok && built.request.typeHints).toBe(true);
    }
  });
});

describe("lobby: pistas de tipos (etapa 8)", () => {
  it("hay un interruptor «Pistas de tipos», apagado, con su aclaración", () => {
    renderLobby();
    const toggle = screen.getByRole("switch", { name: "Pistas de tipos" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Muestra los tipos en las sugerencias; hace la ronda más fácil.")).toBeInTheDocument();
  });

  it("encendido, la sala se crea con las pistas", async () => {
    const { services, user } = renderLobby();
    await user.click(screen.getByRole("switch", { name: "Pistas de tipos" }));
    expect(screen.getByRole("switch", { name: "Pistas de tipos" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await waitFor(() => expect(services.endpoints.rooms.create).toHaveBeenCalled());
    expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, typeHints: true });
  });

  it("el interruptor se maneja con el teclado (Espacio)", async () => {
    const { user } = renderLobby();
    const toggle = screen.getByRole("switch", { name: "Pistas de tipos" });
    toggle.focus();
    await user.keyboard(" ");
    expect(toggle).toBeChecked();
    await user.keyboard(" ");
    expect(toggle).not.toBeChecked();
  });
});
