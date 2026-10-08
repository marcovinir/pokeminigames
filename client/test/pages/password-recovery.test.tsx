import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { LoginPage } from "../../src/pages/AuthPages";
import { ForgotPasswordPage, ResetPasswordPage } from "../../src/pages/PasswordRecoveryPages";
import { validateReset } from "../../src/pages/auth-validation";
import { fakeServices, renderRoute } from "../helpers/services";

afterEach(() => vi.useRealTimers());

/** Solo el reloj y los intervalos: con setTimeout simulado, findBy* de Testing Library no avanzaría nunca. */
const FAKE: { toFake: ("setInterval" | "clearInterval" | "Date")[] } = { toFake: ["setInterval", "clearInterval", "Date"] };

type Services = ReturnType<typeof fakeServices>;

describe("validateReset", () => {
  it("pide un email válido, un código de seis dígitos y una contraseña de 8 a 72 bytes", () => {
    expect(validateReset({ email: "ash@example.com", code: "123456", password: "nueva-clave-1" })).toEqual({});
    expect(validateReset({ email: "ash", code: "123", password: "corta" })).toEqual({
      email: "Escribe un email válido.",
      code: "El código son 6 dígitos.",
      password: "La contraseña debe tener al menos 8 caracteres.",
    });
    expect(validateReset({ email: "ash@example.com", code: "123456", password: "ñ".repeat(37) }).password).toContain("72 bytes");
  });
});

function renderForgot(services: Services = fakeServices()) {
  const utils = renderRoute("/olvide", <ForgotPasswordPage />, { services, route: "/olvide" });
  return { ...utils, services, user: userEvent.setup() };
}

describe("pantalla «Recupera tu contraseña»", () => {
  it("explica qué pasa, pide el correo y deja volver al inicio de sesión", () => {
    renderForgot();
    expect(screen.getByRole("heading", { name: "Recupera tu contraseña" })).toBeInTheDocument();
    expect(screen.getByText("Escribe el correo de tu cuenta y te enviamos un código.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("con un correo inválido lo marca y no llama al servidor", async () => {
    const { services, user } = renderForgot();
    await user.type(screen.getByLabelText("Email"), "ash");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe un email válido.");
    expect(services.endpoints.auth.forgotPassword).not.toHaveBeenCalled();
  });

  it("pide el código con el correo recortado y sigue a /restablecer con el correo y el aviso de siempre", async () => {
    const { services, user } = renderForgot();
    await user.type(screen.getByLabelText("Email"), "  ash@example.com ");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/restablecer"));
    expect(services.endpoints.auth.forgotPassword).toHaveBeenCalledWith("ash@example.com");
    expect(JSON.parse(screen.getByTestId("location").dataset.state!)).toEqual({
      email: "ash@example.com",
      notice: "Si existe una cuenta con ese correo, te enviamos un código.",
    });
  });

  it("si el servidor pide esperar lo dice con los segundos y no sigue", async () => {
    const { services, user } = renderForgot();
    vi.mocked(services.endpoints.auth.forgotPassword).mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 45 }));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 45 s.");
    expect(screen.getByTestId("location")).toHaveTextContent("/olvide");
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeEnabled();
  });

  it("un fallo de red se explica sin nada técnico", async () => {
    const { services, user } = renderForgot();
    vi.mocked(services.endpoints.auth.forgotPassword).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
  });

  it("mientras envía no permite enviar dos veces", async () => {
    const { services, user } = renderForgot();
    let release!: () => void;
    vi.mocked(services.endpoints.auth.forgotPassword).mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(services.endpoints.auth.forgotPassword).toHaveBeenCalledTimes(1);
    release();
  });
});

function renderReset(state: { email?: string; notice?: string } | null = { email: "ash@example.com", notice: "Si existe una cuenta con ese correo, te enviamos un código." }, services: Services = fakeServices()) {
  const route = state === null ? "/restablecer" : { pathname: "/restablecer", state };
  const utils = renderRoute("/restablecer", <ResetPasswordPage />, { services, route });
  return { ...utils, services, user: userEvent.setup() };
}

async function fillReset(user: ReturnType<typeof userEvent.setup>, code = "123456", password = "nueva-clave-1") {
  await user.type(screen.getByLabelText("Código"), code);
  await user.type(screen.getByLabelText("Nueva contraseña"), password);
  await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
}

