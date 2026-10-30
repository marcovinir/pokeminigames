import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../../src/routes";
import { TypesPage } from "../../src/pages/types/TypesPage";
import { parseTypeSelection } from "../../src/pages/types/type-selection";
import { fakeServices, renderWithServices, signIn } from "../helpers/services";

function Probe() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderAt(route: string) {
  return {
    user: userEvent.setup(),
    ...renderWithServices(
      <>
        <Routes>
          <Route path="/tipos" element={<TypesPage />} />
        </Routes>
        <Probe />
      </>,
      { route, services: fakeServices() },
    ),
  };
}

const where = () => screen.getByTestId("where").textContent;
const tipo1 = () => screen.getByRole("combobox", { name: "Tipo 1" });
const tipo2 = () => screen.getByRole("combobox", { name: "Tipo 2" });
const table = () => screen.getByRole("table");
/** La celda de una fila (quien ataca) y una columna (quien recibe), por los nombres de sus encabezados. */
function cell(attacker: string, defender: string): HTMLElement {
  const column = within(table()).getAllByRole("columnheader").findIndex((header) => header.textContent!.includes(defender));
  const row = within(table()).getByRole("rowheader", { name: new RegExp(attacker) }).closest("tr")!;
  return row.children[column] as HTMLElement;
}

describe("parseTypeSelection", () => {
  it.each([
    ["tipo1=fire&tipo2=flying", ["fire", "flying"]],
    ["tipo2=flying", ["flying"]],
    ["tipo1=fire&tipo2=fire", ["fire"]],
    ["tipo1=inventado&tipo2=water", ["water"]],
    ["tipo1=x&tipo2=y", []],
  ])("%s", (query, expected) => expect(parseTypeSelection(new URLSearchParams(query))).toEqual(expected));
});

