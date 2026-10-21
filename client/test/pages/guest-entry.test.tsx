import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { rateLimitMessage } from "../../src/i18n/es";
import { LoginPage } from "../../src/pages/AuthPages";
import { validateGuestName } from "../../src/pages/auth-validation";
import { GUEST, fakeServices, renderRoute } from "../helpers/services";

const NAME_ERROR = "Usa de 3 a 30 letras, números o guion bajo.";

function setup(route: string | { pathname: string; state?: unknown } = "/login") {
  const services = fakeServices();
  const utils = renderRoute("/login", <LoginPage />, { services, route });
  const user = userEvent.setup();
  const nameField = () => screen.getByLabelText("Nombre");
  const enter = () => user.click(screen.getByRole("button", { name: "Entrar como invitado" }));
  return { guest: vi.mocked(services.endpoints.auth.guest), user, nameField, enter, ...utils };
}

describe("validateGuestName", () => {
  it("acepta de 3 a 30 letras, números o guion bajo, con espacios en los extremos", () => {
    for (const name of ["abc", "a".repeat(30), "ash_01", "  ash  "]) expect(validateGuestName(name), name).toBeUndefined();
  });

  it("rechaza lo demás con el mensaje de siempre", () => {
    for (const name of ["", "ab", "a".repeat(31), "a b", "ash🙂", "ñandú", "a-b"]) expect(validateGuestName(name), name).toBe(NAME_ERROR);
  });
});

describe("entrar como invitado desde /login", () => {
  it("muestra «¿Sin cuenta? Juega como invitado» con el campo «Nombre» y el botón «Entrar como invitado»", () => {
    setup();
    expect(screen.getByRole("heading", { name: "¿Sin cuenta? Juega como invitado" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar como invitado" })).toBeInTheDocument();
    // El formulario de la cuenta sigue ahí, intacto.
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("solo está en /login, no en el registro", async () => {
    const { RegisterPage } = await import("../../src/pages/AuthPages");
    renderRoute("/registro", <RegisterPage />, { route: "/registro" });
    expect(screen.queryByRole("button", { name: "Entrar como invitado" })).toBeNull();
  });

  it("un nombre inválido ('ab', 31 letras, 'a b', emoji) muestra el error y no llama al servidor", async () => {
    const { user, nameField, enter, guest } = setup();
    for (const name of ["ab", "a".repeat(31), "a b", "ash🙂"]) {
      await user.clear(nameField());
      await user.type(nameField(), name);
      await enter();
      expect(await screen.findByText(NAME_ERROR), name).toBeInTheDocument();
    }
    expect(guest).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("un nombre vacío también se rechaza, y el error desaparece al volver a escribir", async () => {
    const { user, nameField, enter, guest } = setup();
    await enter();
    expect(await screen.findByText(NAME_ERROR)).toBeInTheDocument();
    await user.type(nameField(), "i");
    expect(screen.queryByText(NAME_ERROR)).toBeNull();
    expect(guest).not.toHaveBeenCalled();
  });

  it("un nombre válido (con espacios en los extremos) llama a loginAsGuest con el nombre recortado y lleva al lobby", async () => {
    const { user, nameField, enter, guest, services } = setup();
    await user.type(nameField(), "  inv_1  ");
    await enter();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(guest).toHaveBeenCalledTimes(1);
    expect(guest).toHaveBeenCalledWith("inv_1");
    expect(services.session.getState()).toMatchObject({ status: "authenticated", user: { ...GUEST, username: "inv_1" } });
  });

  it("si se iba a otra pantalla, vuelve a ella; Intro en el campo también entra", async () => {
    const { user, nameField } = setup({ pathname: "/login", state: { from: { pathname: "/sala/ABC234" } } });
    await user.type(nameField(), "inv_1{Enter}");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
  });

  it("un 429 muestra el mensaje de espera y se puede reintentar", async () => {
    const { user, nameField, enter, guest } = setup();
    guest.mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 90 }));
    await user.type(nameField(), "inv_1");
    await enter();
    expect(await screen.findByText(rateLimitMessage(90))).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");

    await enter();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(guest).toHaveBeenCalledTimes(2);
  });

  it("un error del servidor sin forma conocida se muestra como un aviso genérico", async () => {
    const { user, nameField, enter, guest } = setup();
    guest.mockRejectedValueOnce(new Error("se cayó"));
    await user.type(nameField(), "inv_1");
    await enter();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("pulsar dos veces seguidas envía una sola vez", async () => {
    const { user, nameField, guest } = setup();
    let release!: () => void;
    guest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ user: GUEST, accessToken: "tok" });
        }),
    );
    await user.type(nameField(), "inv_1");
    await user.dblClick(screen.getByRole("button", { name: "Entrar como invitado" }));
    expect(guest).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
  });
});
