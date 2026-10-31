import type { AuctionLotView, AuctionStateView } from "@pokemon-minigames/shared";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SERVER_NOW, event } from "../helpers/events";
import { ash, misty, renderRoom, serverSends } from "../helpers/room";
import { fakeServices } from "../helpers/services";

const lotView = (over: Partial<AuctionLotView> = {}): AuctionLotView => ({
  number: 3,
  kind: "pokemon",
  silhouetteUrl: "/silhouettes/tok",
  price: 150_000,
  currentBid: 200_000,
  leader: 2,
  turn: 1,
  deadline: SERVER_NOW + 10_000,
  turnId: 77,
  myLimit: 800_000,
  ...over,
});

const auction = (lot: AuctionLotView, over: Partial<AuctionStateView> = {}): AuctionStateView => ({
  money: { 1: 900_000, 2: 750_000 },
  teamSizes: { 1: 1, 2: 0 },
  items: { 1: [], 2: ["cinta"] },
  lot,
  reveal: [],
  ...over,
});

const state = (lot: AuctionLotView, over: Partial<AuctionStateView> = {}) =>
  event.roomState({ phase: "auction", config: { game: "subasta", traps: true }, players: [ash(), misty()], auction: auction(lot, over) });

describe("la pantalla de puja", () => {
  it("muestra la silueta, el lote, la puja y el dinero de los dos", () => {
    renderRoom([state(lotView())]);
    expect(screen.getByRole("img", { name: "Silueta de un Pokémon" })).toHaveAttribute("src", "/silhouettes/tok");
    expect(screen.getByText("Lote 3 de 9")).toBeInTheDocument();
    expect(screen.getByText("200.000")).toBeInTheDocument();
    const players = screen.getByRole("group", { name: "Jugadores" });
    expect(within(players).getByText("900.000")).toBeInTheDocument();
    expect(within(players).getByText("750.000")).toBeInTheDocument();
    expect(within(players).getByText("Cinta")).toBeInTheDocument();
  });

  it("un objeto se ve con su nombre y lo que hace, sin silueta", () => {
    renderRoom([state(lotView({ kind: "item", item: "revivir", silhouetteUrl: undefined }))]);
    expect(screen.queryByRole("img", { name: "Silueta de un Pokémon" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Revivir" })).toBeInTheDocument();
    expect(screen.getByText("Revive con el 50 % de los PS.")).toBeInTheDocument();
  });

  it("en mi turno puedo subir con la cantidad total, o pasar", async () => {
    const services = fakeServices();
    const { user, unmount } = renderRoom([state(lotView())], services);
    await user.click(screen.getByRole("button", { name: "Pujar 210.000" }));
    expect(services.game.client.bid).toHaveBeenCalledWith(10_000, 77);
    unmount();
    const again = fakeServices();
    const second = renderRoom([state(lotView())], again);
    await second.user.click(screen.getByRole("button", { name: "Pasar" }));
    expect(again.game.client.pass).toHaveBeenCalledWith(77);
  });

  it("sin puja, la opción es abrir al precio inicial", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state(lotView({ currentBid: null, leader: null }))], services);
    await user.click(screen.getByRole("button", { name: "Pujar 150.000" }));
    expect(services.game.client.bid).toHaveBeenCalledWith(null, 77);
  });

  it("en el turno del rival no hay botones", () => {
    renderRoom([state(lotView({ turn: 2 }))]);
    expect(screen.queryByRole("button", { name: /^Pujar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pasar" })).toBeNull();
    expect(screen.getByText("Le toca a misty")).toBeInTheDocument();
  });

  it("quien no llega a nada lo sabe y puede pasar", () => {
    renderRoom([state(lotView({ myLimit: 100_000 }))]);
    expect(screen.getByText("No te alcanza: solo puedes pasar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pujar 210.000" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pasar" })).toBeEnabled();
  });

  it("se desactiva solo lo que no alcanza", () => {
    renderRoom([state(lotView({ myLimit: 260_000 }))]);
    expect(screen.getByRole("button", { name: "Pujar 250.000" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Pujar 300.000" })).toBeDisabled();
    expect(screen.queryByText("No te alcanza: solo puedes pasar.")).toBeNull();
  });

  it("si la silueta no carga, se avisa y se puede seguir pujando", () => {
    renderRoom([state(lotView())]);
    fireEvent.error(screen.getByRole("img", { name: "Silueta de un Pokémon" }));
    expect(screen.queryByRole("img", { name: "Silueta de un Pokémon" })).toBeNull();
    expect(screen.getByRole("button", { name: "Pujar 210.000" })).toBeEnabled();
  });

  it("anuncia cómo se cerró el lote", () => {
    const services = fakeServices();
    renderRoom([state(lotView())], services);
    serverSends(services, { name: "auction-sale", payload: { lot: 2, kind: "pokemon", winner: 2, paid: 210_000 } });
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent("misty se lleva el lote por 210.000");
    serverSends(services, { name: "auction-sale", payload: { lot: 2, kind: "item", winner: null, paid: 0, item: "cinta" } });
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent("Lote 2: nadie se lleva el objeto");
  });

  it("tras decidir, los botones se bloquean hasta el turno siguiente", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state(lotView())], services);
    await user.click(screen.getByRole("button", { name: "Pasar" }));
    expect(screen.getByRole("button", { name: "Pasar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pujar 210.000" })).toBeDisabled();
    serverSends(services, state(lotView({ turnId: 78, number: 4 })));
    expect(screen.getByRole("button", { name: "Pasar" })).toBeEnabled();
  });

  it("si el servidor rechaza la puja, se puede volver a intentar", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state(lotView())], services);
    await user.click(screen.getByRole("button", { name: "Pasar" }));
    serverSends(services, { name: "error", payload: { code: "INVALID_BID", message: "x" } });
    expect(screen.getByRole("button", { name: "Pasar" })).toBeEnabled();
  });

  it("una silueta que falló no afecta a la del lote siguiente", () => {
    const services = fakeServices();
    renderRoom([state(lotView())], services);
    fireEvent.error(screen.getByRole("img", { name: "Silueta de un Pokémon" }));
    serverSends(services, state(lotView({ number: 4, silhouetteUrl: "/silhouettes/otra", turnId: 78 })));
    expect(screen.getByRole("img", { name: "Silueta de un Pokémon" })).toHaveAttribute("src", "/silhouettes/otra");
  });

  it("se anuncia cada turno: el lote, la puja y a quién le toca", () => {
    const services = fakeServices();
    renderRoom([state(lotView())], services);
    const log = screen.getByRole("log", { name: "Anuncios de la partida" });
    expect(log).toHaveTextContent("Lote 3 de 9. Puja actual: 200.000. Te toca.");
    serverSends(services, state(lotView({ turn: 2, turnId: 78, currentBid: 300_000 })));
    expect(log).toHaveTextContent("Lote 3 de 9. Puja actual: 300.000. Le toca a misty.");
  });

  it("dice a la vista quién va ganando y cómo se cerró el lote anterior", () => {
    const services = fakeServices();
    renderRoom([state(lotView())], services);
    expect(screen.getByText("Va ganando misty")).toBeInTheDocument();
    serverSends(services, { name: "auction-sale", payload: { lot: 2, kind: "pokemon", winner: 2, paid: 210_000 } });
    expect(screen.getByText("Lote 2: misty se lleva el lote por 210.000")).toBeVisible();
  });

  it("si el foco se perdió, vuelve a los botones cuando me toca", () => {
    const services = fakeServices();
    renderRoom([state(lotView({ turn: 2 }))], services);
    (document.activeElement as HTMLElement | null)?.blur();
    serverSends(services, state(lotView({ turnId: 78 })));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pujar 210.000" }));
  });

  it("pulsar cuando el turno ya cambió no muestra un error alarmante", () => {
    const services = fakeServices();
    renderRoom([state(lotView({ turn: 2 }))], services);
    serverSends(services, { name: "error", payload: { code: "NOT_YOUR_TURN", message: "Aún no es tu turno" } });
    expect(screen.queryByText(/turno/i, { selector: "[role=alert], [role=status]" })).toBeNull();
  });
});
