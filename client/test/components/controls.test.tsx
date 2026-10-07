import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "../../src/components/Badge";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { Notice } from "../../src/components/Notice";
import { StatTile } from "../../src/components/StatTile";
import { TextField } from "../../src/components/TextField";

describe("Button (etapa 6)", () => {
  it("el principal tiene relieve: un borde inferior del color de borde del acento que se hunde al pulsar", () => {
    render(<Button variant="primary">Entrar</Button>);
    const { className } = screen.getByRole("button", { name: "Entrar" });
    expect(className).toContain("bg-accent");
    expect(className).toContain("var(--accent-edge)");
    expect(className).toContain("active:translate-y-");
  });

  it("el tamaño grande es más alto que el normal", () => {
    const { rerender } = render(<Button>Aceptar</Button>);
    const normal = screen.getByRole("button").className;
    rerender(<Button size="lg">Aceptar</Button>);
    const large = screen.getByRole("button").className;
    expect(normal).toContain("py-2");
    expect(large).toContain("py-3");
    expect(large).toContain("text-base");
  });

  it("al cargar muestra una ruedita decorativa y su nombre accesible sigue siendo el texto", () => {
    render(<Button loading>Entrar</Button>);
    const button = screen.getByRole("button", { name: "Entrar" });
    const spinner = button.querySelector("svg");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner?.getAttribute("class")).toContain("animate-spin-slow");
  });

  it("sin cargar no hay ruedita", () => {
    render(<Button>Entrar</Button>);
    expect(screen.getByRole("button").querySelector("svg")).toBeNull();
  });

  it("deshabilitado no ejecuta su acción", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Crear
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("TextField (etapa 6)", () => {
  it("es un campo alto y redondeado con el foco visible", () => {
    render(<TextField label="Email" />);
    const className = screen.getByLabelText("Email").className;
    expect(className).toContain("py-3");
    expect(className).toContain("rounded-ui");
    expect(className).toContain("framed");
  });
});

describe("Notice (etapa 6)", () => {
  it("cada tono lleva su icono decorativo y el texto sigue siendo lo único que se lee", () => {
    for (const tone of ["info", "danger", "success"] as const) {
      const { unmount } = render(<Notice tone={tone}>Mensaje</Notice>);
      const notice = screen.getByRole(tone === "danger" ? "alert" : "status");
      expect(notice.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(notice).toHaveTextContent("Mensaje");
      unmount();
    }
  });

  it("deja un hueco para una acción a la derecha, fuera del texto", async () => {
    const onClick = vi.fn();
    render(
      <Notice tone="success" action={<Button onClick={onClick}>Volver</Button>}>
        Tienes una partida
      </Notice>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Tienes una partida");
    await userEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("el texto con varios fragmentos conserva sus espacios", () => {
    render(
      <Notice>
        <span>Ash se desconectó.</span> <span>Tiene 20 s para volver.</span>
      </Notice>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Ash se desconectó. Tiene 20 s para volver.");
  });
});

describe("Badge", () => {
  it.each([
    ["success", "bg-success-bg", "text-success"],
    ["danger", "bg-danger-bg", "text-danger"],
    ["gold", "bg-gold", "text-gold-fg"],
    ["info", "bg-accent-2", "text-accent-2-fg"],
    ["neutral", "bg-surface-2", "text-fg"],
  ] as const)("el tono %s usa %s con %s", (tone, background, color) => {
    render(<Badge tone={tone}>Ganaste</Badge>);
    const { className } = screen.getByText("Ganaste");
    expect(className).toContain(background);
    expect(className).toContain(color);
  });

  it("por defecto es neutra", () => {
    render(<Badge>Empate</Badge>);
    expect(screen.getByText("Empate").className).toContain("bg-surface-2");
  });
});

describe("StatTile", () => {
  it("es una ficha con su etiqueta y su valor, dentro de una lista de definiciones", () => {
    render(
      <dl>
        <StatTile label="Partidas" value="12" />
      </dl>,
    );
    expect(screen.getByText("Partidas").tagName).toBe("DT");
    expect(screen.getByText("12").tagName).toBe("DD");
  });

  it("puede llevar una ayuda debajo", () => {
    render(
      <dl>
        <StatTile label="Racha actual" value="3" hint="partidas seguidas" />
      </dl>,
    );
    expect(screen.getByText("partidas seguidas")).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("por defecto es un recuadro con relieve", () => {
    render(<Card data-testid="card">Contenido</Card>);
    const { className } = screen.getByTestId("card");
    expect(className).toContain("framed");
    expect(className).toContain("rounded-card");
    expect(className).toContain("bg-surface");
    expect(className).toContain("shadow-card");
  });

  it("puede ser una sección con nombre accesible (una región)", () => {
    render(
      <Card as="section" aria-label="Tu equipo">
        Contenido
      </Card>,
    );
    expect(screen.getByRole("region", { name: "Tu equipo" })).toBeInTheDocument();
  });

  it("puede ser un artículo y deja pasar clases propias", () => {
    render(
      <Card as="article" className="p-6">
        Contenido
      </Card>,
    );
    expect(screen.getByRole("article").className).toContain("p-6");
  });

  it("la variante elevada usa la sombra más marcada", () => {
    render(
      <Card tone="raised" data-testid="card">
        Contenido
      </Card>,
    );
    expect(screen.getByTestId("card").className).toContain("shadow-pop");
  });
});
