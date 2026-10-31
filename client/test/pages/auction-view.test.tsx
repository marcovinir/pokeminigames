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
    const { user } = renderRoom([state(lotView())], services);
    await user.click(screen.getByRole("button", { name: "Pujar 210.000" }));
    expect(services.game.client.bid).toHaveBeenCalledWith(10_000);
    await user.click(screen.getByRole("button", { name: "Pasar" }));
    expect(services.game.client.pass).toHaveBeenCalled();
  });

  it("sin puja, la opción es abrir al precio inicial", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state(lotView({ currentBid: null, leader: null }))], services);
    await user.click(screen.getByRole("button", { name: "Pujar 150.000" }));
    expect(services.game.client.bid).toHaveBeenCalledWith(null);
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
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent("Nadie se lleva el objeto");
  });

  it("pulsar cuando el turno ya cambió no muestra un error alarmante", () => {
    const services = fakeServices();
    renderRoom([state(lotView({ turn: 2 }))], services);
    serverSends(services, { name: "error", payload: { code: "NOT_YOUR_TURN", message: "Aún no es tu turno" } });
    expect(screen.queryByText(/turno/i, { selector: "[role=alert], [role=status]" })).toBeNull();
  });
});
