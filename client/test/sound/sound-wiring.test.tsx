import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../src/components/Button";
import { initialGameView } from "../../src/game/apply-event";
import { createGameStore } from "../../src/game/store";
import { MainMenu } from "../../src/pages/MainMenu";
import { ServicesProvider } from "../../src/services";
import { SoundDirector } from "../../src/sound/SoundDirector";
import { useLastSeconds } from "../../src/sound/use-last-seconds";
import { SERVER_NOW, event, gameEnded } from "../helpers/events";
import { serverSends } from "../helpers/room";
import { type FakeServices, fakeServices, renderWithServices, signIn } from "../helpers/services";

describe("el store avisa de cada evento con la vista de antes y la de después", () => {
  it("onEvent recibe (antes, evento, después)", () => {
    const calls: [string | null, string, string | null][] = [];
    const store = createGameStore({ onEvent: (before, e, after) => calls.push([before.phase, e.name, after.phase]) });
    store.getState().receive(event.roomState({ phase: "waiting" }), SERVER_NOW);
    store.getState().receive(event.gameStarting(SERVER_NOW + 5000), SERVER_NOW);
    expect(calls).toEqual([
      [initialGameView.phase, "room-state", "waiting"],
      ["waiting", "game-starting", "starting"],
    ]);
  });

  it("en la aplicación, los eventos de la partida suenan (y un room-state no)", () => {
    const services = fakeServices();
    serverSends(services, event.roomState({ phase: "round_active" }));
    expect(services.sound.play).not.toHaveBeenCalled();
    serverSends(services, event.roundResult());
    expect(services.sound.play).toHaveBeenCalledWith("correct", 0);
  });
});

describe("la música sigue a la pantalla", () => {
  const director = (route: string, services: FakeServices = fakeServices()) => {
    signIn(services);
    return renderWithServices(<SoundDirector />, { services, route });
  };

  it("sala en el menú, silencio en el acceso, y lo anota en <html data-music>", () => {
    const menu = director("/");
    expect(menu.services.sound.setMusic).toHaveBeenLastCalledWith({ zone: "lobby" });
    expect(document.documentElement.dataset.music).toBe("lobby");
    menu.unmount();
    const login = director("/login");
    expect(login.services.sound.setMusic).toHaveBeenLastCalledWith({ zone: "none" });
    expect(document.documentElement.dataset.music).toBe("none");
  });

  it("en una sala: partida durante las rondas y el final según el resultado, sin repetir la misma zona", () => {
    const services = fakeServices();
    serverSends(services, event.roomState({ phase: "round_active" }));
    director("/sala/ABC234", services);
    expect(services.sound.setMusic).toHaveBeenLastCalledWith({ zone: "battle" });
    const calls = services.sound.setMusic.mock.calls.length;
    serverSends(services, event.roundResult());
    expect(services.sound.setMusic.mock.calls.length).toBe(calls);
    serverSends(services, event.gameEnded({ ...gameEnded(), winnerSeat: 1 }));
    expect(services.sound.setMusic).toHaveBeenLastCalledWith({ zone: "final", outcome: "win" });
    expect(document.documentElement.dataset.music).toBe("final");
  });
});

describe("últimos segundos", () => {
  function Probe(props: { deadline: number; answered: boolean; round: number; now: () => number }) {
    useLastSeconds({ deadline: props.deadline, offset: 0, answered: props.answered, round: props.round, now: props.now });
    return null;
  }

  it("suena una sola vez por ronda al quedar 5 s, y nunca si ya respondí", () => {
    vi.useFakeTimers();
    try {
      const services = fakeServices();
      let now = 0;
      const clock = () => now;
      const ticks = () => services.sound.play.mock.calls.filter(([e]) => e === "tick").length;
      /** Cambia la hora y deja pasar un intervalo del cronómetro. */
      const at = (ms: number) => {
        now = ms;
        act(() => void vi.advanceTimersByTime(300));
      };
      const view = render(<Probe deadline={15_000} answered={false} round={1} now={clock} />, {
        wrapper: ({ children }) => <ServicesProvider services={services}>{children}</ServicesProvider>,
      });
      at(9000);
      expect(ticks()).toBe(0);
      at(10_500);
      expect(ticks()).toBe(1);
      at(12_000);
      expect(ticks()).toBe(1);
      // Otra ronda, otro aviso.
      view.rerender(<Probe deadline={30_000} answered={false} round={2} now={clock} />);
      at(26_000);
      expect(ticks()).toBe(2);
      // Si ya respondí, no.
      view.rerender(<Probe deadline={45_000} answered round={3} now={clock} />);
      at(41_000);
      expect(ticks()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("últimos segundos al recargar", () => {
  function Probe(props: { deadline: number; now: () => number }) {
    useLastSeconds({ deadline: props.deadline, offset: 0, answered: false, round: 1, now: props.now });
    return null;
  }

  it("si al montar ya quedan menos de 5 s (recargar o reconectar), no suena", () => {
    vi.useFakeTimers();
    try {
      const services = fakeServices();
      const now = 12_000;
      render(<Probe deadline={15_000} now={() => now} />, {
        wrapper: ({ children }) => <ServicesProvider services={services}>{children}</ServicesProvider>,
      });
      act(() => void vi.advanceTimersByTime(600));
      expect(services.sound.play).not.toHaveBeenCalledWith("tick");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("el botón suena al pulsar", () => {
  it("Button y «Jugar» del menú piden el efecto de botón", async () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(
      <>
        <Button onClick={() => {}}>Probar</Button>
        <MainMenu backgrounds={[]} />
      </>,
      { services },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Probar" }));
    expect(services.sound.play).toHaveBeenCalledWith("click");
    services.sound.play.mockClear();
    await user.click(screen.getAllByRole("link", { name: /Jugar/ })[0]!);
    expect(services.sound.play).toHaveBeenCalledWith("click");
  });

  it("Button sin servicios (pruebas sueltas de componentes) no falla", () => {
    expect(() => render(<Button>Suelto</Button>)).not.toThrow();
  });
});
