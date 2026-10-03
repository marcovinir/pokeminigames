import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { LoginPage, RegisterPage } from "../../src/pages/AuthPages";
import { serverFieldErrors, validateLogin, validateRegistration } from "../../src/pages/auth-validation";
import { ASH, fakeServices, renderRoute } from "../helpers/services";

describe("validación de los formularios", () => {
  it("login exige un email válido y una contraseña", () => {
    expect(validateLogin({ email: "ash@example.com", password: "x" })).toEqual({});
    expect(validateLogin({ email: "ash", password: "" })).toEqual({
      email: "Escribe un email válido.",
      password: "Escribe tu contraseña.",
    });
    expect(validateLogin({ email: "a b@example.com", password: "x" }).email).toBeDefined();
  });

  it("el registro acepta datos válidos", () => {
    expect(validateRegistration({ email: "ash@example.com", username: "ash_01", password: "pikachu-123" })).toEqual({});
  });

  it.each([
    ["usuario muy corto", { username: "ab" }, "username"],
    ["usuario muy largo", { username: "a".repeat(31) }, "username"],
    ["usuario con espacios", { username: "ash ketchum" }, "username"],
    ["usuario con signos", { username: "ash<3" }, "username"],
    ["contraseña corta", { password: "1234567" }, "password"],
    ["email sin dominio", { email: "ash@example" }, "email"],
  ])("rechaza %s", (_name, override, field) => {
    const errors = validateRegistration({ email: "ash@example.com", username: "ash", password: "pikachu-123", ...override });
    expect(errors[field as "email" | "username" | "password"]).toBeDefined();
  });

  it("rechaza una contraseña de más de 72 bytes aunque tenga menos de 72 caracteres", () => {
    const password = "ñ".repeat(37); // 37 caracteres, 74 bytes
    const errors = validateRegistration({ email: "ash@example.com", username: "ash", password });
    expect(errors.password).toContain("72 bytes");
    expect(validateRegistration({ email: "ash@example.com", username: "ash", password: "ñ".repeat(36) }).password).toBeUndefined();
  });

  it("serverFieldErrors toma los errores por campo de un 400 del servidor", () => {
    const error = new ApiError(400, "VALIDATION_ERROR", [
      { path: "email", message: "Email inválido" },
      { path: "password", message: "Muy corta" },
      { path: "algo", message: "ignorado" },
    ]);
    expect(serverFieldErrors(error)).toEqual({ email: "Email inválido", password: "Muy corta" });
  });

  it("serverFieldErrors no hace nada con otros errores", () => {
    expect(serverFieldErrors(new ApiError(409, "EMAIL_TAKEN"))).toEqual({});
    expect(serverFieldErrors(new ApiError(400, "VALIDATION_ERROR"))).toEqual({});
  });
});

function renderLogin(options: { route?: string | { pathname: string; state?: unknown } } = {}) {
  const services = fakeServices();
  const utils = renderRoute("/login", <LoginPage />, { services, route: options.route ?? "/login" });
  return { user: userEvent.setup(), ...utils };
}

