import { TYPE_NAMES } from "@pokemon-minigames/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "../../src/components/Button";
import { Notice } from "../../src/components/Notice";
import { OpponentPanel, TeamPanel } from "../../src/components/Panels";
import { PokemonCard } from "../../src/components/PokemonCard";
import { TextField } from "../../src/components/TextField";
import { Timer } from "../../src/components/Timer";
import { typeIconUrl } from "../../src/catalog/artwork";
import { TypeChip } from "../../src/components/TypeChip";
import { TYPE_LABELS } from "../../src/i18n/es";
import { pokemon } from "../helpers/events";

describe("Button", () => {
  it("por defecto es de tipo button (no envía formularios por accidente)", () => {
    render(<Button>Aceptar</Button>);
    expect(screen.getByRole("button", { name: "Aceptar" })).toHaveAttribute("type", "button");
  });

  it("al cargar queda deshabilitado y lo indica con aria-busy", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Entrar</Button>);
    const button = screen.getByRole("button", { name: "Entrar" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("ninguna variante baja la opacidad al pasar el ratón (el texto perdería contraste)", () => {
    for (const variant of ["primary", "secondary", "ghost", "header"] as const) {
      const { unmount } = render(<Button variant={variant}>x</Button>);
      expect(screen.getByRole("button").className).not.toMatch(/hover:opacity/);
      unmount();
    }
  });

  it("la variante del encabezado usa el color de texto del encabezado, no el del resto de la página", () => {
    render(<Button variant="header">Cerrar sesión</Button>);
    const button = screen.getByRole("button", { name: "Cerrar sesión" });
    expect(button.className).toContain("text-header-fg");
    expect(button.className).not.toContain("text-fg");
  });

  it("ejecuta su acción al pulsarlo", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Crear</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("TextField", () => {
  it("asocia la etiqueta con el campo", () => {
    render(<TextField label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("con error lo marca como inválido, lo anuncia y lo vincula al campo", () => {
    render(<TextField label="Email" error="Email inválido" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Email inválido");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  });

  it("sin error no se marca como inválido y la ayuda también queda vinculada", () => {
    render(<TextField label="Usuario" hint="De 3 a 30 caracteres" />);
    const input = screen.getByLabelText("Usuario");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("De 3 a 30 caracteres");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("deja pasar el resto de atributos del input", () => {
    render(<TextField label="Clave" type="password" autoComplete="current-password" />);
    expect(screen.getByLabelText("Clave")).toHaveAttribute("type", "password");
  });
});

describe("TypeChip", () => {
  it("muestra el nombre del tipo en español, con su color", () => {
    render(<TypeChip type="fire" />);
    const chip = screen.getByText("fuego");
    expect(chip).toHaveAttribute("data-type", "fire");
    expect(chip.style.background).not.toBe("");
  });

  it("lleva el icono oficial del tipo: decorativo y sin cambiar el nombre", () => {
    const { container } = render(<TypeChip type="fire" />);
    const icon = container.querySelector("img")!;
    expect(icon).toHaveAttribute("src", typeIconUrl("fire"));
    expect(icon).toHaveAttribute("alt", "");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("fuego")).toHaveAttribute("data-type", "fire");
  });

  it("el icono tiene una caja cuadrada de tamaño fijo (14 px, 18 px en el chip grande) para que no salte el diseño", () => {
    const { container, rerender } = render(<TypeChip type="water" />);
    const box = () => container.querySelector("img")!.parentElement as HTMLElement;
    expect(box().style.width).toBe("14px");
    expect(box().style.height).toBe("14px");
    rerender(<TypeChip type="water" size="lg" />);
    expect(box().style.width).toBe("18px");
    expect(box().style.height).toBe("18px");
  });

  it("recorta la píldora de PokeAPI (200 × 40) al círculo de su símbolo: la imagen va a escala y desplazada dentro de una caja redonda", () => {
    const { container } = render(<TypeChip type="fire" size="lg" />); // caja de 18 px
    const icon = container.querySelector("img") as HTMLImageElement;
    const box = icon.parentElement as HTMLElement;
    expect(box.className.split(" ")).toEqual(expect.arrayContaining(["overflow-hidden", "rounded-full"]));
    // Los símbolos ocupan de x = 15 a 44 e y = 5 a 34 de la imagen: la ventana de 40 × 40 empieza en x = 9 (centrada en el
    // símbolo, sin cortarlo por la derecha). La píldora mide 5 veces su alto, y con estilo en línea porque el preflight de
    // Tailwind pone `height: auto` y `max-width: 100%` a toda `img` y anularía los atributos.
    expect(icon.style.height).toBe("18px");
    expect(icon.style.width).toBe("90px");
    expect(icon.style.marginLeft).toBe("-4.05px");
    expect(icon.style.maxWidth).toBe("none");
  });

  it("con icon={false} queda como antes, sin imagen", () => {
    const { container } = render(<TypeChip type="ice" icon={false} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("hielo")).toBeInTheDocument();
  });

  it("si la imagen no carga, el icono desaparece y queda el chip de siempre", () => {
    const { container } = render(<TypeChip type="ghost" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("fantasma")).toHaveAttribute("data-type", "ghost");
  });

  it("los 18 tipos tienen su nombre en español", () => {
    for (const type of TYPE_NAMES) expect(TYPE_LABELS[type]).toBeTruthy();
    expect(new Set(TYPE_NAMES.map((t) => TYPE_LABELS[t])).size).toBe(18);
  });
});

describe("Notice", () => {
  it("los errores se anuncian como alerta y lo demás como estado", () => {
    render(
      <>
        <Notice tone="danger">Falló</Notice>
        <Notice>Información</Notice>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Falló");
    expect(screen.getByRole("status")).toHaveTextContent("Información");
  });
});

describe("PokemonCard", () => {
  it("muestra el nombre en español, el inglés, los tipos y el total", () => {
    render(<PokemonCard pokemon={pokemon(6, 534, { names: { es: "Charizard", en: "Charizard" } })} />);
    expect(screen.getByRole("heading", { name: "Charizard" })).toBeInTheDocument();
    expect(screen.getByText("fuego")).toBeInTheDocument();
    expect(screen.getByText("volador")).toBeInTheDocument();
    expect(screen.getByLabelText("534 puntos en total")).toHaveTextContent("534");
  });

  it("solo muestra las seis stats cuando se piden", () => {
    const { rerender } = render(<PokemonCard pokemon={pokemon(1, 300)} />);
    expect(screen.queryByText("Velocidad")).not.toBeInTheDocument();
    rerender(<PokemonCard pokemon={pokemon(1, 300)} showStats />);
    for (const label of ["PS", "Ataque", "Defensa", "At. esp.", "Def. esp.", "Velocidad"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("paneles de equipo", () => {
  it("TeamPanel lista los Pokémon y el total; vacío dice que no hay ninguno", () => {
    const { rerender } = render(<TeamPanel team={[pokemon(1, 500), pokemon(2, 300)]} total={800} />);
    expect(screen.getByRole("region", { name: "Tu equipo" })).toHaveTextContent("800");
    expect(screen.getByText("Poke1")).toBeInTheDocument();
    expect(screen.getByText("Poke2")).toBeInTheDocument();
    rerender(<TeamPanel team={[]} total={0} />);
    expect(screen.getByText("Todavía no tienes Pokémon.")).toBeInTheDocument();
  });

  it("OpponentPanel sin Pokémon revelados muestra el total, la cantidad y el aviso", () => {
    render(<OpponentPanel name="misty" total={400} teamSize={2} team={[]} connected />);
    const panel = screen.getByRole("region", { name: "Tu rival" });
    expect(panel).toHaveTextContent("misty");
    expect(panel).toHaveTextContent("400");
    expect(panel).toHaveTextContent("2 Pokémon");
    expect(panel).toHaveTextContent("Se revelan al cerrar cada ronda.");
    expect(panel).not.toHaveTextContent("Desconectado");
  });

  it("OpponentPanel usa el singular y avisa si el rival está desconectado", () => {
    render(<OpponentPanel name="misty" total={300} teamSize={1} team={[]} connected={false} />);
    expect(screen.getByText("1 Pokémon")).toBeInTheDocument();
    expect(screen.getByText("Desconectado")).toBeInTheDocument();
  });
});

describe("Timer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("muestra los segundos que faltan, corrige el desfase y baja con el tiempo", () => {
    let now = 4_000; // el navegador marca 4 000 mientras el servidor marca 10 000
    render(<Timer deadline={25_000} offset={6_000} totalMs={15_000} label="Tiempo de la ronda" now={() => now} />);
    expect(screen.getByRole("timer", { name: "Tiempo de la ronda" })).toHaveTextContent("15");

    now = 9_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(screen.getByRole("timer")).toHaveTextContent("10");
  });

  it("llega a cero y no pasa de ahí", () => {
    let now = 0;
    render(<Timer deadline={1_000} offset={0} totalMs={15_000} label="Tiempo" now={() => now} />);
    now = 60_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(screen.getByRole("timer")).toHaveTextContent("0");
  });
});

describe("OpponentPanel con el equipo revelado (etapa 8)", () => {
  it("lista los Pokémon ya revelados, con sprite, nombre y total, como «Tu equipo»", () => {
    render(<OpponentPanel name="misty" total={700} teamSize={2} team={[pokemon(7, 400), pokemon(8, 300)]} connected />);
    const panel = screen.getByRole("region", { name: "Tu rival" });
    const rows = [...panel.querySelectorAll("li")];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Poke7");
    expect(rows[0]).toHaveTextContent("400");
    expect(rows[0]!.querySelector("img")).toHaveAttribute("src", "https://example.com/7.png");
    expect(rows[1]).toHaveTextContent("Poke8");
    expect(panel).toHaveTextContent("2 Pokémon");
    expect(panel).not.toHaveTextContent("Se revelan al cerrar cada ronda.");
  });

  it("el nombre largo se recorta en una línea sin romper el panel", () => {
    render(<OpponentPanel name="misty" total={400} teamSize={1} team={[pokemon(7, 400, { names: { es: "A".repeat(30), en: "B".repeat(30) } })]} connected />);
    const row = screen.getByRole("region", { name: "Tu rival" }).querySelector("li")!;
    expect(row.querySelector(".truncate")).toHaveTextContent("A".repeat(30));
  });
});