describe("la página de la tabla de tipos", () => {
  it("sin selección hay título y tabla, pero no bloque de daño", () => {
    renderAt("/tipos");
    expect(screen.getByRole("heading", { level: 1, name: "Matriz de Tipos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Daño que recibe" })).toBeNull();
    expect(screen.getByText("En cada fila, el tipo que ataca; en cada columna, el que recibe.")).toBeInTheDocument();
  });

  it("/tipos?tipo1=fire&tipo2=flying muestra ×4 roca y ×0 tierra, sin grupo ×1", () => {
    renderAt("/tipos?tipo1=fire&tipo2=flying");
    const block = screen.getByRole("region", { name: "Daño que recibe" });
    expect(within(within(block).getByRole("group", { name: "×4" })).getByText("roca")).toBeInTheDocument();
    expect(within(within(block).getByRole("group", { name: "×0" })).getByText("tierra")).toBeInTheDocument();
    expect(within(block).getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual(["×4", "×2", "×½", "×¼", "×0"]);
    expect(tipo1()).toHaveValue("fire");
    expect(tipo2()).toHaveValue("flying");
  });

  it("un tipo solo omite los grupos vacíos", () => {
    renderAt("/tipos?tipo1=normal");
    const block = screen.getByRole("region", { name: "Daño que recibe" });
    expect(within(block).getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual(["×2", "×0"]);
  });

  it("elegir en las listas actualiza la dirección; el tipo 2 no ofrece el tipo 1", async () => {
    const { user } = renderAt("/tipos");
    expect(tipo2()).toBeDisabled();
    await user.selectOptions(tipo1(), "fire");
    expect(where()).toBe("/tipos?tipo1=fire");
    expect(within(tipo2()).queryByRole("option", { name: "fuego" })).toBeNull();
    await user.selectOptions(tipo2(), "flying");
    expect(where()).toBe("/tipos?tipo1=fire&tipo2=flying");
  });

  it("quitar el tipo 1 sube el tipo 2; cambiar el tipo 1 al mismo que el 2 no lo repite", async () => {
    const { user } = renderAt("/tipos?tipo1=fire&tipo2=flying");
    await user.selectOptions(tipo1(), "Ninguno");
    expect(where()).toBe("/tipos?tipo1=flying");
    await user.selectOptions(tipo2(), "water");
    await user.selectOptions(tipo1(), "water");
    expect(where()).toBe("/tipos?tipo1=water");
  });

  it("valores inventados en la dirección no rompen la página", () => {
    renderAt("/tipos?tipo1=inventado&tipo2=nada");
    expect(tipo1()).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Daño que recibe" })).toBeNull();
  });

  it("la tabla: fuego contra planta dice 2; normal contra fantasma, 0; la neutra no se ve", () => {
    renderAt("/tipos");
    expect(within(table()).getAllByRole("columnheader")).toHaveLength(19);
    expect(within(table()).getAllByRole("rowheader")).toHaveLength(18);
    expect(cell("fuego", "planta")).toHaveTextContent("2");
    expect(cell("fuego", "agua")).toHaveTextContent("½");
    expect(cell("normal", "fantasma")).toHaveTextContent("0");
    // La neutra no se ve, pero un lector de pantalla oye «1» y no una celda en blanco.
    expect(cell("normal", "fuego")).toHaveTextContent("1");
    expect(within(cell("normal", "fuego")).getByText("1")).toHaveClass("sr-only");
  });

  it("las columnas de los tipos elegidos se marcan, y ninguna otra", () => {
    renderAt("/tipos?tipo1=fire");
    expect(cell("agua", "fuego")).toHaveAttribute("data-selected", "true");
    expect(cell("agua", "planta")).not.toHaveAttribute("data-selected");
    const marked = within(table()).getAllByRole("columnheader").filter((header) => header.hasAttribute("data-selected"));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent("fuego");
  });

  it("la caja de la tabla se desplaza sola y se alcanza con el teclado", () => {
    renderAt("/tipos");
    const box = screen.getByRole("region", { name: "Tabla de efectividad de tipos" });
    expect(box).toHaveAttribute("tabindex", "0");
    expect(box.className).toContain("overflow-x-auto");
  });
});

describe("la ruta /tipos es pública", () => {
  it.each(["anonymous", "loading"] as const)("con la sesión %s se ve la página, no /login", async (status) => {
    const services = fakeServices();
    services.session.setState({ status, user: null });
    renderWithServices(
      <>
        <AppRoutes />
        <Probe />
      </>,
      { route: "/tipos", services },
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Matriz de Tipos" })).toBeInTheDocument();
    expect(where()).toBe("/tipos");
  });
});

describe("la tabla de tipos para lectores de pantalla", () => {
  it("la tabla tiene título propio, con la explicación de filas y columnas", () => {
    renderAt("/tipos");
    expect(screen.getByRole("table", { name: /Todos los tipos.*En cada fila, el tipo que ataca/ })).toBeInTheDocument();
  });

  it("la columna elegida se anuncia en su encabezado, y las demás no", () => {
    renderAt("/tipos?tipo1=fire");
    expect(within(table()).getByRole("columnheader", { name: /fuego.*elegido/ })).toBeInTheDocument();
    expect(within(table()).queryByRole("columnheader", { name: /agua.*elegido/ })).toBeNull();
  });

  it("el bloque de daño está en una región viva que ya existe antes de elegir, para que el cambio se anuncie", async () => {
    const { user } = renderAt("/tipos");
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live).toBeEmptyDOMElement();
    await user.selectOptions(tipo1(), "fire");
    expect(document.querySelector('[aria-live="polite"]')).toBe(live);
    expect(within(live as HTMLElement).getByRole("heading", { name: "Daño que recibe" })).toBeInTheDocument();
  });
});

describe("el camino para entrar a jugar", () => {
  const cta = () => screen.queryByRole("link", { name: "Entrar a jugar" });

  it("sin sesión, la página ofrece entrar a jugar y lleva a /login", () => {
    const services = fakeServices();
    services.session.setState({ status: "anonymous", user: null });
    renderWithServices(<TypesPage />, { services });
    expect(cta()).toHaveAttribute("href", "/login");
  });

  it("con sesión o mientras carga no se ofrece", () => {
    const loading = fakeServices();
    loading.session.setState({ status: "loading", user: null });
    const first = renderWithServices(<TypesPage />, { services: loading });
    expect(cta()).toBeNull();
    first.unmount();
    const account = fakeServices();
    signIn(account);
    renderWithServices(<TypesPage />, { services: account });
    expect(cta()).toBeNull();
  });
});
