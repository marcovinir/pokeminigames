import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { CodeField, digitsOnly } from "../../src/components/CodeField";
import { LoginPage, RegisterPage } from "../../src/pages/AuthPages";
import { VerifyEmailPage } from "../../src/pages/VerifyEmailPage";
import { validateVerification } from "../../src/pages/auth-validation";
import { useCooldown } from "../../src/pages/use-cooldown";
import { ASH, fakeServices, renderRoute } from "../helpers/services";

/** Solo el reloj y los intervalos: con setTimeout simulado, findBy* de Testing Library no avanzaría nunca. */
const FAKE: { toFake: ("setInterval" | "clearInterval" | "Date")[] } = { toFake: ["setInterval", "clearInterval", "Date"] };

afterEach(() => vi.useRealTimers());

describe("digitsOnly", () => {
  it("deja solo los dígitos, como mucho seis, también al pegar con espacios o guiones", () => {
    expect(digitsOnly("123456")).toBe("123456");
    expect(digitsOnly("123 456")).toBe("123456");
    expect(digitsOnly("123-456")).toBe("123456");
    expect(digitsOnly("12a3b4")).toBe("1234");
    expect(digitsOnly("1234567890")).toBe("123456");
    expect(digitsOnly(" código: 048213 ")).toBe("048213");
    expect(digitsOnly("")).toBe("");
  });
});

describe("CodeField", () => {
  it("es un campo numérico que el navegador y el teléfono reconocen como código de un solo uso", () => {
    renderRoute("/x", <CodeField value="" onChange={() => {}} />, { route: "/x" });
    const field = screen.getByLabelText("Código");
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    // Sin maxlength: pegar «123 456» (7 caracteres) no debe cortarse antes de limpiarlo.
    expect(field).not.toHaveAttribute("maxlength");
  });

  it("al escribir o pegar entrega solo los dígitos", async () => {
    const onChange = vi.fn();
    renderRoute("/x", <CodeField value="" onChange={onChange} />, { route: "/x" });
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Código"));
    await user.paste("123 456");
    expect(onChange).toHaveBeenLastCalledWith("123456");
  });
});

describe("validateVerification", () => {
  it("pide un email válido y un código de seis dígitos", () => {
    expect(validateVerification({ email: "ash@example.com", code: "123456" })).toEqual({});
    expect(validateVerification({ email: "ash", code: "12345" })).toEqual({
      email: "Escribe un email válido.",
      code: "El código son 6 dígitos.",
    });
    expect(validateVerification({ email: "ash@example.com", code: "" }).code).toBe("El código son 6 dígitos.");
  });
});

