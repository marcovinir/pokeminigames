import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountUp, useReducedMotion } from "../../src/game/motion";

type Listener = () => void;

/** Un matchMedia de mentira que deja cambiar la preferencia y avisa a quien escucha. */
function mockMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const media = {
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => media);
  return {
    set(value: boolean) {
      matches = value;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useReducedMotion", () => {
  it("lee la preferencia del sistema", () => {
    mockMedia(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });

  it("sin matchMedia (pruebas, navegadores viejos) asume que el movimiento está permitido", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it("reacciona cuando la preferencia cambia y deja de escuchar al desmontar", () => {
    const media = mockMedia(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});

describe("useCountUp", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("empieza en el valor inicial, sin animar", () => {
    mockMedia(false);
    expect(renderHook(() => useCountUp(300)).result.current).toBe(300);
  });

  it("al cambiar el valor sube poco a poco y termina exactamente en el nuevo", () => {
    mockMedia(false);
    let t = 0;
    const now = () => t;
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, { durationMs: 500, now }), { initialProps: { target: 0 } });
    rerender({ target: 100 });

    t = 250;
    act(() => void vi.advanceTimersByTime(16));
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);

    t = 500;
    act(() => void vi.advanceTimersByTime(16));
    expect(result.current).toBe(100);
  });

  it("si el valor cambia a mitad de camino sigue desde donde iba, no desde el principio", () => {
    mockMedia(false);
    let t = 0;
    const now = () => t;
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, { durationMs: 500, now }), { initialProps: { target: 0 } });
    rerender({ target: 100 });
    t = 250;
    act(() => void vi.advanceTimersByTime(16));
    const halfway = result.current;
    expect(halfway).toBeGreaterThan(0);
    rerender({ target: 200 });
    t = 260;
    act(() => void vi.advanceTimersByTime(16));
    expect(result.current).toBeGreaterThanOrEqual(halfway);
    t = 760;
    act(() => void vi.advanceTimersByTime(16));
    expect(result.current).toBe(200);
  });

  it("con «reducir movimiento» salta directo al valor final", () => {
    mockMedia(true);
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, { durationMs: 500 }), { initialProps: { target: 0 } });
    rerender({ target: 100 });
    expect(result.current).toBe(100);
  });

  it("no deja temporizadores vivos al desmontar", () => {
    mockMedia(false);
    let t = 0;
    const { rerender, unmount } = renderHook(({ target }) => useCountUp(target, { durationMs: 500, now: () => t }), { initialProps: { target: 0 } });
    rerender({ target: 100 });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
