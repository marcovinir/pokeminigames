import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Notice } from "../../src/components/Notice";

describe("Notice", () => {
  it("con una acción, el texto tiene un ancho mínimo: en pantallas estrechas el botón baja de línea en vez de apretar el texto", () => {
    render(<Notice action={<button type="button">Jugar aquí</button>}>Abriste esta partida en otra pestaña.</Notice>);
    const text = screen.getByText("Abriste esta partida en otra pestaña.");
    expect(text.className).toContain("basis-48");
    expect(text.className).toContain("grow");
  });
});