describe("useCooldown", () => {
  it("empieza en 0, cuenta hacia atrás de segundo en segundo al arrancarla y se puede reiniciar", () => {
    vi.useFakeTimers(FAKE);
    const { result } = renderHook(() => useCooldown());
    expect(result.current.remaining).toBe(0);

    act(() => result.current.start(3));
    expect(result.current.remaining).toBe(3);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current.remaining).toBe(0);

    act(() => result.current.start(60));
    expect(result.current.remaining).toBe(60);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current.remaining).toBe(50);
    act(() => result.current.start(5));
    expect(result.current.remaining).toBe(5);
  });

  it("puede empezar ya en marcha", () => {
    vi.useFakeTimers(FAKE);
    const { result } = renderHook(() => useCooldown(60));
    expect(result.current.remaining).toBe(60);
  });

  it("no deja temporizadores vivos: ni al terminar ni al desmontarse", () => {
    vi.useFakeTimers(FAKE);
    const { result, unmount } = renderHook(() => useCooldown());
    act(() => result.current.start(2));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => void vi.advanceTimersByTime(2000));
    expect(vi.getTimerCount()).toBe(0);

    act(() => result.current.start(30));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

type Services = ReturnType<typeof fakeServices>;

function renderVerify(
  state: { email?: string; notice?: string; returnTo?: string } | null = { email: "ash@example.com" },
  services: Services = fakeServices(),
) {
  const route = state === null ? "/verificar" : { pathname: "/verificar", state };
  const utils = renderRoute("/verificar", <VerifyEmailPage />, { services, route });
  return { user: userEvent.setup(), ...utils };
}

describe("pantalla «Verifica tu correo»", () => {
  it("dice a qué correo llegó el código y tiene el campo, el botón, el reenvío y la salida para usar otro correo", () => {
    renderVerify();
    expect(screen.getByRole("heading", { name: "Verifica tu correo" })).toBeInTheDocument();
    expect(screen.getByText("Te enviamos un código de 6 dígitos a ash@example.com. Escríbelo aquí.")).toBeInTheDocument();
    expect(screen.getByLabelText("Código")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Verificar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Usar otro correo" })).toHaveAttribute("href", "/registro");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("muestra el aviso que trae la pantalla de la que se viene (entrar sin haber verificado)", () => {
    renderVerify({ email: "ash@example.com", notice: "Tu correo aún no está verificado. Te enviamos un código." });
    expect(screen.getByRole("status")).toHaveTextContent("Tu correo aún no está verificado. Te enviamos un código.");
  });

  it("sin el correo (se recargó la página) lo pide además del código", async () => {
    const { services, user } = renderVerify(null);
    expect(screen.getByText("Escribe tu correo y el código de 6 dígitos que te enviamos.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(services.endpoints.auth.verifyEmail).toHaveBeenCalledWith({ email: "ash@example.com", code: "123456" }));
  });

  it("verifica con el código, abre la sesión y va al lobby", async () => {
    const { services, user } = renderVerify();
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(services.endpoints.auth.verifyEmail).toHaveBeenCalledWith({ email: "ash@example.com", code: "123456" });
    expect(services.session.getState()).toMatchObject({ status: "authenticated", user: ASH });
  });

  it("si se venía de una pantalla que pedía sesión (una sala, por ejemplo), tras verificar vuelve a ella", async () => {
    const { user } = renderVerify({ email: "ash@example.com", returnTo: "/sala/ABC234" });
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
  });

  it("pegar «123 456» deja 123456 en el campo", async () => {
    const { user } = renderVerify();
    await user.click(screen.getByLabelText("Código"));
    await user.paste("123 456");
    expect(screen.getByLabelText("Código")).toHaveValue("123456");
  });

  it("con un código incompleto marca el campo y no llama al servidor", async () => {
    const { services, user } = renderVerify();
    await user.type(screen.getByLabelText("Código"), "123");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("El código son 6 dígitos.");
    expect(screen.getByLabelText("Código")).toHaveAttribute("aria-invalid", "true");
    expect(services.endpoints.auth.verifyEmail).not.toHaveBeenCalled();
  });

  it("un código incorrecto se explica en español y se puede reintentar", async () => {
    const { services, user } = renderVerify();
    vi.mocked(services.endpoints.auth.verifyEmail).mockRejectedValueOnce(new ApiError(400, "INVALID_CODE"));
    await user.type(screen.getByLabelText("Código"), "000000");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.");
    expect(screen.getByRole("button", { name: "Verificar" })).toBeEnabled();
    expect(screen.getByTestId("location")).toHaveTextContent("/verificar");
  });

  it("si el servidor pide esperar lo dice con los segundos", async () => {
    const { services, user } = renderVerify();
    vi.mocked(services.endpoints.auth.verifyEmail).mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 90 }));
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 2 min.");
  });

  it("mientras envía no permite enviar dos veces", async () => {
    const { services, user } = renderVerify();
    let release!: () => void;
    vi.mocked(services.endpoints.auth.verifyEmail).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ user: ASH, accessToken: "t" }))),
    );
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(screen.getByRole("button", { name: "Verificar" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(services.endpoints.auth.verifyEmail).toHaveBeenCalledTimes(1);
    release();
  });
});