describe("pantalla «Nueva contraseña»", () => {
  it("muestra el aviso que trae, pide el código y la contraseña nueva, y deja volver al inicio de sesión", () => {
    renderReset();
    expect(screen.getByRole("heading", { name: "Nueva contraseña" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Si existe una cuenta con ese correo, te enviamos un código.");
    expect(screen.getByLabelText("Código")).toHaveFocus();
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAccessibleDescription("Mínimo 8 caracteres.");
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("cambia la contraseña y vuelve al inicio de sesión con el aviso de éxito", async () => {
    const { services, user } = renderReset();
    await fillReset(user);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
    expect(services.endpoints.auth.resetPassword).toHaveBeenCalledWith({ email: "ash@example.com", code: "123456", password: "nueva-clave-1" });
    const state = JSON.parse(screen.getByTestId("location").dataset.state!);
    expect(state).toEqual({ notice: "Contraseña cambiada. Inicia sesión con la nueva." });
    expect(JSON.stringify(state)).not.toContain("nueva-clave-1");
    expect(services.session.getState().status).toBe("loading");
  });

  it("con datos inválidos marca cada campo y no llama al servidor", async () => {
    const { services, user } = renderReset();
    await fillReset(user, "123", "corta");
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "El código son 6 dígitos.",
      "La contraseña debe tener al menos 8 caracteres.",
    ]);
    expect(services.endpoints.auth.resetPassword).not.toHaveBeenCalled();
  });

  it("un código incorrecto se explica en español y se puede reintentar", async () => {
    const { services, user } = renderReset();
    vi.mocked(services.endpoints.auth.resetPassword).mockRejectedValueOnce(new ApiError(400, "INVALID_CODE"));
    await fillReset(user, "000000");
    expect(await screen.findByRole("alert")).toHaveTextContent("Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.");
    expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeEnabled();
    expect(screen.getByTestId("location")).toHaveTextContent("/restablecer");
  });

  it("los errores de contraseña del servidor se ponen junto al campo", async () => {
    const { services, user } = renderReset();
    vi.mocked(services.endpoints.auth.resetPassword).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", [{ path: "password", message: "La contraseña no puede superar 72 bytes" }]),
    );
    await fillReset(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña no puede superar 72 bytes");
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute("aria-invalid", "true");
  });

  it("sin el correo (se recargó la página) lo pide además del código y la contraseña", async () => {
    const { services, user } = renderReset(null);
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await fillReset(user);
    await waitFor(() =>
      expect(services.endpoints.auth.resetPassword).toHaveBeenCalledWith({ email: "ash@example.com", code: "123456", password: "nueva-clave-1" }),
    );
  });

  it("pegar «123 456» deja 123456 en el campo del código", async () => {
    const { user } = renderReset();
    await user.click(screen.getByLabelText("Código"));
    await user.paste("123 456");
    expect(screen.getByLabelText("Código")).toHaveValue("123456");
  });

  it("mientras envía no permite enviar dos veces", async () => {
    const { services, user } = renderReset();
    let release!: () => void;
    vi.mocked(services.endpoints.auth.resetPassword).mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    await fillReset(user);
    expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(services.endpoints.auth.resetPassword).toHaveBeenCalledTimes(1);
    release();
  });
});

describe("reenviar el código para cambiar la contraseña", () => {
  it("al llegar ya se envió uno: espera 60 s; luego pide otro con el mismo correo y lo dice sin asegurar nada", async () => {
    vi.useFakeTimers(FAKE);
    const { services, user } = renderReset();
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toHaveTextContent("Reenviar código (espera 60 s)");
    act(() => void vi.advanceTimersByTime(60_000));

    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(services.endpoints.auth.forgotPassword).toHaveBeenCalledWith("ash@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent("Si existe una cuenta con ese correo, te enviamos un código nuevo.");
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeDisabled();
  });

  it("si el servidor pide esperar lo dice", async () => {
    vi.useFakeTimers(FAKE);
    const { services, user } = renderReset();
    act(() => void vi.advanceTimersByTime(60_000));
    vi.mocked(services.endpoints.auth.forgotPassword).mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 20 }));
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 20 s.");
  });
});

describe("el inicio de sesión ofrece recuperar la contraseña", () => {
  function renderLogin(options: { emailVerification: boolean; state?: unknown }) {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.options).mockResolvedValue({ emailVerification: options.emailVerification });
    const route = options.state === undefined ? "/login" : { pathname: "/login", state: options.state };
    renderRoute("/login", <LoginPage />, { services, route });
    return { services, user: userEvent.setup() };
  }

  it("con la verificación activa aparece «¿Olvidaste tu contraseña?», que lleva a /olvide", async () => {
    renderLogin({ emailVerification: true });
    expect(await screen.findByRole("link", { name: "¿Olvidaste tu contraseña?" })).toHaveAttribute("href", "/olvide");
  });

  it("con la verificación apagada no aparece (todo como antes)", async () => {
    const { services } = renderLogin({ emailVerification: false });
    await waitFor(() => expect(services.endpoints.auth.options).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "¿Olvidaste tu contraseña?" })).not.toBeInTheDocument();
  });

  it("muestra el aviso de éxito que trae al volver de cambiar la contraseña", () => {
    renderLogin({ emailVerification: false, state: { notice: "Contraseña cambiada. Inicia sesión con la nueva." } });
    expect(screen.getByRole("status")).toHaveTextContent("Contraseña cambiada. Inicia sesión con la nueva.");
  });

  it("sin aviso no hay ningún mensaje", () => {
    renderLogin({ emailVerification: false });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
