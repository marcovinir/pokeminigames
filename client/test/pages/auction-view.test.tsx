import type { AuctionLotView, AuctionStateView } from "@pokemon-minigames/shared";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SERVER_NOW, event } from "../helpers/events";
import { ash, misty, renderRoom, serverSends } from "../helpers/room";
import { fakeServices } from "../helpers/services";

const lotView = (over: Partial<AuctionLotView> = {}): AuctionLotView => ({
  number: 3,
  silhouetteUrl: "/silhouettes/tok",
  scene: "bosque",
  price: 150_000,
  currentBid: 200_000,
  leader: 2,
  turn: 1,
  turnId: 77,
  bids: [
    { seat: 1, amount: 150_000 },
    { seat: 2, amount: 200_000 },
  ],
  retired: null,
  warningUntil: null,
  rivalIdle: false,
  auto: false,
  myLimit: 800_000,
  ...over,
});

const auction = (lot: AuctionLotView, over: Partial<AuctionStateView> = {}): AuctionStateView => ({
  money: { 1: 1_900_000, 2: 1_750_000 },
  teamSizes: { 1: 1, 2: 0 },
  purchases: { 1: ["/silhouettes/comprada"], 2: [] },
  lot,
  reveal: [],
  ...over,
});

const state = (lot: AuctionLotView, over: Partial<AuctionStateView> = {}) =>
  event.roomState({ phase: "auction", config: { game: "subasta", traps: true }, players: [ash(), misty()], auction: auction(lot, over) });