describe("página de inicio de sesión", () => {
  it("muestra el formulario con sus campos etiquetados y un enlace al registro", () => {
    renderLogin();
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByRole("link", { name: "Crea una" })).toHaveAttribute("href", "/registro");
  });

  it("con datos inválidos muestra los errores y no llama al servidor", async () => {
    const { services, user } = renderLogin();
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["Escribe un email válido.", "Escribe tu contraseña."]);
    expect(services.endpoints.auth.login).not.toHaveBeenCalled();
  });

  it("los errores de un campo desaparecen al corregirlo", async () => {
    const { user } = renderLogin();
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await user.type(screen.getByLabelText("Email"), "a");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("inicia sesión con el email recortado y va al lobby", async () => {
    const { services, user } = renderLogin();
    await user.type(screen.getByLabelText("Email"), "  ash@example.com ");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/"));
    expect(services.endpoints.auth.login).toHaveBeenCalledWith({ email: "ash@example.com", password: "pikachu-123" });
    expect(services.session.getState()).toMatchObject({ status: "authenticated", user: ASH });
    expect(screen.getByText("Otra pantalla")).toBeInTheDocument();
  });

  it("vuelve a la pantalla que se intentaba abrir antes de pedir el inicio de sesión", async () => {
    const { user } = renderLogin({ route: { pathname: "/login", state: { from: { pathname: "/sala/ABC234" } } } });
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
  });

  it("si el servidor rechaza las credenciales lo muestra en español y se puede reintentar", async () => {
    const { services, user } = renderLogin();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new ApiError(401, "INVALID_CREDENTIALS"));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "mala");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("mientras envía no permite enviar dos veces", async () => {
    const { services, user } = renderLogin();
    let release!: () => void;
    vi.mocked(services.endpoints.auth.login).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ user: ASH, accessToken: "t" }))),
    );
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(services.endpoints.auth.login).toHaveBeenCalledTimes(1);
    release();
  });

  it("un fallo de red se explica sin mostrar nada técnico", async () => {
    const { services, user } = renderLogin();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
  });

  it("un error inesperado (no de la API) muestra un mensaje genérico", async () => {
    const { services, user } = renderLogin();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new Error("boom interno"));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Algo falló en el servidor");
    expect(alert).not.toHaveTextContent("boom");
  });
});

function renderRegister() {
  const services = fakeServices();
  const utils = renderRoute("/registro", <RegisterPage />, { services, route: "/registro" });
  return { user: userEvent.setup(), ...utils };
}

async function fillRegistration(user: ReturnType<typeof userEvent.setup>, values = { email: "ash@example.com", username: "ash", password: "pikachu-123" }) {
  await user.type(screen.getByLabelText("Email"), values.email);
  await user.type(screen.getByLabelText("Nombre de usuario"), values.username);
  await user.type(screen.getByLabelText("Contraseña"), values.password);
  await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

describe("página de registro", () => {
  it("pide email, usuario y contraseña, con ayudas y un enlace al inicio de sesión", () => {
    renderRegister();
    expect(screen.getByLabelText("Nombre de usuario")).toHaveAccessibleDescription("De 3 a 30 letras, números o guion bajo.");
    expect(screen.getByLabelText("Contraseña")).toHaveAccessibleDescription("Mínimo 8 caracteres.");
    expect(screen.getByRole("link", { name: "Inicia sesión" })).toHaveAttribute("href", "/login");
  });

  it("con datos inválidos marca cada campo y no llama al servidor", async () => {
    const { services, user } = renderRegister();
    await fillRegistration(user, { email: "ash", username: "a", password: "123" });
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(services.endpoints.auth.register).not.toHaveBeenCalled();
  });

  it("crea la cuenta y va al lobby", async () => {
    const { services, user } = renderRegister();
    await fillRegistration(user);
    await waitFor(() => expect(services.endpoints.auth.register).toHaveBeenCalledWith({ email: "ash@example.com", username: "ash", password: "pikachu-123" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/"));
    expect(services.session.getState().status).toBe("authenticated");
  });

  it("un email ya registrado se explica en español", async () => {
    const { services, user } = renderRegister();
    vi.mocked(services.endpoints.auth.register).mockRejectedValueOnce(new ApiError(409, "EMAIL_TAKEN"));
    await fillRegistration(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese email ya está registrado.");
  });

  it("un usuario ya en uso se explica en español", async () => {
    const { services, user } = renderRegister();
    vi.mocked(services.endpoints.auth.register).mockRejectedValueOnce(new ApiError(409, "USERNAME_TAKEN"));
    await fillRegistration(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese nombre de usuario ya está en uso.");
  });

  it("los errores por campo que devuelve el servidor se ponen junto a cada campo", async () => {
    const { services, user } = renderRegister();
    vi.mocked(services.endpoints.auth.register).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", [{ path: "username", message: "Usa de 3 a 30 letras, números o guion bajo." }]),
    );
    await fillRegistration(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Usa de 3 a 30 letras");
    expect(screen.getByLabelText("Nombre de usuario")).toHaveAttribute("aria-invalid", "true");
  });
});
