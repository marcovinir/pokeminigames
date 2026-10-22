import type { ServerEvent } from "@pokemon-minigames/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomPage } from "../../src/pages/room/RoomPage";
import { SERVER_NOW, event, pokemon } from "../helpers/events";
import { type FakeServices, fakeServices, renderRoute } from "../helpers/services";

const ash = (extra: object = {}) => ({ seat: 1 as const, username: "ash", connected: true, totalStats: 0, teamSize: 0, ...extra });
const misty = (extra: object = {}) => ({ seat: 2 as const, username: "misty", connected: true, totalStats: 0, teamSize: 0, ...extra });
const roundState = (overrides: object = {}) => ({
  number: 1,
  pair: ["flying", "fire"] as ["flying", "fire"],
  deadline: SERVER_NOW + 15_000,
  answered: false,
  typeChosen: false,
  ...overrides,
});

function renderRoom(events: ServerEvent[] = [], services: FakeServices = fakeServices()) {
  for (const e of events) services.game.store.getState().receive(e, SERVER_NOW);
  const utils = renderRoute("/sala/:code", <RoomPage />, { services, route: "/sala/ABC234" });
  return { user: userEvent.setup(), ...utils };
}

/** Recibir un evento del servidor con la pantalla ya abierta. */
const serverSends = (services: FakeServices, e: ServerEvent) => act(() => services.game.store.getState().receive(e, SERVER_NOW));

afterEach(() => vi.useRealTimers());

describe("ciclo de vida de la sala", () => {
  it("al entrar se une a la sala de la URL y carga la lista de nombres", async () => {
    const { services } = renderRoom();
    expect(services.client.join).toHaveBeenCalledExactlyOnceWith("ABC234");
    await waitFor(() => expect(services.endpoints.catalog.names).toHaveBeenCalledTimes(1));
  });

  it("al salir de la pantalla cierra la conexión", () => {
    const { services, unmount } = renderRoom();
    expect(services.client.dispose).not.toHaveBeenCalled();
    unmount();
    expect(services.client.dispose).toHaveBeenCalledTimes(1);
  });

  it("mientras no llega el estado del servidor dice que está conectando", () => {
    renderRoom();
    expect(screen.getByRole("status")).toHaveTextContent("Conectando con la sala…");
  });
});

describe("sala de espera", () => {
  const alone = () => event.roomState({ phase: "waiting", players: [ash()] });

  it("muestra el código, quién está dentro y que espera al oponente", () => {
    renderRoom([alone()]);
    expect(screen.getByRole("heading", { name: "Sala de espera" })).toBeInTheDocument();
    expect(screen.getByLabelText("Código de la sala")).toHaveTextContent("ABC234");
    expect(screen.getByRole("list", { name: "Jugadores" })).toHaveTextContent("ash");
    expect(screen.getByText("Esperando a tu oponente…")).toBeInTheDocument();
  });

  it("cuando el oponente ya se unió lo dice", () => {
    renderRoom([event.roomState({ phase: "waiting", players: [ash(), misty({ connected: false })] })]);
    expect(screen.getByText("Tu oponente ya se unió. Esperando a que se conecte…")).toBeInTheDocument();
    expect(screen.getByText("(sin conectar)")).toBeInTheDocument();
  });

  it("copiar el código lo pone en el portapapeles y lo confirma", async () => {
    const { user } = renderRoom([alone()]);
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: "Copiar código" }));
    expect(writeText).toHaveBeenCalledWith("ABC234");
    expect(await screen.findByRole("button", { name: "Código copiado" })).toBeInTheDocument();
  });

  it("si el navegador no deja copiar, lo avisa sin romper nada", async () => {
    const { user } = renderRoom([alone()]);
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("denegado"));
    await user.click(screen.getByRole("button", { name: "Copiar código" }));
    expect(await screen.findByRole("button", { name: "No se pudo copiar" })).toBeInTheDocument();
  });

  it("cancelar la sala avisa al servidor y vuelve al lobby", async () => {
    const { services, user } = renderRoom([alone()]);
    await user.click(screen.getByRole("button", { name: "Cancelar sala" }));
    expect(services.client.leave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("si ya hay oponente el botón dice 'Salir de la sala'", () => {
    renderRoom([event.roomState({ phase: "waiting", players: [ash(), misty()] })]);
    expect(screen.getByRole("button", { name: "Salir de la sala" })).toBeInTheDocument();
  });
});

describe("cuenta atrás de inicio", () => {
  it("muestra contra quién se juega y un cronómetro hasta el inicio", () => {
    renderRoom([event.roomState({ phase: "starting", startsAt: SERVER_NOW + 5000 })]);
    expect(screen.getByRole("heading", { name: "Partida contra misty" })).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Inicio de la partida" })).toBeInTheDocument();
  });

  it("el cronómetro cuenta los segundos que faltan según el reloj del servidor", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW + 2000); // el navegador va 2 s por delante de lo que dijo el servidor...
    const services = fakeServices();
    services.game.store.getState().receive(event.roomState({ phase: "starting", startsAt: SERVER_NOW + 5000 }), SERVER_NOW + 2000);
    renderRoute("/sala/:code", <RoomPage />, { services, route: "/sala/ABC234" });
    // ...así que el desfase se corrige y faltan 5 s, no 3.
    expect(screen.getByRole("timer")).toHaveTextContent("5");
  });
});

