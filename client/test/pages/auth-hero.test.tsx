import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginPage, RegisterPage } from "../../src/pages/AuthPages";
import { renderWithServices } from "../helpers/services";

describe("pantallas de acceso (etapa 6)", () => {
  it.each([
    ["inicio de sesión", <LoginPage key="l" />, "Iniciar sesión"],
    ["registro", <RegisterPage key="r" />, "Crear cuenta"],
  ])("%s: junto al formulario hay un lema y una explicación breve de cómo se juega", (_name, page, heading) => {
    renderWithServices(page);
    expect(screen.getByText(/Nombra el Pokémon,/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Cómo se juega" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(steps).toHaveTextContent("15 segundos");
    expect(steps).toHaveTextContent("más stats");
  });

  it("la tarjeta de ejemplo es decorativa: la ocultan los lectores de pantalla y lleva dos tipos de muestra", () => {
    const { container } = renderWithServices(<LoginPage />);
    const preview = container.querySelector("[data-preview]")!;
    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(preview.querySelectorAll("[data-type]")).toHaveLength(2);
  });

  it("el formulario está en una tarjeta elevada y conserva sus campos y su botón", () => {
    renderWithServices(<LoginPage />);
    const card = screen.getByRole("heading", { name: "Iniciar sesión" }).closest("section")!;
    expect(card.className).toContain("shadow-pop");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crea una" })).toHaveAttribute("href", "/registro");
  });

  it("la explicación larga se oculta en pantallas estrechas; el lema se queda", () => {
    renderWithServices(<LoginPage />);
    const steps = screen.getByRole("list", { name: "Cómo se juega" });
    expect(steps.parentElement!.className).toContain("hidden");
    expect(steps.parentElement!.className).toContain("md:block");
    expect(screen.getByText(/Nombra el Pokémon,/).closest("[class*='hidden']")).toBeNull();
  });

  it("no añade avisos de estado que se mezclen con los del formulario", () => {
    renderWithServices(<LoginPage />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
