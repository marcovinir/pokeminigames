import type { AuctionRevealEntry, BattleView } from "@pokemon-minigames/shared";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revealedCount } from "../../src/pages/room/auction/RevealView";
import { SERVER_NOW, event, pokemon } from "../helpers/events";
import { ash, misty, renderRoom } from "../helpers/room";
import { fakeServices } from "../helpers/services";

const entry = (id: number, name: string, owner: 1 | 2, wasTrap = false): AuctionRevealEntry => ({
  owner,
  wasTrap,
  pokemon: pokemon(id, 400, { names: { es: name, en: name } }),
});
const REVEAL = [entry(1, "Uno", 1), entry(2, "Dos", 2, true), entry(3, "Tres", 1), entry(4, "Cuatro", 2), entry(5, "Cinco", 1), entry(6, "Seis", 2)];

const battleView = (over: Partial<BattleView> = {}): BattleView => ({
  scene: "bosque",
  choosing: false,
  stepId: 1,
  warningUntil: null,
  rivalIdle: false,
  mySwitch: null,
  round: 0,
  turn: 0,
  deadline: SERVER_NOW + 36_000,
  confirmed: false,
  myLineup: null,
  myMove: null,
  myPause: null,
  myTeam: [],
  rivalTeam: [],
  myTitular: null,
  rivalTitular: null,
  moves: [],
  ...over,
});

const state = (phase: "reveal" | "lineup", over: Partial<BattleView> = {}) =>
  event.roomState({
    phase,
    config: { game: "subasta", traps: true },
    players: [ash(), misty()],
    auction: { money: { 1: 1, 2: 2 }, teamSizes: { 1: 3, 2: 3 }, purchases: { 1: [], 2: [] }, lot: null, reveal: REVEAL, battle: battleView(over) },
  });

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(SERVER_NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("revealedCount", () => {
  const deadline = 36_000;
  it("uno cada 3 s", () => {
    expect(revealedCount(deadline, 0, 6)).toBe(1);
    expect(revealedCount(deadline, 2999, 6)).toBe(1);
    expect(revealedCount(deadline, 3000, 6)).toBe(2);
    expect(revealedCount(deadline, 15_000, 6)).toBe(6);
  });
  it("no se sale de los límites", () => {
    expect(revealedCount(deadline, -5000, 6)).toBe(1);
    expect(revealedCount(deadline, 90_000, 6)).toBe(6);
    expect(revealedCount(deadline, 90_000, 0)).toBe(0);
  });
});

describe("la revelación", () => {
  it("empieza con uno solo: los demás no tienen nombre", () => {
    renderRoom([state("reveal")]);
    expect(screen.getByText("Uno", { ignore: "[role=log]" })).toBeInTheDocument();
    expect(screen.queryByText("Dos")).toBeNull();
    expect(screen.getAllByText("???")).toHaveLength(5);
  });

  it("al recargar a mitad se ven de golpe los que ya tocaban, y la trampa", () => {
    renderRoom([state("reveal", { deadline: SERVER_NOW + 24_000 })]);
    for (const name of ["Uno", "Dos", "Tres", "Cuatro", "Cinco"]) expect(screen.getByText(name, { ignore: "[role=log]" })).toBeInTheDocument();
    expect(screen.queryByText("Seis")).toBeNull();
    expect(screen.getAllByText("¡Era una trampa!")).toHaveLength(1);
  });

  it("«Listo» confirma; ya confirmado, espera al rival", async () => {
    const services = fakeServices();
    const { user, unmount } = renderRoom([state("reveal")], services);
    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(services.game.client.ready).toHaveBeenCalled();
    unmount();
    renderRoom([state("reveal", { confirmed: true })]);
    expect(screen.getByRole("button", { name: "Esperando al rival…" })).toBeDisabled();
  });

  it("con «reducir movimiento» aparecen sin animación", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
    const { container } = renderRoom([state("reveal")]);
    expect(container.querySelector("[data-reveal-entry]")).not.toBeNull();
    expect(container.querySelector("[data-reveal-entry].animate-rise")).toBeNull();
  });
});

describe("después de la revelación", () => {
  it("sigue la alineación", () => {
    renderRoom([state("lineup")]);
    expect(screen.getByRole("heading", { name: "Elige tu alineación" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abandonar/ })).toBeInTheDocument();
  });
});

describe("el resumen de una subasta", () => {
  const ended = (winnerSeat: 1 | 2 | null, reason: "forfeit" | "abandoned") =>
    ({
      name: "game-ended",
      payload: {
        winnerSeat,
        reason,
        teams: { 1: [pokemon(1, 400)], 2: [] },
        totals: { 1: 0, 2: 0 },
        auction: { damage: { 1: 0, 2: 0 }, spent: { 1: 0, 2: 0 }, reveal: [] },
      },
    }) as never;
  const base = event.roomState({ phase: "finished", config: { game: "subasta", traps: true }, players: [ash(), misty()] });

  it("sin marcador 0 – 0 y con quién ganó", () => {
    renderRoom([base, ended(1, "forfeit")]);
    expect(screen.getByRole("heading", { name: "Ganaste" })).toBeInTheDocument();
    expect(screen.queryByText("0 – 0")).toBeNull();
  });

  it("quien no llegó a comprar no «ganó» nada", () => {
    renderRoom([base, ended(1, "forfeit")]);
    expect(screen.queryByText("No ganó ningún Pokémon.")).toBeNull();
    expect(screen.getByText("No llegó a comprar ninguno.")).toBeInTheDocument();
  });

  it("cuenta el daño y el dinero gastado de cada uno", () => {
    const summary = { damage: { 1: 321, 2: 123 }, spent: { 1: 400_000, 2: 900_000 }, reveal: [] };
    renderRoom([base, { name: "game-ended", payload: { winnerSeat: 1, reason: "completed", teams: { 1: [], 2: [] }, totals: { 1: 0, 2: 0 }, auction: summary } } as never]);
    const section = screen.getByRole("region", { name: "Resumen del combate" });
    const mine = section.querySelector("[data-summary-seat='1']")!;
    expect(mine).toHaveTextContent("ash");
    expect(mine).toHaveTextContent("321");
    expect(mine).toHaveTextContent("400.000");
    expect(section.querySelector("[data-summary-seat='2']")).toHaveTextContent("900.000");
  });

  it("sin ganador no dice «Empate»", () => {
    renderRoom([base, ended(null, "abandoned")]);
    expect(screen.queryByText("Empate")).toBeNull();
    expect(screen.getByRole("heading", { name: "Sin ganador" })).toBeInTheDocument();
  });
});
