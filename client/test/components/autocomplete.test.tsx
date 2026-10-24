import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PokemonName } from "../../src/api/types";
import { spriteUrl } from "../../src/catalog/artwork";
import { Autocomplete, buildIndex, suggest } from "../../src/components/Autocomplete";
import { NAMES } from "../helpers/services";

describe("suggest", () => {
  const index = buildIndex(NAMES);

  it("sugiere por el comienzo del nombre en español o en inglés", () => {
    expect(suggest(index, "alf").map((n) => n.es)).toEqual(["Alfa", "Alfil"]);
    expect(suggest(index, "bish").map((n) => n.es)).toEqual(["Alfil"]); // inglés
  });

  it("ignora mayúsculas, tildes y signos", () => {
    expect(suggest(index, "  EPSI").map((n) => n.es)).toEqual(["Épsilon"]);
    expect(suggest(index, "épsilon").map((n) => n.es)).toEqual(["Épsilon"]);
    expect(suggest(index, "a-l-f").map((n) => n.es)).toEqual(["Alfa", "Alfil"]);
  });

  it("no sugiere nada con un texto vacío o que no coincide", () => {
    expect(suggest(index, "")).toEqual([]);
    expect(suggest(index, "   ")).toEqual([]);
    expect(suggest(index, "xyz")).toEqual([]);
  });

  it("limita la cantidad de sugerencias", () => {
    const many = buildIndex(Array.from({ length: 30 }, (_, i) => ({ id: i, es: `Pok${i}`, en: `Mon${i}` })));
    expect(suggest(many, "pok")).toHaveLength(6);
  });

  it("no revela nada por tipo: la lista de entrada solo trae nombres", () => {
    expect(Object.keys(NAMES[0]!).sort()).toEqual(["en", "es", "id"]);
  });
});

function setup(props: Partial<React.ComponentProps<typeof Autocomplete>> = {}) {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<Autocomplete names={NAMES} onSubmit={onSubmit} {...props} />);
  const input = screen.getByRole("combobox", { name: "Nombre del Pokémon" });
  return { onSubmit, user, input };
}

describe("Autocomplete", () => {
  it("el campo lleva el borde de contraste de los campos", () => {
    const { input } = setup();
    expect(input.className.split(" ")).toContain("framed-field");
  });

  it("al escribir muestra las sugerencias y lo anuncia a los lectores de pantalla", async () => {
    const { user, input } = setup();
    await user.type(input, "alf");
    const list = screen.getByRole("listbox", { name: "Sugerencias" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["#001AlfaAlpha", "#002AlfilBishop"]);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("status")).toHaveTextContent("2 sugerencias disponibles");
  });

  it("sin coincidencias no muestra la lista", async () => {
    const { user, input } = setup();
    await user.type(input, "xyz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("Enter envía lo escrito, recortado", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "  Charizard  {Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Charizard");
  });

  it("el botón Enviar también envía", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "Beto");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Beto");
  });

  it("las flechas recorren las sugerencias y Enter envía la resaltada con su nombre en español", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "alf");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0]!.id);
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}"); // no pasa del último
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}{Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Alfa");
  });

  it("escribir en inglés y elegir la sugerencia envía el nombre en español", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "bish");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Alfil");
  });

  it("Escape cierra la lista sin enviar nada", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "alf");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hacer clic en una sugerencia rellena el campo pero no envía: hay un solo intento", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "alf");
    await user.click(screen.getByRole("option", { name: /Alfil/ }));
    expect(input).toHaveValue("Alfil");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Alfil");
  });

  it("un campo vacío no envía y muestra un error que se quita al escribir", async () => {
    const { user, input, onSubmit } = setup();
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe el nombre de un Pokémon.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await user.type(input, "a");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un texto de solo espacios cuenta como vacío", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "   {Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("limita el texto a 100 caracteres, como el servidor", () => {
    const { input } = setup();
    expect(input).toHaveAttribute("maxlength", "100");
  });

  it("una vez enviada la respuesta queda bloqueado y lo dice", () => {
    const { input } = setup({ submitted: true });
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    expect(screen.getByText("Respuesta enviada. Esperando el resultado…")).toBeInTheDocument();
  });

  it("deshabilitado desde fuera tampoco envía", async () => {
    const { input, onSubmit } = setup({ disabled: true });
    expect(input).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("tras enviar queda bloqueado en el acto, sin esperar la confirmación: un doble Enter no envía dos veces", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "Beto{Enter}");
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await user.keyboard("{Enter}{Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Beto");
  });

  it("el texto de las sugerencias no usa opacidad (bajaría de 4,5:1 sin que la auditoría lo viera)", async () => {
    const { user, input } = setup();
    await user.type(input, "alf");
    const list = screen.getByRole("listbox");
    // La imagen del Pokémon (decorativa) aparece con una transición de opacidad al cargar; el texto, nunca.
    const withoutArt = (): string => {
      const copy = list.cloneNode(true) as HTMLElement;
      for (const art of copy.querySelectorAll("[data-state]")) art.remove();
      return copy.innerHTML;
    };
    expect(withoutArt()).not.toMatch(/opacity/);
    await user.keyboard("{ArrowDown}");
    expect(withoutArt()).not.toMatch(/opacity/);
  });

  it("con autoFocus el campo recibe el foco al montarse; por defecto no", () => {
    const first = setup({ autoFocus: true });
    expect(first.input).toHaveFocus();
  });

  it("sin autoFocus el campo no roba el foco", () => {
    const { input } = setup();
    expect(input).not.toHaveFocus();
  });

  it("funciona aunque todavía no haya llegado la lista de nombres: solo no sugiere", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Autocomplete names={[]} onSubmit={onSubmit} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "alf{Enter}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("alf");
  });
});

