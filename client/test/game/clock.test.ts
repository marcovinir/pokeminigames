import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clockOffset, remainingMs, secondsLeft, useCountdown } from "../../src/game/clock";

describe("desfase del reloj", () => {
  it("es la hora del servidor menos la del navegador", () => {
    expect(clockOffset(10_000, 4_000)).toBe(6_000);
    expect(clockOffset(4_000, 10_000)).toBe(-6_000);
    expect(clockOffset(5_000, 5_000)).toBe(0);
  });

  it("corrige un navegador adelantado o atrasado al calcular lo que falta", () => {
    // El servidor marca el plazo a las 20 000 (hora del servidor).
    const deadline = 20_000;
    // Navegador atrasado 6 s: cuando el servidor está en 10 000, el navegador marca 4 000.
    const slow = clockOffset(10_000, 4_000);
    expect(remainingMs(deadline, slow, 4_000)).toBe(10_000);
    // Navegador adelantado 3 s: cuando el servidor está en 10 000, el navegador marca 13 000.
    const fast = clockOffset(10_000, 13_000);
    expect(remainingMs(deadline, fast, 13_000)).toBe(10_000);
  });
});

describe("remainingMs", () => {
  it("nunca baja de cero y sin plazo es cero", () => {
    expect(remainingMs(1_000, 0, 5_000)).toBe(0);
    expect(remainingMs(null, 0, 5_000)).toBe(0);
    expect(remainingMs(6_000, 0, 5_000)).toBe(1_000);
  });
});

describe("secondsLeft", () => {
  it("redondea hacia arriba para no mostrar 0 mientras queda tiempo", () => {
    expect(secondsLeft(14_001)).toBe(15);
    expect(secondsLeft(15_000)).toBe(15);
    expect(secondsLeft(200)).toBe(1);
    expect(secondsLeft(0)).toBe(0);
  });
});

describe("useCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("empieza con lo que falta y baja con el reloj", () => {
    let now = 0;
    const { result } = renderHook(() => useCountdown(15_000, 0, { now: () => now }));
    expect(result.current).toBe(15_000);

    now = 4_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(result.current).toBe(11_000);
  });

  it("aplica el desfase del reloj", () => {
    const now = 4_000; // el navegador marca 4 000, el servidor 10 000
    const { result } = renderHook(() => useCountdown(20_000, 6_000, { now: () => now }));
    expect(result.current).toBe(10_000);
  });

  it("se detiene en cero", () => {
    let now = 0;
    const { result } = renderHook(() => useCountdown(1_000, 0, { now: () => now }));
    now = 5_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(result.current).toBe(0);
  });

  it("sin plazo vale cero y no programa temporizadores", () => {
    const { result } = renderHook(() => useCountdown(null, 0));
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("al cambiar el plazo recalcula de inmediato", () => {
    const now = 0;
    const { result, rerender } = renderHook(({ deadline }) => useCountdown(deadline, 0, { now: () => now }), {
      initialProps: { deadline: 5_000 as number | null },
    });
    expect(result.current).toBe(5_000);
    rerender({ deadline: 15_000 });
    expect(result.current).toBe(15_000);
  });

  it("al desmontarse limpia su temporizador", () => {
    const { unmount } = renderHook(() => useCountdown(15_000, 0, { now: () => 0 }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