beforeEach(() => {
  // Ya vio la explicación: las pruebas de abajo miran la puja.
  localStorage.setItem("pokeminigames:subasta-ayuda", "vista");
  vi.spyOn(Date, "now").mockReturnValue(SERVER_NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("la pantalla de puja", () => {
  it("muestra la silueta sobre su fondo, el lote, la puja y el dinero de los dos", () => {
    const { container } = renderRoom([state(lotView({ scene: "volcan" }))]);
    expect(screen.getByRole("img", { name: "Silueta de un Pokémon" })).toHaveAttribute("src", "/silhouettes/tok");
    expect(container.querySelector("[data-scene]")).toHaveAttribute("src", "/auction/lote-volcan.png");
    expect(screen.getByText("Lote 3 de 12")).toBeInTheDocument();
    expect(screen.getByTestId("current-bid")).toHaveTextContent("₽ 200.000");
    expect(screen.getByText("Va ganando misty")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "ash" })).toHaveTextContent("₽ 1.900.000");
    expect(screen.getByRole("group", { name: "misty" })).toHaveTextContent("₽ 1.750.000");
  });

  it("la franja dice a quién le toca", () => {
    const { unmount } = renderRoom([state(lotView())]);
    expect(screen.getByRole("heading", { name: "¡Te toca pujar!" })).toBeInTheDocument();
    unmount();
    renderRoom([state(lotView({ turn: 2 }))]);
    expect(screen.getByRole("heading", { name: "Le toca a misty" })).toBeInTheDocument();
  });

  it("los paneles muestran 6 huecos, con las siluetas compradas", () => {
    renderRoom([state(lotView())]);
    const mine = within(screen.getByRole("group", { name: "ash" }));
    expect(mine.getByText("1 de 6")).toBeInTheDocument();
    expect(mine.getByRole("img", { name: "Silueta comprada" })).toHaveAttribute("src", "/silhouettes/comprada");
    expect(screen.getByRole("group", { name: "ash" }).querySelectorAll("[data-slot]")).toHaveLength(6);
  });

  it("el historial lista las pujas del lote, la última primero", () => {
    renderRoom([state(lotView())]);
    const rows = within(screen.getByRole("list", { name: "Pujas de este lote" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("misty");
    expect(rows[0]).toHaveTextContent("₽ 200.000");
    expect(rows[1]).toHaveTextContent("ash");
  });

  it("no hay reloj a la vista", () => {
    renderRoom([state(lotView())]);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByText(/¿Sigues ahí\?/)).toBeNull();
  });

  it("en mi turno, los botones dicen el salto y a cuánto queda, y envían el turno", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state(lotView())], services);
    await user.click(screen.getByRole("button", { name: /\+10\.000.*queda en ₽ 210\.000/ }));
    expect(services.game.client.bid).toHaveBeenCalledWith(10_000, 77);
  });

  it("retirarse dice qué ocurre, con y sin puja", async () => {
    const services = fakeServices();
    const { user, unmount } = renderRoom([state(lotView())], services);
    const button = screen.getByRole("button", { name: /Retirarme.*misty se lo lleva/ });
    await user.click(button);
    expect(services.game.client.pass).toHaveBeenCalledWith(77);
    unmount();
    renderRoom([state(lotView({ currentBid: null, leader: null, bids: [] }))]);
    expect(screen.getByRole("button", { name: /Retirarme.*misty decide si lo abre/ })).toBeInTheDocument();
  });

  it("sin puja, se abre al precio inicial", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state(lotView({ currentBid: null, leader: null, bids: [] }))], services);
    await user.click(screen.getByRole("button", { name: /Abrir en ₽ 150\.000/ }));
    expect(services.game.client.bid).toHaveBeenCalledWith(null, 77);
  });

  it("si el rival se retiró, abrir es llevárselo, y se explica", () => {
    renderRoom([state(lotView({ currentBid: null, leader: null, bids: [], retired: 2 }))]);
    expect(screen.getByText("misty se retiró. Si abres, es tuyo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir en ₽ 150\.000/ })).toBeInTheDocument();
  });

  it("en el turno del rival no hay botones, y se explica qué pasa", () => {
    renderRoom([state(lotView({ turn: 2, leader: 1 }))]);
    expect(screen.queryByRole("button", { name: /Retirarme/ })).toBeNull();
    expect(screen.getByText("Si misty se retira, es tuyo. Si sube, volverá a tocarte a ti.")).toBeInTheDocument();
  });

  it("quien no llega a nada lo sabe y puede retirarse", () => {
    renderRoom([state(lotView({ myLimit: 100_000 }))]);
    expect(screen.getByText("No te alcanza: solo puedes retirarte.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+10\.000/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Retirarme/ })).toBeEnabled();
  });

  it("se desactiva solo lo que no alcanza", () => {
    renderRoom([state(lotView({ myLimit: 260_000 }))]);
    expect(screen.getByRole("button", { name: /\+50\.000/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /\+100\.000/ })).toBeDisabled();
    expect(screen.queryByText("No te alcanza: solo puedes retirarte.")).toBeNull();
  });

  it("tras decidir, los botones se bloquean hasta el turno siguiente", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state(lotView())], services);
    await user.click(screen.getByRole("button", { name: /Retirarme/ }));
    expect(screen.getByRole("button", { name: /Retirarme/ })).toBeDisabled();
    serverSends(services, state(lotView({ turnId: 78, number: 4 })));
    expect(screen.getByRole("button", { name: /Retirarme/ })).toBeEnabled();
  });

  it("si la conexión se cortó tras decidir, al volver se puede decidir otra vez", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state(lotView())], services);
    services.game.store.getState().setConnection("connected");
    await user.click(screen.getByRole("button", { name: /Retirarme/ }));
    expect(screen.getByRole("button", { name: /Retirarme/ })).toBeDisabled();
    act(() => services.game.store.getState().setConnection("disconnected"));
    act(() => services.game.store.getState().setConnection("connected"));
    expect(screen.getByRole("button", { name: /Retirarme/ })).toBeEnabled();
  });

  it("si la silueta no carga, se avisa y se puede seguir; la del lote siguiente sí sale", () => {
    const services = fakeServices();
    renderRoom([state(lotView())], services);
    fireEvent.error(screen.getByRole("img", { name: "Silueta de un Pokémon" }));
    expect(screen.queryByRole("img", { name: "Silueta de un Pokémon" })).toBeNull();
    expect(screen.getByRole("button", { name: /Retirarme/ })).toBeEnabled();
    serverSends(services, state(lotView({ number: 4, silhouetteUrl: "/silhouettes/otra", turnId: 78 })));
    expect(screen.getByRole("img", { name: "Silueta de un Pokémon" })).toHaveAttribute("src", "/silhouettes/otra");
  });

  it("en un lote que se reparte solo no dice «Te toca», y uno gratis se anuncia así", () => {
    const services = fakeServices();
    renderRoom([state(lotView({ auto: true, turn: 1, currentBid: null, leader: null, bids: [], myLimit: 0 }))], services);
    const log = screen.getByRole("log", { name: "Anuncios de la partida" });
    expect(log).not.toHaveTextContent("Te toca");
    serverSends(services, { name: "auction-sale", payload: { lot: 2, winner: 1, paid: 0 } });
    expect(log).toHaveTextContent("Lote 2: ash se lo lleva gratis");
  });

  it("en el móvil también se explica el tope cuando bloquea algo", () => {
    renderRoom([state(lotView({ myLimit: 100_000 }))]);
    expect(screen.getByText("No te alcanza: solo puedes retirarte.").textContent).toBeTruthy();
    expect(screen.getByText(/Tu tope es ₽ 100\.000/)).toBeInTheDocument();
  });

  it("anuncia cada turno y cómo se cerró el lote, también a la vista", () => {
    const services = fakeServices();
    renderRoom([state(lotView())], services);
    const log = screen.getByRole("log", { name: "Anuncios de la partida" });
    expect(log).toHaveTextContent("Lote 3 de 12. Puja actual: ₽ 200.000. Te toca.");
    serverSends(services, state(lotView({ turn: 2, turnId: 78, currentBid: 300_000 })));
    expect(log).toHaveTextContent("Le toca a misty.");
    serverSends(services, { name: "auction-sale", payload: { lot: 2, winner: 2, paid: 210_000 } });
    expect(log).toHaveTextContent("Lote 2: misty se lo lleva por ₽ 210.000");
    expect(screen.getByText("Lote 2: misty se lo lleva por ₽ 210.000")).toBeVisible();
  });

  it("si el foco se perdió, vuelve a los botones cuando me toca", () => {
    const services = fakeServices();
    renderRoom([state(lotView({ turn: 2 }))], services);
    (document.activeElement as HTMLElement | null)?.blur();
    serverSends(services, state(lotView({ turnId: 78 })));
    expect((document.activeElement as HTMLElement).textContent).toMatch(/\+10\.000/);
  });

  it("pulsar cuando el turno ya cambió no muestra un error alarmante", () => {
    const services = fakeServices();
    renderRoom([state(lotView({ turn: 2 }))], services);
    serverSends(services, { name: "error", payload: { code: "NOT_YOUR_TURN", message: "Aún no es tu turno" } });
    expect(screen.queryByText(/turno/i, { selector: "[role=alert], [role=status]" })).toBeNull();
  });
});

