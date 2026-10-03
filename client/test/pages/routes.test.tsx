import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../../src/routes";
import { LocationProbe, fakeServices, renderWithServices, signIn } from "../helpers/services";

function renderApp(route: string, prepare?: (services: ReturnType<typeof fakeServices>) => void) {
  const services = fakeServices();
  prepare?.(services);
  const utils = renderWithServices(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { services, route },
  );
  return utils;
}

describe("rutas del perfil", () => {
  it("sin sesión, /perfil y /jugador/:username llevan a /login", async () => {
    for (const route of ["/perfil", "/jugador/misty"]) {
      const { unmount } = renderApp(route, (s) => s.session.setState({ status: "anonymous", user: null }));
      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
      unmount();
    }
  });

  it("con sesión, /perfil muestra el perfil propio", async () => {
    renderApp("/perfil", (s) => signIn(s));
    expect(await screen.findByRole("heading", { name: "Tu perfil" })).toBeInTheDocument();
  });

  it("con sesión, /jugador/:username muestra el perfil de esa persona", async () => {
    renderApp("/jugador/misty", (s) => signIn(s));
    expect(await screen.findByRole("heading", { name: "misty" })).toBeInTheDocument();
  });
});

describe("guardas de ruta", () => {
  it("mientras se recupera la sesión muestra una pantalla de carga, no el formulario", () => {
    renderApp("/");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByRole("heading", { name: "Iniciar sesión" })).not.toBeInTheDocument();
  });

  it("sin sesión, el lobby lleva a /login", async () => {
    const { services } = renderApp("/");
    services.session.setState({ status: "anonymous" });
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("sin sesión, una sala también lleva a /login y tras entrar se vuelve a ella", async () => {
    const { services } = renderApp("/sala/ABC234");
    services.session.setState({ status: "anonymous" });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
  });

  it("con sesión, /login y /registro llevan al lobby", async () => {
    renderApp("/login", (services) => signIn(services));
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("con sesión se ve el lobby", () => {
    renderApp("/", (services) => signIn(services));
    expect(screen.getByRole("heading", { name: "Lobby" })).toBeInTheDocument();
  });

  it("una ruta desconocida lleva al lobby (y de ahí a /login si no hay sesión)", async () => {
    const { services } = renderApp("/no-existe", (s) => signIn(s));
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    services.session.getState().expire();
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("si la sesión caduca mientras se está en el lobby, lleva a /login", async () => {
    const { services } = renderApp("/", (s) => signIn(s));
    expect(screen.getByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    services.session.getState().expire();
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });
});
