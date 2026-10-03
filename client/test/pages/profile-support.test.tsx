import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatDate, formatPercent, formatPower, formatScore, winsLabel } from "../../src/pages/profile/format";
import { useLoad } from "../../src/pages/profile/use-load";

describe("formatos del perfil", () => {
  it("el porcentaje se redondea y lleva un espacio antes del signo; sin datos es un guion", () => {
    expect(formatPercent(0.6)).toBe("60 %");
    expect(formatPercent(2 / 3)).toBe("67 %");
    expect(formatPercent(0)).toBe("0 %");
    expect(formatPercent(1)).toBe("100 %");
    expect(formatPercent(null)).toBe("—");
  });

  it("el poder promedio lleva siempre un decimal, con coma; sin datos es un guion", () => {
    expect(formatPower(512.5)).toBe("512,5");
    expect(formatPower(450)).toBe("450,0");
    expect(formatPower(null)).toBe("—");
  });

  it("un puntaje se muestra tal cual; si no se guardó, un guion", () => {
    expect(formatScore(1534)).toBe("1534");
    expect(formatScore(0)).toBe("0");
    expect(formatScore(null)).toBe("—");
  });

  it("las veces ganadas concuerdan en singular y plural", () => {
    expect(winsLabel(1)).toBe("Ganado 1 vez");
    expect(winsLabel(2)).toBe("Ganado 2 veces");
    expect(winsLabel(10)).toBe("Ganado 10 veces");
  });

  it("la fecha se escribe en español con el año", () => {
    const text = formatDate("2026-09-30T12:00:00.000Z");
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/sept|set/i);
  });
});

describe("useLoad", () => {
  it("empieza cargando y pasa a listo con los datos", async () => {
    const { result } = renderHook(() => useLoad(async () => "datos", []));
    expect(result.current.state).toEqual({ status: "loading" });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "ready", data: "datos" });
  });

  it("si falla, pasa a error con lo que se lanzó", async () => {
    const error = new Error("falló");
    const { result } = renderHook(() => useLoad(async () => Promise.reject(error), []));
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "error", error });
  });

  it("reload vuelve a cargar, pasando otra vez por cargando", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce("bien");
    const { result } = renderHook(() => useLoad(load, []));
    await act(async () => {});
    expect(result.current.state.status).toBe("error");
    act(() => result.current.reload());
    expect(result.current.state).toEqual({ status: "loading" });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "ready", data: "bien" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("al cambiar los datos de entrada vuelve a cargar", async () => {
    const load = vi.fn(async (key: string) => `datos de ${key}`);
    const { result, rerender } = renderHook(({ key }) => useLoad(() => load(key), [key]), { initialProps: { key: "a" } });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "ready", data: "datos de a" });
    rerender({ key: "b" });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "ready", data: "datos de b" });
  });

  it("ignora la respuesta vieja que llega después de haber cambiado los datos de entrada", async () => {
    const pending: Record<string, (value: string) => void> = {};
    const load = (key: string) => new Promise<string>((resolve) => void (pending[key] = resolve));
    const { result, rerender } = renderHook(({ key }) => useLoad(() => load(key), [key]), { initialProps: { key: "a" } });
    rerender({ key: "b" });
    await act(async () => pending.b!("B"));
    await act(async () => pending.a!("A")); // la de "a" llega tarde
    expect(result.current.state).toEqual({ status: "ready", data: "B" });
  });

  it("no actualiza nada si el componente ya se desmontó", async () => {
    let finish!: (value: string) => void;
    const { result, unmount } = renderHook(() => useLoad(() => new Promise<string>((resolve) => (finish = resolve)), []));
    unmount();
    await act(async () => finish("tarde"));
    expect(result.current.state).toEqual({ status: "loading" });
  });
});