describe("elección de tipo (modo elegido)", () => {
  const choosing = (extra: object = {}) =>
    event.roomState({ phase: "choosing_types", config: { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null }, round: roundState({ pair: null, ...extra }) });

  it("muestra los 18 tipos en español", () => {
    renderRoom([choosing()]);
    const group = screen.getByRole("group", { name: "Tipos" });
    expect(within(group).getAllByRole("button")).toHaveLength(18);
    for (const label of ["fuego", "agua", "planta", "hada", "siniestro", "psíquico"]) {
      expect(within(group).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("al tocar un tipo lo envía y lo deja marcado; al confirmarlo el servidor, bloquea los demás", async () => {
    const { services, user } = renderRoom([choosing()]);
    await user.click(screen.getByRole("button", { name: "fuego" }));
    expect(services.client.chooseType).toHaveBeenCalledExactlyOnceWith("fire");
    expect(screen.getByRole("button", { name: "fuego" })).toHaveAttribute("aria-pressed", "true");

    serverSends(services, event.typeReceived(1));
    expect(screen.getByRole("status")).toHaveTextContent("Elegiste fuego. Esperando a tu oponente…");
    for (const button of within(screen.getByRole("group", { name: "Tipos" })).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("tocar otro tipo antes de la confirmación no envía una segunda elección (el servidor se quedaría con la primera)", async () => {
    const { services, user } = renderRoom([choosing()]);
    await user.click(screen.getByRole("button", { name: "fuego" }));
    await user.click(screen.getByRole("button", { name: "agua" }));
    expect(services.client.chooseType).toHaveBeenCalledExactlyOnceWith("fire");
    expect(screen.getByRole("button", { name: "agua" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "fuego" })).toHaveAttribute("aria-pressed", "true");
  });

  it("si el servidor rechaza la elección, se puede elegir otro tipo", async () => {
    const { services, user } = renderRoom([choosing()]);
    await user.click(screen.getByRole("button", { name: "fuego" }));
    serverSends(services, event.error("RATE_LIMITED"));
    expect(screen.getByRole("button", { name: "agua" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "agua" }));
    expect(services.client.chooseType).toHaveBeenLastCalledWith("water");
    expect(services.client.chooseType).toHaveBeenCalledTimes(2);
  });

  it("tras recargar (ya había elegido) no sabe cuál fue, pero bloquea y lo dice", () => {
    renderRoom([choosing({ typeChosen: true })]);
    expect(screen.getByRole("status")).toHaveTextContent("Ya elegiste tu tipo. Esperando a tu oponente…");
    expect(screen.getByRole("button", { name: "fuego" })).toBeDisabled();
  });
});

describe("ronda", () => {
  const playing = (extra: object = {}, stateExtra: object = {}) =>
    event.roomState({
      phase: "round_active",
      myTeam: [pokemon(1, 500)],
      players: [ash({ totalStats: 500, teamSize: 1 }), misty({ totalStats: 400, teamSize: 1 })],
      round: roundState({ number: 2, ...extra }),
      ...stateExtra,
    });

  it("muestra la ronda, el par de tipos, tu equipo y del rival solo el total", () => {
    renderRoom([playing()]);
    expect(screen.getByRole("heading", { name: "Ronda 2 de 3" })).toBeInTheDocument();
    const pair = screen.getByLabelText("Par de tipos");
    expect(pair).toHaveTextContent("volador");
    expect(pair).toHaveTextContent("fuego");
    expect(screen.getByRole("region", { name: "Tu equipo" })).toHaveTextContent("Poke1");
    const rival = screen.getByRole("region", { name: "Tu rival" });
    expect(rival).toHaveTextContent("misty");
    expect(rival).toHaveTextContent("400");
    expect(rival).toHaveTextContent("1 Pokémon");
    expect(rival).not.toHaveTextContent("Mon"); // ni nombres ni nada que identifique sus Pokémon
  });

  it("en una partida por meta de stats muestra la meta en vez del total de rondas", () => {
    renderRoom([playing({}, { config: { typeMode: "random", lengthMode: "custom", roundsLimit: null, statsGoal: 2500 } })]);
    expect(screen.getByRole("heading", { name: "Ronda 2 · meta de 2500 puntos" })).toBeInTheDocument();
  });

  it("la barra de marcador para pantallas estrechas muestra los dos totales", () => {
    renderRoom([playing()]);
    expect(screen.getByLabelText("Marcador")).toHaveTextContent("Tú 500 · misty 400");
  });

  it("escribir sugiere nombres y Enter envía la respuesta al servidor", async () => {
    const { services, user } = renderRoom([playing()]);
    await waitFor(() => expect(services.names.getState().status).toBe("ready"));
    await user.type(screen.getByRole("combobox"), "alf");
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    await user.keyboard("{Escape}{Enter}");
    expect(services.client.submit).toHaveBeenCalledExactlyOnceWith("alf");
  });

  it("al empezar la ronda el campo de respuesta recibe el foco (quien usa teclado tiene solo 15 s)", () => {
    renderRoom([playing()]);
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("una respuesta ya enviada bloquea el campo hasta el resultado", async () => {
    const { services } = renderRoom([playing()]);
    expect(screen.getByRole("combobox")).toBeEnabled();
    serverSends(services, event.answerReceived(2));
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByText("Respuesta enviada. Esperando el resultado…")).toBeInTheDocument();
  });

  it("si el par fue reemplazado por el servidor, lo explica", () => {
    const services = fakeServices();
    renderRoom([event.roomState({ phase: "choosing_types", round: roundState({ pair: null }) }), event.roundStarted(1, SERVER_NOW + 15_000, { typesNotice: "pair_replaced" })], services);
    expect(screen.getByText("El par elegido no tenía suficientes Pokémon; el servidor sorteó otro.")).toBeInTheDocument();
  });

  it("sin aviso de par reemplazado no muestra nada de eso", () => {
    renderRoom([playing()]);
    expect(screen.queryByText(/sorteó otro/)).not.toBeInTheDocument();
  });

  it("el cronómetro muestra el tiempo de la ronda", () => {
    renderRoom([playing()]);
    expect(screen.getByRole("timer", { name: "Tiempo de la ronda" })).toBeInTheDocument();
  });

  describe("abandonar la partida", () => {
    it("pide confirmación antes de abandonar", async () => {
      const { services, user } = renderRoom([playing()]);
      await user.click(screen.getByRole("button", { name: "Abandonar partida" }));
      expect(services.client.leave).not.toHaveBeenCalled();
      expect(screen.getByText("Si abandonas, pierdes la partida.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Sí, abandonar" }));
      expect(services.client.leave).toHaveBeenCalledTimes(1);
    });

    it("se puede cambiar de idea", async () => {
      const { services, user } = renderRoom([playing()]);
      await user.click(screen.getByRole("button", { name: "Abandonar partida" }));
      await user.click(screen.getByRole("button", { name: "Seguir jugando" }));
      expect(screen.getByRole("button", { name: "Abandonar partida" })).toBeInTheDocument();
      expect(services.client.leave).not.toHaveBeenCalled();
    });
  });
});

describe("resultado de la ronda", () => {
  const afterRound = (mySeat: 1 | 2 = 1, result = event.roundResult()) => [
    event.roomState({ phase: "round_result", mySeat, roundsPlayed: 1, players: [ash(), misty()] }),
    result,
  ];

  it("muestra qué pasó con cada jugador y qué Pokémon ganó", () => {
    renderRoom(afterRound());
    expect(screen.getByRole("heading", { name: "Resultado de la ronda 1" })).toBeInTheDocument();
    const mine = screen.getByRole("region", { name: "Resultado de Tú" });
    expect(mine).toHaveTextContent("Acertó");
    expect(mine).toHaveTextContent("Poke1");
    const theirs = screen.getByRole("region", { name: "Resultado de misty" });
    expect(theirs).toHaveTextContent("Ese Pokémon no existe");
    expect(theirs).toHaveTextContent("Escribió: «zzz»");
  });

  it("desde el asiento 2, 'Tú' es el asiento 2", () => {
    renderRoom(afterRound(2));
    expect(screen.getByRole("region", { name: "Resultado de Tú" })).toHaveTextContent("Ese Pokémon no existe");
    expect(screen.getByRole("region", { name: "Resultado de ash" })).toHaveTextContent("Acertó");
  });

  it("cuenta atrás hasta la siguiente ronda con el reloj del servidor", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW);
    renderRoom(afterRound());
    expect(screen.getByText("Siguiente ronda en 6 s")).toBeInTheDocument();
  });

  it("si era la última ronda dice que calcula el resultado final", () => {
    renderRoom(afterRound(1, event.roundResult({ nextRoundAt: null })));
    expect(screen.getByText("Calculando el resultado final…")).toBeInTheDocument();
  });

  it("un resumen para lectores de pantalla anuncia el resultado sin depender de lo visual", () => {
    renderRoom(afterRound());
    const status = screen.getAllByRole("status").find((s) => s.className.includes("sr-only"))!;
    expect(status).toHaveTextContent("Ronda 1. Tú: Acertó, Poke1. misty: Ese Pokémon no existe.");
  });

  it("si se reconectó en la pausa y no hay resultado guardado, no se rompe", () => {
    renderRoom([event.roomState({ phase: "round_result", roundsPlayed: 1 })]);
    expect(screen.getByRole("status")).toHaveTextContent("Resultado de la ronda…");
  });
});

describe("resumen final", () => {
  const finished = (mySeat: 1 | 2, winnerSeat: 1 | 2 | null, reason: "completed" | "forfeit" | "disconnect" = "completed") => [
    event.roomState({ phase: "finished", mySeat, players: [ash(), misty()], config: { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 1800 } }),
    event.gameEnded({ winnerSeat, reason }),
  ];

  it("si ganaste lo dice, con el motivo, el marcador y los dos equipos completos", () => {
    renderRoom(finished(1, 1));
    expect(screen.getByRole("heading", { name: "Ganaste" })).toBeInTheDocument();
    expect(screen.getByText("La partida terminó")).toBeInTheDocument();
    expect(screen.getByText("800 – 400")).toBeInTheDocument();
    const mine = screen.getByRole("region", { name: "Equipo de Tú" });
    expect(within(mine).getByText("Poke1")).toBeInTheDocument();
    expect(within(mine).getByText("Poke2")).toBeInTheDocument();
    expect(within(mine).getAllByText("Velocidad").length).toBeGreaterThan(0); // con las stats
    expect(within(screen.getByRole("region", { name: "Equipo de misty" })).getByText("Poke3")).toBeInTheDocument();
  });

  it("si perdiste lo dice, y desde el asiento 2 el marcador se lee desde tu lado", () => {
    renderRoom(finished(2, 1));
    expect(screen.getByRole("heading", { name: "Perdiste" })).toBeInTheDocument();
    expect(screen.getByText("400 – 800")).toBeInTheDocument();
  });

  it("un empate no tiene ganador", () => {
    renderRoom(finished(1, null));
    expect(screen.getByRole("heading", { name: "Empate" })).toBeInTheDocument();
  });

  it("explica cuando el rival abandonó o se desconectó", () => {
    const { unmount } = renderRoom(finished(1, 1, "forfeit"));
    expect(screen.getByText("Un jugador abandonó la partida")).toBeInTheDocument();
    unmount();
    renderRoom(finished(1, 1, "disconnect"));
    expect(screen.getByText("Un jugador se desconectó")).toBeInTheDocument();
  });

  it("ya no ofrece «Jugar de nuevo»: lo sustituye la revancha (que aparece solo si el servidor abre la oferta)", () => {
    renderRoom(finished(1, 1));
    expect(screen.queryByRole("button", { name: "Jugar de nuevo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revancha" })).toBeNull();
  });

  it("'Ver perfil de' lleva al perfil del rival", async () => {
    const { user } = renderRoom(finished(1, 1));
    await user.click(screen.getByRole("button", { name: "Ver perfil de misty" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/jugador/misty");
  });

  it("'Volver al lobby' vuelve sin configuración previa", async () => {
    const { user } = renderRoom(finished(1, 1));
    await user.click(screen.getByRole("button", { name: "Volver al lobby" }));
    expect(screen.getByTestId("location").dataset.state).toBe("null");
  });

  it("anuncia el resultado final a los lectores de pantalla", () => {
    renderRoom(finished(1, 1));
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent("Ganaste. 800 – 400");
  });

  it("si la conexión vuelve a caerse y el servidor ya cerró la sala, el resumen se queda en pantalla", () => {
    const services = fakeServices();
    renderRoom(finished(1, 1), services);
    serverSends(services, event.error("ROOM_NOT_FOUND", "Esa sala no existe"));
    expect(screen.getByRole("heading", { name: "Ganaste" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/ya terminó/)).not.toBeInTheDocument();
  });

  it("no muestra el aviso de conexión perdida una vez terminada la partida", () => {
    const services = fakeServices();
    renderRoom(finished(1, 1), services);
    serverSends(services, event.roomState({ phase: "finished" })); // room-state no pisa el fin si se reconecta... el aviso depende de la conexión
    act(() => services.game.store.getState().setConnection("disconnected"));
    expect(screen.queryByText(/Reconectando/)).not.toBeInTheDocument();
  });
});

describe("anuncios para lectores de pantalla", () => {
  const announcer = () => screen.getByRole("log", { name: "Anuncios de la partida" });

  it("anuncia el par de tipos al empezar cada ronda", () => {
    renderRoom([event.roomState({ phase: "round_active", round: roundState({ number: 2 }), players: [ash(), misty()] })]);
    expect(announcer()).toHaveTextContent("Ronda 2: volador y fuego.");
  });

  it("anuncia que hay que elegir un tipo", () => {
    renderRoom([
      event.roomState({ phase: "choosing_types", config: { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null }, round: roundState({ pair: null }) }),
    ]);
    expect(announcer()).toHaveTextContent("Ronda 1: elige un tipo.");
  });

  it("anuncia el cambio de una fase a otra sin que el contenedor se vuelva a crear", () => {
    const services = fakeServices();
    renderRoom([event.roomState({ phase: "starting", startsAt: SERVER_NOW + 5000, players: [ash(), misty()] })], services);
    const region = announcer();
    expect(region).toHaveTextContent("La partida empieza.");
    serverSends(services, event.roundStarted(1, SERVER_NOW + 15_000));
    expect(announcer()).toBe(region);
    expect(region).toHaveTextContent("Ronda 1: volador y fuego.");
  });
});

describe("avisos de conexión y errores", () => {
  const inRound = () => event.roomState({ phase: "round_active", round: roundState(), players: [ash(), misty()] });

  it("si se pierde la conexión avisa de que está reconectando, y el aviso se va al volver", () => {
    const services = fakeServices();
    renderRoom([inRound()], services);
    expect(screen.queryByText(/Reconectando/)).not.toBeInTheDocument();
    act(() => services.game.store.getState().setConnection("disconnected"));
    expect(screen.getByText("Conexión perdida. Reconectando…")).toBeInTheDocument();
    act(() => services.game.store.getState().setConnection("connected"));
    expect(screen.queryByText(/Reconectando/)).not.toBeInTheDocument();
  });

  it("si la partida se abrió en otra pestaña, lo dice y permite volver a jugar aquí", async () => {
    const services = fakeServices();
    const { user } = renderRoom([inRound()], services);
    act(() => services.game.store.getState().setConnection("replaced"));
    expect(screen.getByText("Abriste esta partida en otra pestaña.")).toBeInTheDocument();
    expect(screen.queryByText(/Reconectando/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Jugar aquí" }));
    expect(services.client.join).toHaveBeenCalledTimes(2);
    expect(services.client.join).toHaveBeenLastCalledWith("ABC234");
  });

  it("la cuenta atrás del aviso del rival no se anuncia cada segundo a los lectores de pantalla", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW);
    renderRoom([inRound(), event.opponentDisconnected(SERVER_NOW + 30_000)]);
    expect(screen.getByText("misty se desconectó.")).toBeInTheDocument();
    expect(screen.getByText(/Tiene 30 s para volver/)).toHaveAttribute("aria-hidden", "true");
  });

  it("si el rival se cae muestra cuánto tiempo tiene para volver, y el aviso se va cuando vuelve", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW);
    const services = fakeServices();
    renderRoom([inRound(), event.opponentDisconnected(SERVER_NOW + 30_000)], services);
    expect(screen.getByRole("alert")).toHaveTextContent("misty se desconectó. Tiene 30 s para volver.");

    serverSends(services, event.opponentReconnected());
    expect(screen.queryByText(/se desconectó/)).not.toBeInTheDocument();
  });

  it("un error recuperable (p. ej. ir demasiado rápido) se muestra sin sacar al jugador de la partida", () => {
    const services = fakeServices();
    renderRoom([inRound(), event.error("RATE_LIMITED")], services);
    expect(screen.getByRole("alert")).toHaveTextContent("Vas muy rápido. Espera un momento.");
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it.each([
    ["ROOM_NOT_FOUND", "Esa sala no existe o ya terminó."],
    ["NOT_IN_ROOM", "No participas en esa sala."],
    ["ROOM_CLOSED", "Esa sala ya empezó o se cerró."],
  ] as const)("con %s la sala ya no sirve: lo explica y ofrece volver al lobby", async (code, message) => {
    const { services, user } = renderRoom();
    serverSends(services, event.error(code));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText("Conectando con la sala…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Volver al lobby" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });
});

describe("pistas de tipos en la sala (etapa 8)", () => {
  const withConfig = (typeHints?: boolean) =>
    event.roomState({
      phase: "round_active",
      config: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null, ...(typeHints === undefined ? {} : { typeHints }) },
      myTeam: [pokemon(1, 500)],
      players: [ash({ totalStats: 500, teamSize: 1 }), misty({ totalStats: 400, teamSize: 1 })],
      round: roundState({ number: 2 }),
    });

  it("en una sala con pistas pide la lista con tipos", async () => {
    const { services } = renderRoom([withConfig(true)]);
    await waitFor(() => expect(services.endpoints.catalog.names).toHaveBeenCalledWith({ withTypes: true }));
  });

  it("en una sala sin pistas (o de un servidor anterior, sin el campo) nunca pide los tipos", async () => {
    for (const hints of [false, undefined]) {
      const { services, unmount } = renderRoom([withConfig(hints)]);
      await waitFor(() => expect(services.names.getState().status).toBe("ready"));
      expect(services.endpoints.catalog.names).not.toHaveBeenCalledWith({ withTypes: true });
      unmount();
    }
  });

  it("con pistas, las sugerencias muestran los tipos de cada Pokémon", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.names).mockImplementation(async (options) =>
      options?.withTypes
        ? [{ id: 3, es: "Beto", en: "Beta", types: ["grass", "poison"] as ("grass" | "poison")[] }]
        : [{ id: 3, es: "Beto", en: "Beta" }],
    );
    const { user } = renderRoom([withConfig(true)], services);
    await waitFor(() => expect(services.names.getState().withTypes).toBe(true));
    await user.type(screen.getByRole("combobox"), "bet");
    const [option] = await screen.findAllByRole("option");
    expect([...option!.querySelectorAll("[data-type]")].map((chip) => chip.getAttribute("data-type"))).toEqual(["grass", "poison"]);
  });
});
