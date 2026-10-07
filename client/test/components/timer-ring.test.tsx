import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingScreen } from "../../src/components/LoadingScreen";
import { Timer } from "../../src/components/Timer";

const CIRCUMFERENCE = 2 * Math.PI * 44;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** El círculo que se vacía: el segundo trazo del anillo. */
const progress = (container: HTMLElement) => container.querySelectorAll("circle")[1]!;
const dashoffset = (container: HTMLElement) => Number(progress(container).getAttribute("stroke-dashoffset"));

describe("Timer como anillo", () => {
  it("al empezar el anillo está lleno y a la mitad queda medio vacío", () => {
    let now = 0;
    const { container } = render(<Timer deadline={15_000} offset={0} totalMs={15_000} label="Tiempo" now={() => now} />);
    expect(dashoffset(container)).toBeCloseTo(0, 1);

    now = 7_500;
    act(() => void vi.advanceTimersByTime(250));
    expect(dashoffset(container)).toBeCloseTo(CIRCUMFERENCE * 0.5, 0);
  });

  it("al llegar a cero el anillo queda vacío", () => {
    let now = 0;
    const { container } = render(<Timer deadline={1_000} offset={0} totalMs={15_000} label="Tiempo" now={() => now} />);
    now = 60_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(dashoffset(container)).toBeCloseTo(CIRCUMFERENCE, 1);
  });

  it("los números van dentro del anillo y el anillo no añade texto", () => {
    render(<Timer deadline={12_000} offset={0} totalMs={15_000} label="Tiempo de la ronda" now={() => 0} />);
    const timer = screen.getByRole("timer", { name: "Tiempo de la ronda" });
    expect(timer).toHaveTextContent(/^12$/);
    expect(timer.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("no anuncia cada segundo a los lectores de pantalla", () => {
    render(<Timer deadline={12_000} offset={0} totalMs={15_000} label="Tiempo" now={() => 0} />);
    expect(screen.getByRole("timer")).not.toHaveAttribute("aria-live");
  });

  it("en los últimos 5 segundos pasa a rojo y lo marca", () => {
    let now = 0;
    const { container } = render(<Timer deadline={15_000} offset={0} totalMs={15_000} label="Tiempo" now={() => now} />);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveAttribute("data-urgent", "false");
    expect(progress(container).getAttribute("class")).toContain("stroke-accent");

    now = 10_001;
    act(() => void vi.advanceTimersByTime(250));
    expect(timer).toHaveAttribute("data-urgent", "true");
    expect(progress(container).getAttribute("class")).toContain("stroke-danger");
  });

  it("con 0 segundos ya no está urgente: terminó", () => {
    let now = 0;
    render(<Timer deadline={1_000} offset={0} totalMs={15_000} label="Tiempo" now={() => now} />);
    now = 5_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(screen.getByRole("timer")).toHaveAttribute("data-urgent", "false");
  });

  it("se puede apagar el aviso rojo (la cuenta atrás de 5 s del inicio no debe estar roja todo el rato)", () => {
    render(<Timer deadline={4_000} offset={0} totalMs={5_000} urgentAtMs={0} label="Inicio" now={() => 0} />);
    expect(screen.getByRole("timer")).toHaveAttribute("data-urgent", "false");
  });

  it("el tamaño se puede elegir", () => {
    render(<Timer deadline={4_000} offset={0} totalMs={5_000} size={160} label="Inicio" now={() => 0} />);
    const timer = screen.getByRole("timer");
    expect(timer.style.width).toBe("160px");
    expect(timer.style.height).toBe("160px");
  });
});

describe("LoadingScreen (etapa 6)", () => {
  it("muestra la bola girando, decorativa, además del texto de siempre", () => {
    render(<LoadingScreen />);
    const svg = screen.getByRole("status").querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.getAttribute("class")).toContain("animate-spin-slow");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
  });
});
