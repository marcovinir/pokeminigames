import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingScreen, SLOW_START_MS } from "../../src/components/LoadingScreen";
import { AppRoutes } from "../../src/routes";
import { fakeServices, renderWithServices } from "../helpers/services";

const HINT = "El servidor se está despertando, puede tardar hasta un minuto…";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("LoadingScreen", () => {
  it("al principio solo dice que está cargando", () => {
    render(<LoadingScreen />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("pasados 5 segundos avisa de que el servidor se está despertando", () => {
    expect(SLOW_START_MS).toBe(5000);
    render(<LoadingScreen />);
    act(() => void vi.advanceTimersByTime(SLOW_START_MS - 1));
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(HINT);
  });

  it("si se desmonta antes, no deja un temporizador pendiente", () => {
    const { unmount } = render(<LoadingScreen />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("la pantalla de carga de la sesión", () => {
  it("muestra el aviso si recuperar la sesión tarda, y desaparece cuando el servidor responde", () => {
    const services = fakeServices();
    renderWithServices(<AppRoutes />, { services, route: "/" });
    expect(services.session.getState().status).toBe("loading");
    act(() => void vi.advanceTimersByTime(SLOW_START_MS));
    expect(screen.getByText(HINT)).toBeInTheDocument();

    act(() => services.session.setState({ status: "anonymous", user: null }));
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });
});