describe("el aviso de inactividad", () => {
  it("a quien tiene el turno le pide responder, con su cuenta atrás", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state(lotView({ warningUntil: SERVER_NOW + 15_000 }))], services);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("¿Sigues ahí?");
    // La cuenta atrás va fuera del aviso: si no, el lector de pantalla lo repetiría cada segundo.
    expect(alert).not.toHaveTextContent("15 s");
    expect(screen.getByText("15 s")).toHaveAttribute("aria-hidden", "true");
    await user.click(screen.getByRole("button", { name: "Sigo aquí" }));
    expect(services.game.client.stillHere).toHaveBeenCalledWith(77);
  });

  it("al responder, el foco no se pierde", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state(lotView({ warningUntil: SERVER_NOW + 15_000 }))], services);
    await user.click(screen.getByRole("button", { name: "Sigo aquí" }));
    serverSends(services, state(lotView()));
    expect((document.activeElement as HTMLElement).textContent).toMatch(/\+10\.000/);
  });

  it("al rival le dice que está esperando", () => {
    renderRoom([state(lotView({ turn: 2, rivalIdle: true }))]);
    expect(screen.getByText("Esperando a misty…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sigo aquí" })).toBeNull();
  });
});

describe("un lote que se reparte solo", () => {
  it("se ve con su silueta, dice para quién es y no tiene botones", () => {
    renderRoom([state(lotView({ auto: true, turn: 2, currentBid: null, leader: null, bids: [], myLimit: 0 }))]);
    expect(screen.getByRole("img", { name: "Silueta de un Pokémon" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Este va para misty" })).toBeInTheDocument();
    expect(screen.queryByText(/Puedes pujar hasta/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Retirarme/ })).toBeNull();
  });
});

describe("la explicación de la primera vez", () => {
  beforeEach(() => localStorage.clear());

  it("sale la primera vez, se cierra y no vuelve, pero se puede reabrir", async () => {
    const { user, unmount } = renderRoom([state(lotView())]);
    const help = screen.getByRole("region", { name: "Cómo se puja" });
    expect(help).toHaveTextContent("No hay prisa");
    await user.click(within(help).getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("region", { name: "Cómo se puja" })).toBeNull();
    unmount();
    const again = renderRoom([state(lotView())]);
    expect(screen.queryByRole("region", { name: "Cómo se puja" })).toBeNull();
    await again.user.click(screen.getByRole("button", { name: "Cómo se puja" }));
    expect(screen.getByRole("region", { name: "Cómo se puja" })).toBeInTheDocument();
  });

  it("no bloquea los botones", () => {
    renderRoom([state(lotView())]);
    expect(screen.getByRole("button", { name: /Retirarme/ })).toBeEnabled();
  });

  it("funciona aunque el navegador no deje guardar", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const { user } = renderRoom([state(lotView())]);
    await user.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("region", { name: "Cómo se puja" })).toBeNull();
  });
});