describe("reenviar el código", () => {
  function renderWithClock(state: { email?: string } | null = { email: "ash@example.com" }) {
    vi.useFakeTimers(FAKE);
    const services = fakeServices();
    const utils = renderRoute("/verificar", <VerifyEmailPage />, { services, route: state === null ? "/verificar" : { pathname: "/verificar", state } });
    return { ...utils, services, user: userEvent.setup() };
  }

  it("al llegar desde el registro ya se envió un código: el botón espera 60 s y luego se activa", async () => {
    renderWithClock();
    const button = screen.getByRole("button", { name: /Reenviar código/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Reenviar código (espera 60 s)");
    act(() => void vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toHaveTextContent("espera 30 s");
    act(() => void vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("button", { name: "Reenviar código" })).toBeEnabled();
  });

  it("al reenviar pide el código para ese correo, lo avisa y vuelve a esperar", async () => {
    const { services, user } = renderWithClock();
    act(() => void vi.advanceTimersByTime(60_000));
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(services.endpoints.auth.resendCode).toHaveBeenCalledWith("ash@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent("Te enviamos un código nuevo a ash@example.com.");
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeDisabled();
  });

  it("si el servidor pide esperar lo dice (y no dispara dos peticiones)", async () => {
    const { services, user } = renderWithClock();
    act(() => void vi.advanceTimersByTime(60_000));
    vi.mocked(services.endpoints.auth.resendCode).mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 40 }));
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 40 s.");
    expect(services.endpoints.auth.resendCode).toHaveBeenCalledTimes(1);
  });

  it("sin el correo (se recargó la página) el reenvío está disponible y pide el correo escrito", async () => {
    const { services, user } = renderWithClock(null);
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(services.endpoints.auth.resendCode).toHaveBeenCalledWith("ash@example.com");
  });

  it("sin correo escrito no reenvía y lo dice", async () => {
    const { services, user } = renderWithClock(null);
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe un email válido.");
    expect(services.endpoints.auth.resendCode).not.toHaveBeenCalled();
  });
});

describe("el registro y el inicio de sesión llevan a verificar", () => {
  it("registrarse con la verificación activa lleva a /verificar con el correo, sin abrir sesión", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.register).mockResolvedValueOnce({ verification: "required", email: "ash@example.com" });
    renderRoute("/registro", <RegisterPage />, { services, route: "/registro" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Nombre de usuario"), "ash");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/verificar"));
    expect(JSON.parse(screen.getByTestId("location").dataset.state!)).toEqual({ email: "ash@example.com" });
    expect(services.session.getState().status).toBe("loading");
  });

  it("entrar sin haber verificado lleva a /verificar con el correo y el aviso", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new ApiError(403, "EMAIL_NOT_VERIFIED"));
    renderRoute("/login", <LoginPage />, { services, route: "/login" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/verificar"));
    expect(JSON.parse(screen.getByTestId("location").dataset.state!)).toEqual({
      email: "ash@example.com",
      notice: "Tu correo aún no está verificado. Te enviamos un código.",
      returnTo: "/",
    });
  });

  it("entrar sin haber verificado desde una pantalla que pedía sesión recuerda a dónde se iba", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new ApiError(403, "EMAIL_NOT_VERIFIED"));
    renderRoute("/login", <LoginPage />, {
      services,
      route: { pathname: "/login", state: { from: { pathname: "/sala/ABC234" } } },
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/verificar"));
    expect(JSON.parse(screen.getByTestId("location").dataset.state!)).toMatchObject({ email: "ash@example.com", returnTo: "/sala/ABC234" });
  });

  it("los demás errores del login se siguen mostrando en el formulario", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new ApiError(401, "INVALID_CREDENTIALS"));
    renderRoute("/login", <LoginPage />, { services, route: "/login" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "mala");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });
});
