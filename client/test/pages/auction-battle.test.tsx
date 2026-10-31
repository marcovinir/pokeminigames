import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fighter, battleState, MY_TEAM } from "../helpers/battle";
import { renderRoom, serverSends } from "../helpers/room";
import { fakeServices } from "../helpers/services";

const hit = { actor: 1 as const, move: "fire" as const, damage: 42, critical: false, effectiveness: 2, healed: 0, actorHp: 100, targetHp: 58 };

afterEach(() => vi.unstubAllGlobals());

describe("el combate", () => {
  it("muestra las barras con su valor y su tono", () => {
    renderRoom([battleState("battle", { myTeam: [fighter(1, "Uno", 15, 100), ...MY_TEAM.slice(1)] })]);
    const mine = screen.getByRole("meter", { name: "PS de Uno" });
    expect(mine).toHaveAttribute("aria-valuenow", "15");
    expect(mine).toHaveAttribute("aria-valuemax", "100");
    expect(mine).toHaveAttribute("data-tone", "danger");
    expect(screen.getByRole("meter", { name: "PS de Cuatro" })).toHaveAttribute("data-tone", "good");
    expect(screen.getByText("15 / 100")).toBeInTheDocument();
  });

  it("el rival va volteado, y su nombre no", () => {
    renderRoom([battleState("battle")]);
    expect(screen.getByRole("img", { name: "Cuatro" })).toHaveClass("-scale-x-100");
    expect(screen.getByRole("img", { name: "Uno" })).not.toHaveClass("-scale-x-100");
    expect(screen.getByRole("meter", { name: "PS de Cuatro" }).closest(".-scale-x-100")).toBeNull();
  });

  it("los movimientos dicen su eficacia, y elegir lo envía", async () => {
    const services = fakeServices();
    const { user } = renderRoom([battleState("battle")], services);
    expect(screen.getByRole("button", { name: "Forcejeo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Ataque Fuego ×2" }));
    expect(services.game.client.move).toHaveBeenCalledWith("fire");
  });

  it("Recuperar ya usado no se puede elegir", () => {
    renderRoom([battleState("battle", { moves: [{ move: "recuperar", effectiveness: null, used: true }] })]);
    expect(screen.getByRole("button", { name: "Recuperar" })).toBeDisabled();
  });

  it("lo elegido sigue marcado al recargar", () => {
    renderRoom([battleState("battle", { confirmed: true, myMove: "fire" })]);
    expect(screen.getByRole("button", { name: "Ataque Fuego ×2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Forcejeo" })).toHaveAttribute("aria-pressed", "false");
  });

  it("mientras se anima no hay botones", () => {
    renderRoom([battleState("battle", { deadline: null, moves: [] })]);
    expect(screen.getByText("Resolviendo…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forcejeo" })).toBeNull();
  });

  it("un turno va al registro visible, y al lector solo una frase", () => {
    const services = fakeServices();
    const { container } = renderRoom([battleState("battle")], services);
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 1, actions: [hit] } });
    const log = container.querySelector("[data-battle-log]")!;
    expect(log).toHaveAttribute("aria-hidden", "true");
    expect(within(log as HTMLElement).getByText("Uno usó Ataque Fuego: 42 de daño. ¡Es muy eficaz!")).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent(/^Uno, 42 de daño\.$/);
  });

  it("al golpear, embiste el atacante y se tiñe el defensor; con otro turno no quedan teñidos", () => {
    const services = fakeServices();
    renderRoom([battleState("battle")], services);
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 1, actions: [hit] } });
    expect(screen.getByRole("img", { name: "Uno" }).parentElement).toHaveClass("battle-lunge");
    expect(screen.getByRole("img", { name: "Cuatro" }).parentElement).toHaveClass("battle-hit");
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 2, actions: [{ ...hit, actor: 2 }] } });
    expect(screen.getByRole("img", { name: "Uno" }).parentElement).toHaveClass("battle-hit");
    expect(screen.getByRole("img", { name: "Cuatro" }).parentElement).not.toHaveClass("battle-hit");
  });

  it("con «reducir movimiento», solo un destello", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
    const services = fakeServices();
    renderRoom([battleState("battle")], services);
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 1, actions: [hit] } });
    expect(screen.getByRole("img", { name: "Uno" }).parentElement).not.toHaveClass("battle-lunge");
    expect(screen.getByRole("img", { name: "Cuatro" }).parentElement).not.toHaveClass("battle-hit");
    expect(screen.getByRole("img", { name: "Cuatro" }).parentElement).toHaveClass("battle-flash");
  });

  it("al caer un Pokémon sale el K.O.", () => {
    const services = fakeServices();
    renderRoom([battleState("battle", { deadline: null, moves: [] })], services);
    expect(screen.queryByText("K.O.")).toBeNull();
    serverSends(services, { name: "battle-round-ended", payload: { round: 1, loser: 2, atLimit: false } });
    expect(screen.getByText("K.O.")).toBeInTheDocument();
  });

  it("si el sprite animado falla pasa a la imagen fija, y si esta falla, al nombre", () => {
    renderRoom([battleState("battle")]);
    const gif = screen.getByRole("img", { name: "Uno" });
    expect(gif.getAttribute("src")).toContain("showdown");
    fireEvent.error(gif);
    const still = screen.getByRole("img", { name: "Uno" });
    expect(still.getAttribute("src")).not.toContain("showdown");
    fireEvent.error(still);
    expect(screen.queryByRole("img", { name: "Uno" })).toBeNull();
    expect(screen.getAllByText("Uno").length).toBeGreaterThan(1);
  });

  it("la Cinta se ve en la barra de quien la lleva", () => {
    renderRoom([battleState("battle", { cinta: { 1: false, 2: true } })]);
    expect(screen.getByText("Cinta")).toBeInTheDocument();
  });
});
