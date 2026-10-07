import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/api/client";
import { LoginPage, RegisterPage } from "../../src/pages/AuthPages";
import { fakeServices, renderWithServices } from "../helpers/services";

async function fillLogin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "ash@example.com");
  await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("demasiados intentos en el formulario de acceso", () => {
  it("el 429 se explica en español y dice cuánto esperar", async () => {
    const services = fakeServices();
    services.endpoints.auth.login = async () => {
      throw new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 540 });
    };
    renderWithServices(<LoginPage />, { services });
    const user = userEvent.setup();
    await fillLogin(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 9 min.");
  });

  it("si el servidor no informa la espera, no inventa una", async () => {
    const services = fakeServices();
    services.endpoints.auth.login = async () => {
      throw new ApiError(429, "RATE_LIMITED");
    };
    renderWithServices(<LoginPage />, { services });
    const user = userEvent.setup();
    await fillLogin(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo más tarde.");
  });

  it("el botón vuelve a estar disponible para reintentar cuando pase el tiempo", async () => {
    const services = fakeServices();
    services.endpoints.auth.login = async () => {
      throw new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 30 });
    };
    renderWithServices(<LoginPage />, { services });
    const user = userEvent.setup();
    await fillLogin(user);
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("el registro también explica el 429", async () => {
    const services = fakeServices();
    services.endpoints.auth.register = async () => {
      throw new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 3000 });
    };
    renderWithServices(<RegisterPage />, { services });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Nombre de usuario"), "ash");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 50 min.");
  });

  it("los otros errores siguen mostrando su propio mensaje", async () => {
    const services = fakeServices();
    services.endpoints.auth.login = async () => {
      throw new ApiError(401, "INVALID_CREDENTIALS");
    };
    renderWithServices(<LoginPage />, { services });
    const user = userEvent.setup();
    await fillLogin(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
  });
});
