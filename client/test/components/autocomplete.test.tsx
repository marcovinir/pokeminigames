import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  it("al escribir muestra las sugerencias y lo anuncia a los lectores de pantalla", async () => {
    const { user, input } = setup();
    await user.type(input, "alf");
    const list = screen.getByRole("listbox", { name: "Sugerencias" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["AlfaAlpha", "AlfilBishop"]);
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

  it("las sugerencias no usan opacidad (el texto bajaría de 4,5:1 sin que la auditoría lo viera)", async () => {
    const { user, input } = setup();
    await user.type(input, "alf");
    const list = screen.getByRole("listbox");
    expect(list.innerHTML).not.toMatch(/opacity/);
    await user.keyboard("{ArrowDown}");
    expect(list.innerHTML).not.toMatch(/opacity/);
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