describe("filas de sugerencia (etapa 8)", () => {
  const TYPED: PokemonName[] = [
    { id: 6, es: "Charizard", en: "Charizard", types: ["fire", "flying"] },
    { id: 1025, es: "Charla", en: "Chatter", types: ["normal", "psychic"] },
  ];

  const optionsFor = async (props: Partial<React.ComponentProps<typeof Autocomplete>>, text = "cha") => {
    const { user, input } = setup(props);
    await user.type(input, text);
    return screen.getAllByRole("option");
  };

  it("cada fila lleva el sprite pequeño, el número de Pokédex y los dos nombres", async () => {
    const [first, second] = await optionsFor({ names: TYPED });
    expect(first!.querySelector("img")).toHaveAttribute("src", spriteUrl(6));
    expect(within(first!).getByText("#006")).toBeInTheDocument();
    expect(first!).toHaveTextContent("Charizard");
    expect(within(second!).getByText("#1025")).toBeInTheDocument();
    expect(second!.querySelector("img")).toHaveAttribute("src", spriteUrl(1025));
  });

  it("el nombre en inglés solo aparece si es distinto del español", async () => {
    const [first, second] = await optionsFor({ names: TYPED });
    expect(second!).toHaveTextContent("Charla");
    expect(second!).toHaveTextContent("Chatter");
    expect(first!.textContent!.split("Charizard")).toHaveLength(2); // aparece una sola vez
  });

  it("cada fila mide al menos 44 px de alto (tamaño táctil)", async () => {
    const rows = await optionsFor({ names: TYPED });
    for (const row of rows) expect(row.className.split(" ")).toContain("min-h-11");
  });

  it("el número es decorativo: el nombre de la opción sigue siendo el del Pokémon", async () => {
    const [first] = await optionsFor({ names: TYPED });
    expect(within(first!).getByText("#006")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("option", { name: /Charizard/ })).toBeInTheDocument();
  });

  it("sin la opción de pistas no muestra tipos, aunque la lista los traiga", async () => {
    const rows = await optionsFor({ names: TYPED });
    for (const row of rows) expect(row.querySelector("[data-type]")).toBeNull();
    expect(screen.queryByText("fuego")).not.toBeInTheDocument();
  });

  it("con las pistas de tipos muestra los chips de cada fila, en su orden", async () => {
    const [first, second] = await optionsFor({ names: TYPED, showTypes: true });
    expect([...first!.querySelectorAll("[data-type]")].map((chip) => chip.getAttribute("data-type"))).toEqual(["fire", "flying"]);
    expect([...second!.querySelectorAll("[data-type]")].map((chip) => chip.getAttribute("data-type"))).toEqual(["normal", "psychic"]);
    expect(first!).toHaveTextContent("fuego");
  });

  it("con pistas pero la lista sin tipos (falló la carga) muestra las filas sin chips", async () => {
    const rows = await optionsFor({ names: NAMES, showTypes: true }, "alf");
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.querySelector("[data-type]")).toBeNull();
  });

  it("si el sprite no carga, la fila sigue legible con una imagen de respaldo", async () => {
    const [first] = await optionsFor({ names: TYPED });
    fireEvent.error(first!.querySelector("img")!);
    expect(first!.querySelector("[data-state='fallback']")).not.toBeNull();
    expect(first!).toHaveTextContent("Charizard");
  });
});

describe("Autocomplete sin imágenes (la silueta)", () => {
  it("con showSprites={false} las sugerencias solo llevan el nombre", async () => {
    const { container } = render(<Autocomplete names={NAMES} onSubmit={vi.fn()} showSprites={false} />);
    await userEvent.type(screen.getByRole("combobox"), "a");
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    expect(container.querySelector("img")).toBeNull();
  });
});
