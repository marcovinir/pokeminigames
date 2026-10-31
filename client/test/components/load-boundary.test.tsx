import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoadBoundary } from "../../src/components/LoadBoundary";

function Broken(): never {
  throw new Error("Failed to fetch dynamically imported module");
}

describe("LoadBoundary", () => {
  it("si el contenido falla al cargar, lo dice y ofrece recargar en vez de dejar la aplicación en blanco", async () => {
    const onReload = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <>
        <p>Encabezado</p>
        <LoadBoundary onReload={onReload}>
          <Broken />
        </LoadBoundary>
      </>,
    );
    expect(screen.getByText("Encabezado")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar esta página.");
    await userEvent.click(screen.getByRole("button", { name: "Recargar" }));
    expect(onReload).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("si todo va bien, solo muestra su contenido", () => {
    render(
      <LoadBoundary>
        <p>Contenido</p>
      </LoadBoundary>,
    );
    expect(screen.getByText("Contenido")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("LoadBoundary al cambiar de página", () => {
  it("el error no sigue a la persona: otra página se intenta cargar", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <LoadBoundary resetKey="/pokedex/6">
        <Broken />
      </LoadBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(
      <LoadBoundary resetKey="/pokedex">
        <p>La lista</p>
      </LoadBoundary>,
    );
    expect(screen.getByText("La lista")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    vi.restoreAllMocks();
  });
});
