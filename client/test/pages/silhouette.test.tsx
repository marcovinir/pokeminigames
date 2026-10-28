import type { SilhouetteStateView } from "@pokemon-minigames/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SERVER_NOW, event, pokemon, silhouetteReveal } from "../helpers/events";
import { ash, misty, renderRoom } from "../helpers/room";

const SILHOUETTE = { game: "silueta" as const, rounds: 10 as const, generations: [1] };

function inRound(overrides: Partial<SilhouetteStateView> = {}, config = SILHOUETTE) {
  return event.roomState({
    phase: "round_active",
    config,
    players: [ash(), misty()],
    silhouette: {
      totalRounds: 10,
      round: { number: 3, deadline: SERVER_NOW + 15_000, silhouetteUrl: "/silhouettes/tok3", answered: false, answeredMs: null, opponentAnswered: false },
      reveals: [],
      ...overrides,
    },
  });
}

const gengar = () => silhouetteReveal({ round: 3, pokemon: pokemon(94, 500, { names: { es: "Gengar", en: "Gengar" } }) });

describe("la ronda de la silueta", () => {
  it("muestra la ronda, la silueta, la pregunta, el reloj y el campo", () => {
    renderRoom([inRound()]);
    expect(screen.getByText("Ronda 3 de 10")).toBeInTheDocument();
    const img = screen.getByRole("img", { name: "Silueta de un Pokémon" });
    expect(img).toHaveAttribute("src", "/silhouettes/tok3");
    expect(screen.getByRole("heading", { name: "¿Quién es ese Pokémon?" })).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Tiempo de la ronda" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("las sugerencias van sin imágenes y solo con Pokémon de las generaciones de la sala", async () => {
    const kanto = renderRoom([inRound()]);
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "al" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    expect(within(screen.getByRole("listbox")).queryByRole("img")).toBeNull();
    expect(screen.getByRole("listbox").querySelector("img")).toBeNull();
    kanto.unmount();

    renderRoom([inRound({}, { ...SILHOUETTE, generations: [2] })]);
    const field = await screen.findByRole("combobox");
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.change(field, { target: { value: "al" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("tras responder dice en cuánto respondí", () => {
    renderRoom([inRound({ round: { number: 3, deadline: SERVER_NOW + 15_000, silhouetteUrl: "/silhouettes/tok3", answered: true, answeredMs: 3200, opponentAnswered: false } })]);
    expect(screen.getByText("Respondiste en 3,2 s")).toBeInTheDocument();
  });

  it("si la silueta no carga lo dice y se puede responder igual", () => {
    renderRoom([inRound()]);
    fireEvent.error(screen.getByRole("img", { name: "Silueta de un Pokémon" }));
    expect(screen.getByText("No se pudo cargar la silueta")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeEnabled();
  });
});

describe("la revelación", () => {
  it("«¡Es Gengar!», una fila por jugador y el nombre en el registro de la partida", () => {
    renderRoom([inRound(), event.silhouetteRoundResult(gengar(), { 1: 808, 2: 0 })]);
    expect(screen.getByRole("heading", { name: "¡Es Gengar!" })).toBeInTheDocument();
    const mine = screen.getByRole("listitem", { name: "Tú" });
    expect(mine).toHaveTextContent("Gengar");
    expect(mine).toHaveTextContent("3,2 s");
    expect(mine).toHaveTextContent("+808");
    expect(within(mine).getByText("Acertó")).toBeInTheDocument();
    const rival = screen.getByRole("listitem", { name: "misty" });
    expect(rival).toHaveTextContent("sin respuesta");
    expect(rival).toHaveTextContent("+0");
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent("¡Es Gengar!");
  });
});

describe("la sala de espera y el resumen de la silueta", () => {
  it("la sala de espera muestra rondas y generaciones", () => {
    renderRoom([event.roomState({ phase: "waiting", config: { ...SILHOUETTE, generations: [1, 2] }, players: [ash()] })]);
    expect(screen.getByLabelText("Configuración de la sala")).toHaveTextContent("10 rondas · 1.ª (Kanto), 2.ª (Johto)");
  });

  it("el resumen muestra puntos y los Pokémon de la partida con quién acertó", () => {
    renderRoom([
      event.roomState({ phase: "finished", config: SILHOUETTE, players: [ash(), misty()] }),
      event.gameEnded({ winnerSeat: 1, totals: { 1: 808, 2: 0 }, teams: { 1: [], 2: [] }, silhouette: { reveals: [gengar()] } }),
    ]);
    expect(screen.getByRole("heading", { name: "Ganaste" })).toBeInTheDocument();
    expect(screen.getByText("808 – 0")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Pokémon de la partida" });
    expect(within(list).getByText("Gengar")).toBeInTheDocument();
    expect(within(list).getByText("Acertaste")).toBeInTheDocument();
    expect(screen.queryByText("No ganó ningún Pokémon.")).not.toBeInTheDocument();
  });
});

describe("la revelación: marcador y siguiente ronda", () => {
  it("enseña el marcador ya actualizado y cuánto falta para la siguiente ronda", () => {
    renderRoom([inRound(), event.silhouetteRoundResult(gengar(), { 1: 808, 2: 0 }, SERVER_NOW + 6000)]);
    expect(screen.getByLabelText("Marcador")).toHaveTextContent("Tú 808 · misty 0");
    expect(screen.getByText(/^Siguiente ronda en \d+ s$/)).toBeInTheDocument();
  });

  it("en la última ronda avisa de que llega el resultado final", () => {
    renderRoom([inRound(), event.silhouetteRoundResult(gengar(), { 1: 808, 2: 0 }, null)]);
    expect(screen.getByText("Calculando el resultado final…")).toBeInTheDocument();
  });
});
