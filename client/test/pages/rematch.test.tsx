import type { RematchClosedReason, RematchRecord } from "@pokemon-minigames/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { factText } from "../../src/i18n/facts";
import { SERVER_NOW, event } from "../helpers/events";
import { ash, misty, renderRoom, serverSends } from "../helpers/room";
import { FACTS, fakeServices } from "../helpers/services";

afterEach(() => vi.useRealTimers());

const finished = (players: object[] = [ash(), misty()], extra: object = {}) =>
  event.roomState({ phase: "finished", mySeat: 1, players: players as never, ...extra });

const record = (mine: number, theirs: number, extra: Partial<RematchRecord> = {}): RematchRecord => ({
  mine,
  theirs,
  draws: 0,
  played: mine + theirs,
  recent: [],
  ...extra,
});

/** El resumen de una partida ya terminada con la oferta en ese estado. */
function summary(offer: Parameters<typeof event.rematchState>[0], players: object[] = [ash(), misty()]) {
  return [finished(players), event.gameEnded({ winnerSeat: 1 }), event.rematchState(offer)];
}

describe("el bloque de revancha del resumen", () => {
  it("sin oferta el resumen solo ofrece «Volver al lobby» (ya no hay «Jugar de nuevo»)", () => {
    renderRoom([finished(), event.gameEnded({ winnerSeat: 1 })]);
    expect(screen.queryByRole("button", { name: "Revancha" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Jugar de nuevo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Volver al lobby" })).toBeInTheDocument();
  });

  it("con open aparece «Revancha» y al pulsarla se emite la petición", async () => {
    const { user, services } = renderRoom(summary({ status: "open" }));
    await user.click(screen.getByRole("button", { name: "Revancha" }));
    expect(services.client.requestRematch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Volver al lobby" })).toBeInTheDocument();
  });

  it("mine: «Esperando a misty…», cuenta atrás, «Cancelar», récord grande y dato curioso", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW);
    const { services } = renderRoom(summary({ status: "mine", deadline: SERVER_NOW + 43_000, record: record(3, 2, { played: 5, recent: ["won", "lost", "won", "drawn", "won"] }) }));
    expect(screen.getByRole("heading", { name: "Esperando a misty…" })).toBeInTheDocument();
    expect(screen.getByText("Le quedan 43 s para decidir")).toBeInTheDocument();
    expect(screen.getByText("Le quedan 43 s para decidir")).toHaveAttribute("aria-hidden", "true");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("Le quedan 42 s para decidir")).toBeInTheDocument();

    const cancel = screen.getByRole("button", { name: "Cancelar" });
    cancel.click();
    expect(services.client.cancelRematch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Aceptar" })).toBeNull();
    expect(screen.getByRole("region", { name: "Récord contra misty" })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector("[data-fact]")).not.toBeNull());
  });

  it("theirs: el plazo se dice a quien decide («Te quedan…»), no como si decidiera el rival", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW);
    renderRoom(summary({ status: "theirs", deadline: SERVER_NOW + 43_000 }));
    expect(screen.getByText("Te quedan 43 s para decidir")).toBeInTheDocument();
    expect(screen.queryByText(/Le quedan/)).toBeNull();
  });

  it("su primera partida juntos terminó en empate: se ve «Empate», no «0 – 0»", () => {
    renderRoom(summary({ status: "mine", deadline: SERVER_NOW + 60_000, record: { mine: 0, theirs: 0, draws: 1, played: 1, recent: ["drawn"] } }));
    const card = screen.getByRole("region", { name: "Récord contra misty" });
    expect(within(card).getByText("Empate", { selector: "p" })).toBeInTheDocument();
    expect(within(card).queryByText("0 – 0")).toBeNull();
    expect(within(card).getByText("Es su primera partida juntos")).toBeInTheDocument();
  });

  it("si el foco está en otro control, una petición del rival no lo mueve", async () => {
    const { services } = renderRoom(summary({ status: "open" }));
    const lobby = screen.getByRole("button", { name: "Volver al lobby" });
    lobby.focus();
    await serverSends(services, event.rematchState({ status: "theirs", deadline: SERVER_NOW + 60_000 }));
    expect(lobby).toHaveFocus();
  });

  it("si el botón con el foco desaparece, el foco no se pierde: va al aviso de cierre o al título de «¡Revancha!»", async () => {
    const declined = renderRoom(summary({ status: "mine", deadline: SERVER_NOW + 60_000 }));
    screen.getByRole("button", { name: "Cancelar" }).focus();
    await serverSends(declined.services, event.rematchState({ status: "closed", closedReason: "declined", deadline: null }));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveTextContent("misty ya no quiere la revancha.");
    declined.unmount();

    const accepted = renderRoom(summary({ status: "theirs", deadline: SERVER_NOW + 60_000 }));
    await accepted.user.click(within(accepted.container).getByRole("button", { name: "Aceptar" }));
    await serverSends(accepted.services, event.rematchState({ status: "starting", deadline: null }));
    expect(within(accepted.container).getByRole("heading", { name: "¡Revancha!" })).toHaveFocus();
  });

  it("theirs: «misty quiere la revancha» con «Aceptar» y «Rechazar»", async () => {
    const { user, services } = renderRoom(summary({ status: "theirs", deadline: SERVER_NOW + 60_000 }));
    expect(screen.getByRole("heading", { name: "misty quiere la revancha" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aceptar" }));
    await user.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(services.client.requestRematch).toHaveBeenCalledTimes(1);
    expect(services.client.cancelRematch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
  });

  it("el récord muestra «3 – 2», las últimas 5 como G/P/E y «vas ganando»; con played 1 «Es su primera partida juntos»; sin récord solo la espera y el dato", () => {
    const { unmount } = renderRoom(summary({ status: "mine", deadline: SERVER_NOW + 60_000, record: record(3, 2, { recent: ["won", "lost", "won", "drawn", "won"] }) }));
    const card = screen.getByRole("region", { name: "Récord contra misty" });
    expect(within(card).getByText("Tú contra misty")).toBeInTheDocument();
    expect(within(card).getByText("3 – 2")).toBeInTheDocument();
    expect(within(card).getByText("5 partidas jugadas · vas ganando")).toBeInTheDocument();
    const chips = within(within(card).getByRole("list", { name: "Últimas partidas" })).getAllByRole("listitem");
    expect(chips.map((chip) => chip.querySelector("[aria-hidden]")!.textContent)).toEqual(["G", "P", "G", "E", "G"]);
    unmount();

    const first = renderRoom(summary({ status: "mine", deadline: SERVER_NOW + 60_000, record: record(1, 0, { recent: ["won"] }) }));
    expect(screen.getByText("1 – 0")).toBeInTheDocument();
    expect(screen.getByText("Es su primera partida juntos")).toBeInTheDocument();
    first.unmount();

    renderRoom(summary({ status: "mine", deadline: SERVER_NOW + 60_000 }));
    expect(screen.queryByRole("region", { name: /Récord contra/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Esperando a misty…" })).toBeInTheDocument();
  });

  it.each<[RematchClosedReason, string | null]>([
    ["declined", "misty ya no quiere la revancha."],
    ["left", "misty se fue."],
    ["timeout", "Se acabó el tiempo."],
    ["unavailable", "La revancha ya no está disponible."],
    ["failed", "No se pudo crear la sala."],
    ["self", null],
  ])("cerrada por %s: muestra su aviso exacto y solo «Volver al lobby»", (reason, message) => {
    renderRoom(summary({ status: "closed", deadline: null, closedReason: reason }));
    if (message) expect(screen.getByRole("status")).toHaveTextContent(message);
    else expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: /Revancha|Cancelar|Aceptar|Rechazar/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Volver al lobby" })).toBeInTheDocument();
  });

  it("«Volver al lobby» emite leave-room antes de navegar", async () => {
    const { user, services } = renderRoom(summary({ status: "open" }));
    await user.click(screen.getByRole("button", { name: "Volver al lobby" }));
    expect(services.client.leave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("la etiqueta «Invitado» acompaña al nombre del invitado en el bloque y los botones conservan su nombre", () => {
    renderRoom(summary({ status: "theirs", deadline: SERVER_NOW + 60_000 }, [ash(), misty({ guest: true })]));
    const heading = screen.getByRole("heading", { name: /misty quiere la revancha/ });
    expect(within(heading.closest("section")!).getByText("Invitado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceptar" })).toBeInTheDocument();
  });

  it("el cambio de estado de la oferta se anuncia en el registro de la revancha y lleva el foco al título del bloque", async () => {
    const { services } = renderRoom(summary({ status: "open" }));
    await serverSends(services, event.rematchState({ status: "theirs", deadline: SERVER_NOW + 60_000 }));
    expect(screen.getByRole("log", { name: "Anuncios de la revancha" })).toHaveTextContent("misty quiere la revancha");
    expect(screen.getByRole("heading", { name: "misty quiere la revancha" })).toHaveFocus();
    // El título no es un control (no está en el orden del tabulador): recibir el foco no le pinta el aro de los botones.
    expect(screen.getByRole("heading", { name: "misty quiere la revancha" }).className).toContain("outline-none");
  });
});

describe("dato curioso", () => {
  it("cambia cada 6 s sin repetir hasta agotarlos y no roba el foco", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW);
    const services = fakeServices();
    renderRoom(summary({ status: "mine", deadline: SERVER_NOW + 60_000 }), services);
    await waitFor(() => expect(document.querySelector("[data-fact]")).not.toBeNull());
    const all = FACTS.map(factText);
    const seen: string[] = [document.querySelector("[data-fact]")!.textContent!];
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    cancel.focus();
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      seen.push(document.querySelector("[data-fact]")!.textContent!);
    }
    expect(new Set(seen).size).toBe(3);
    expect([...seen].sort()).toEqual([...all].sort());
    expect(cancel).toHaveFocus();
    expect(services.endpoints.catalog.facts).toHaveBeenCalledTimes(1);
  });
});

describe("pantalla «¡Revancha!» y la sala nueva", () => {
  it("con starting se ve «¡Revancha!» con «✓ Tú, listo» y «misty entrando…», y no el resumen", () => {
    renderRoom(summary({ status: "starting", deadline: null }));
    expect(screen.getByRole("heading", { name: "¡Revancha!" })).toBeInTheDocument();
    expect(screen.getByText("Preparando la sala…")).toBeInTheDocument();
    expect(screen.getByText("✓ Tú, listo")).toBeInTheDocument();
    expect(screen.getByText("misty entrando…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ganaste" })).toBeNull();
  });

  it("rematch-room navega a /sala/NUEVA y entra a la sala nueva", async () => {
    const { services } = renderRoom(summary({ status: "starting", deadline: null }));
    await serverSends(services, event.rematchRoom("GAME02"));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/GAME02"));
    expect(services.client.join).toHaveBeenCalledWith("GAME02");
  });

  it("en la sala de revancha esperando se ve «¡Revancha!» (no la sala de espera con su código)", () => {
    renderRoom([event.roomState({ phase: "waiting", rematch: true, players: [ash(), misty({ connected: false })] })]);
    expect(screen.getByRole("heading", { name: "¡Revancha!" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Código de la sala")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Sala de espera" })).toBeNull();
    expect(screen.getByText("✓ Tú, listo")).toBeInTheDocument();
    expect(screen.getByText("misty entrando…")).toBeInTheDocument();
  });

  it("una sala normal en espera sigue siendo la sala de espera con su código", () => {
    renderRoom([event.roomState({ phase: "waiting", players: [ash()] })]);
    expect(screen.getByRole("heading", { name: "Sala de espera" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "¡Revancha!" })).toBeNull();
  });

  it("si la sala de revancha caduca sin que el rival entre: «misty no llegó.» y «Volver al lobby», sin veredicto", () => {
    renderRoom([finished([ash(), misty({ connected: false })], { rematch: true }), event.gameEnded({ winnerSeat: null, reason: "expired" })]);
    expect(screen.getByRole("status")).toHaveTextContent("misty no llegó.");
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent("misty no llegó.");
    expect(screen.getByRole("button", { name: "Volver al lobby" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Empate" })).toBeNull();
  });
});

describe("revancha: menores de la revisión final (#8)", () => {
  it("con una oferta viva, el resumen muestra «Conexión perdida» y «Jugar aquí»; sin oferta, no", async () => {
    const services = fakeServices();
    const { user } = renderRoom(summary({ status: "mine", deadline: SERVER_NOW + 60_000 }), services);
    act(() => services.game.store.getState().setConnection("disconnected"));
    expect(screen.getByText("Conexión perdida. Reconectando…")).toBeInTheDocument();
    act(() => services.game.store.getState().setConnection("replaced"));
    await user.click(screen.getByRole("button", { name: "Jugar aquí" }));
    expect(services.client.join).toHaveBeenCalledTimes(2);
  });

  it("con la oferta cerrada el resumen sigue sin avisos de conexión (la sala ya terminó)", () => {
    const services = fakeServices();
    renderRoom(summary({ status: "closed", deadline: null, closedReason: "timeout" }), services);
    act(() => services.game.store.getState().setConnection("disconnected"));
    expect(screen.queryByText(/Reconectando/)).toBeNull();
  });

  it("la pantalla «¡Revancha!» de la sala nueva tiene «Volver al lobby», que sale de la sala", async () => {
    const { user, services } = renderRoom([event.roomState({ phase: "waiting", rematch: true, players: [ash(), misty({ connected: false })] })]);
    await user.click(screen.getByRole("button", { name: "Volver al lobby" }));
    expect(services.client.leave).toHaveBeenCalledTimes(1);
  });

  it("ya no hay ficha «✓ misty, listo»: el rival sale «entrando…» hasta que empieza la cuenta atrás", () => {
    renderRoom([event.roomState({ phase: "waiting", rematch: true, players: [ash(), misty({ connected: true })] })]);
    expect(screen.queryByText(/misty, listo/)).toBeNull();
    expect(screen.getByText("misty entrando…")).toBeInTheDocument();
  });

  it("la etiqueta «Invitado» acompaña a «entrando…», a «no llegó.» y al aviso de cierre", () => {
    const guest = misty({ guest: true, connected: false });
    const loading = renderRoom([event.roomState({ phase: "waiting", rematch: true, players: [ash(), guest] })]);
    expect(within(screen.getByText("misty entrando…").closest("li")!).getByText("Invitado")).toBeInTheDocument();
    loading.unmount();

    const noShow = renderRoom([finished([ash(), guest], { rematch: true }), event.gameEnded({ winnerSeat: null, reason: "expired" })]);
    expect(within(screen.getByRole("status")).getByText("Invitado")).toBeInTheDocument();
    noShow.unmount();

    renderRoom(summary({ status: "closed", deadline: null, closedReason: "left" }, [ash(), guest]));
    expect(within(screen.getByRole("status")).getByText("Invitado")).toBeInTheDocument();
  });

  it("los cambios de la oferta se anuncian en su propio registro: el de la partida no repite el veredicto", async () => {
    const { services } = renderRoom(summary({ status: "open" }));
    const game = screen.getByRole("log", { name: "Anuncios de la partida" });
    expect(game).toHaveTextContent("Ganaste. ");
    await serverSends(services, event.rematchState({ status: "theirs", deadline: SERVER_NOW + 60_000 }));
    expect(screen.getByRole("log", { name: "Anuncios de la revancha" })).toHaveTextContent("misty quiere la revancha");
    expect(game).not.toHaveTextContent("revancha");
  });

  it("las fichas del récord se leen por su texto oculto, no por aria-label en el <li>", () => {
    renderRoom(summary({ status: "mine", deadline: SERVER_NOW + 60_000, record: record(1, 0, { recent: ["won"] }) }));
    const chip = within(screen.getByRole("list", { name: "Últimas partidas" })).getByRole("listitem");
    expect(chip).not.toHaveAttribute("aria-label");
    expect(within(chip).getByText("Ganada")).toHaveClass("sr-only");
    expect(within(chip).getByText("G")).toHaveAttribute("aria-hidden", "true");
  });

  it("«Ver perfil de misty» se esconde mientras la oferta espera respuesta (navegar cerraría la conexión)", () => {
    for (const status of ["mine", "theirs"] as const) {
      const view = renderRoom(summary({ status, deadline: SERVER_NOW + 60_000 }));
      expect(screen.queryByRole("button", { name: "Ver perfil de misty" })).toBeNull();
      view.unmount();
    }
    renderRoom(summary({ status: "open" }));
    expect(screen.getByRole("button", { name: "Ver perfil de misty" })).toBeInTheDocument();
  });
});
