import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fighter, battleState, MY_TEAM, RIVAL_TEAM } from "../helpers/battle";
import { SERVER_NOW } from "../helpers/events";
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

  it("mis PS van en números y los del rival en porcentaje", () => {
    renderRoom([battleState("battle", { rivalTeam: [fighter(4, "Cuatro", 57, 130), ...RIVAL_TEAM.slice(1)] })]);
    expect(screen.getByText("44 %")).toBeInTheDocument();
    expect(screen.queryByText("57 / 130")).toBeNull();
  });

  it("tu Pokémon sale de espaldas y el rival de frente, sin voltear ninguno", () => {
    renderRoom([battleState("battle")]);
    expect(screen.getByRole("img", { name: "Uno" }).getAttribute("src")).toContain("showdown/back/1.gif");
    expect(screen.getByRole("img", { name: "Cuatro" }).getAttribute("src")).toContain("showdown/4.gif");
    expect(screen.getByRole("img", { name: "Uno" })).not.toHaveClass("-scale-x-100");
  });

  it("un sprite muy alto se reduce para caber; uno normal no", () => {
    renderRoom([battleState("battle")]);
    const giant = screen.getByRole("img", { name: "Uno" });
    Object.defineProperty(giant, "naturalHeight", { value: 180 });
    fireEvent.load(giant);
    expect(giant.style.getPropertyValue("--sprite-fit")).toBe("0.5");
    const small = screen.getByRole("img", { name: "Cuatro" });
    Object.defineProperty(small, "naturalHeight", { value: 60 });
    fireEvent.load(small);
    expect(small.style.getPropertyValue("--sprite-fit")).toBe("1");
  });

  it("empieza con el escenario a la vista, aunque se viniera de más abajo", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    renderRoom([battleState("battle")]);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("el fondo es el escenario del combate", () => {
    const { container } = renderRoom([battleState("battle", { scene: "volcan" })]);
    expect(container.querySelector("[data-arena] img")!.getAttribute("src")).toBe("/auction/combate-volcan.png");
  });

  it("no hay reloj para elegir", () => {
    renderRoom([battleState("battle")]);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByText("Tiempo para elegir movimiento")).toBeNull();
  });

  it("pregunta qué hace, y tras elegir dice que espera al rival; aún se puede cambiar de idea", () => {
    const services = fakeServices();
    renderRoom([battleState("battle")], services);
    expect(screen.getByText("¿Qué hace Uno?")).toBeInTheDocument();
    serverSends(services, battleState("battle", { confirmed: true, myMove: "fire" }));
    expect(screen.getByText("Esperando a misty…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forcejeo Normal" })).toBeEnabled();
  });

  it("con el aviso abierto, «Sigo aquí» manda el paso actual", async () => {
    const services = fakeServices();
    const { user } = renderRoom([battleState("battle", { warningUntil: SERVER_NOW + 15_000, stepId: 90 })], services);
    expect(screen.getByRole("alert")).toHaveTextContent("¿Sigues ahí?");
    await user.click(screen.getByRole("button", { name: "Sigo aquí" }));
    expect(services.game.client.stillHere).toHaveBeenCalledWith(90);
  });

  it("si yo ya elegí y el rival tarda, se dice", () => {
    renderRoom([battleState("battle", { confirmed: true, myMove: "fire", rivalIdle: true })]);
    expect(screen.getByText("misty lleva rato sin elegir…")).toBeInTheDocument();
  });

  it("el equipo permite cambiar; no al que pelea ni a un debilitado", async () => {
    const services = fakeServices();
    const { user } = renderRoom([battleState("battle", { myTeam: [MY_TEAM[0]!, fighter(2, "Dos", 63, 100), fighter(3, "Tres", 0, 100)] })], services);
    expect(screen.getByRole("button", { name: "Uno, en combate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tres, debilitado" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cambiar a Dos, 63 % de PS" }));
    expect(services.game.client.switchTo).toHaveBeenCalledWith(2);
  });

  it("el cambio elegido sigue marcado, y mientras se anima no se puede cambiar", () => {
    const services = fakeServices();
    renderRoom([battleState("battle", { confirmed: true, mySwitch: 2 })], services);
    expect(screen.getByRole("button", { name: "Cambiar a Dos, 100 % de PS" })).toHaveAttribute("aria-pressed", "true");
    serverSends(services, battleState("battle", { choosing: false, moves: [] }));
    expect(screen.getByRole("button", { name: "Cambiar a Dos, 100 % de PS" })).toBeDisabled();
  });

  it("un cambio va al registro y al lector", () => {
    const services = fakeServices();
    const { container } = renderRoom([battleState("battle")], services);
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 1, actions: [{ ...hit, actor: 2 }], switches: [{ seat: 1, pokemonId: 2 }] } });
    const log = container.querySelector("[data-battle-log]") as HTMLElement;
    expect(within(log).getByText("¡Adelante, Dos!")).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent("¡Adelante, Dos!");
  });

  it("los movimientos dicen su eficacia en palabras, y elegir lo envía", async () => {
    const services = fakeServices();
    const { user } = renderRoom([battleState("battle")], services);
    expect(screen.getByRole("button", { name: "Forcejeo Normal" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Ataque Fuego Muy eficaz" }));
    expect(services.game.client.move).toHaveBeenCalledWith("fire");
  });

  it("Recuperar ya usado no se puede elegir", () => {
    renderRoom([battleState("battle", { moves: [{ move: "recuperar", effectiveness: null, used: true }] })]);
    expect(screen.getByRole("button", { name: "Recuperar Ya usado" })).toBeDisabled();
  });

  it("lo elegido sigue marcado al recargar", () => {
    renderRoom([battleState("battle", { confirmed: true, myMove: "fire" })]);
    expect(screen.getByRole("button", { name: "Ataque Fuego Muy eficaz" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Forcejeo Normal" })).toHaveAttribute("aria-pressed", "false");
  });

  it("mientras se anima no hay botones", () => {
    renderRoom([battleState("battle", { choosing: false, moves: [] })]);
    expect(screen.getByText("Resolviendo…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Forcejeo/ })).toBeNull();
  });

  it("un turno va al registro visible, y al lector solo una frase", () => {
    const services = fakeServices();
    const { container } = renderRoom([battleState("battle")], services);
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 1, actions: [hit] } });
    const log = container.querySelector("[data-battle-log]")!;
    expect(log).toHaveAttribute("aria-hidden", "true");
    expect(within(log as HTMLElement).getByText("Uno usó Ataque Fuego: 42 de daño. ¡Es muy eficaz!")).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent(/^Asalto 1, turno 1: Uno, 42 de daño\.$/);
  });

  it("al golpear, embiste el atacante y se tiñe el defensor; con otro turno no quedan teñidos", () => {
    const services = fakeServices();
    renderRoom([battleState("battle")], services);
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 1, actions: [hit] } });
    expect(screen.getByRole("img", { name: "Uno" }).parentElement).toHaveClass("battle-lunge");
    expect(screen.getByRole("img", { name: "Cuatro" }).parentElement).toHaveClass("battle-hit");
    serverSends(services, battleState("battle", { turn: 2 }));
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 2, actions: [{ ...hit, actor: 2 }] } });
    expect(screen.getByRole("img", { name: "Uno" }).parentElement).toHaveClass("battle-hit");
    expect(screen.getByRole("img", { name: "Cuatro" }).parentElement).not.toHaveClass("battle-hit");
  });

  it("al empezar otro asalto no se repite el último golpe", () => {
    const services = fakeServices();
    renderRoom([battleState("battle")], services);
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 1, actions: [hit] } });
    serverSends(services, battleState("battle_pause", { moves: [] }));
    serverSends(services, battleState("battle", { round: 2, turn: 1 }));
    expect(screen.getByRole("img", { name: "Uno" }).parentElement).not.toHaveClass("battle-lunge");
    expect(screen.getByRole("img", { name: "Cuatro" }).parentElement).not.toHaveClass("battle-hit");
  });

  it("el lector oye cada turno aunque se repita el daño, el K.O. y el asalto nuevo", () => {
    const services = fakeServices();
    renderRoom([battleState("battle")], services);
    const log = screen.getByRole("log", { name: "Anuncios de la partida" });
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 1, actions: [hit] } });
    serverSends(services, battleState("battle", { turn: 2 }));
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 2, actions: [hit] } });
    expect(log).toHaveTextContent("Asalto 1, turno 2: Uno, 42 de daño.");
    serverSends(services, { name: "battle-round-ended", payload: { round: 1, loser: 2, atLimit: true } });
    expect(log).toHaveTextContent("Cuatro cayó por el límite de turnos.");
    serverSends(services, battleState("battle", { round: 2, turn: 1 }));
    expect(log).toHaveTextContent(/^Asalto 2: Uno contra Cuatro\.$/);
  });

  it("con «reducir movimiento», imagen fija", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
    renderRoom([battleState("battle")]);
    expect(screen.getByRole("img", { name: "Uno" }).getAttribute("src")).not.toContain("showdown");
  });

  it("sin GIF propio, si la imagen falla pasa directo al nombre", () => {
    renderRoom([battleState("battle", { myTeam: [fighter(990, "Sin Gif")], myTitular: 990 })]);
    fireEvent.error(screen.getByRole("img", { name: "Sin Gif" }));
    expect(screen.queryByRole("img", { name: "Sin Gif" })).toBeNull();
  });

  it("el K.O. espera a que acabe el golpe", () => {
    const services = fakeServices();
    renderRoom([battleState("battle")], services);
    serverSends(services, { name: "battle-turn", payload: { round: 1, turn: 1, actions: [hit] } });
    serverSends(services, { name: "battle-round-ended", payload: { round: 1, loser: 2, atLimit: false } });
    expect(screen.queryByText("K.O.")).toBeNull();
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
    renderRoom([battleState("battle", { choosing: false, moves: [] })], services);
    expect(screen.queryByText("K.O.")).toBeNull();
    serverSends(services, { name: "battle-round-ended", payload: { round: 1, loser: 2, atLimit: false } });
    expect(screen.getByText("K.O.")).toBeInTheDocument();
  });

  it("si el sprite animado falla pasa al PNG clásico, y si este falla, al nombre", () => {
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

});
