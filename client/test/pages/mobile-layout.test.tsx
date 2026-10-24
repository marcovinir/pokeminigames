import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Header } from "../../src/components/Header";
import { LoginPage } from "../../src/pages/AuthPages";
import { LobbyPage } from "../../src/pages/Lobby";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { SERVER_NOW, event, pokemon } from "../helpers/events";
import { ash, misty, renderRoom, roundState } from "../helpers/room";
import { ASH, fakeServices, renderWithServices, signIn } from "../helpers/services";

/**
 * Una columna de cuadrícula sin `grid-cols-1` mide lo que mide su contenido (`min-width: auto`): un campo de texto o un
 * aviso largo ensanchan toda la pantalla y en el móvil aparece un desplazamiento horizontal. Estas pruebas fijan la
 * regla que lo evita; el recorrido real en un móvil de 375 px (Task 14) comprueba que no hay desbordes.
 */
const classesOf = (element: Element | null): string => element?.getAttribute("class") ?? "";

describe("sin desbordes en pantallas estrechas", () => {
  it("ronda: las columnas se pueden encoger (minmax(0, …)) y la arena también", () => {
    const { container } = renderRoom([
      event.roomState({
        phase: "round_active",
        players: [ash({ totalStats: 500, teamSize: 1 }), misty({ totalStats: 400, teamSize: 1 })],
        round: roundState({ number: 2 }),
      }),
    ]);
    const arena = container.querySelector("[data-arena]")!;
    expect(classesOf(arena)).toContain("min-w-0");
    const grid = arena.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
    expect(classesOf(grid)).toContain("md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]");
  });

  it("resultado de la ronda: una columna en móvil", () => {
    const { container } = renderRoom([
      event.roomState({ phase: "round_result", roundsPlayed: 1, players: [ash(), misty()] }),
      event.roundResult(),
    ]);
    const grid = container.querySelector("section[data-result]")!.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
  });

  it("resumen: los dos equipos van en una columna en móvil", () => {
    const { container } = renderRoom([event.roomState({ phase: "finished", players: [ash(), misty()] }), event.gameEnded()]);
    const grid = container.querySelector("section[aria-label^='Equipo de']")!.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
  });

  it("lobby: las dos tarjetas van en una columna en móvil", () => {
    renderWithServices(<LobbyPage />);
    const grid = screen.getByRole("heading", { level: 2, name: "Crear sala" }).closest("section")!.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
  });

  it("acceso: el lema y el formulario van en una columna en móvil", () => {
    const { container } = renderWithServices(<LoginPage />);
    expect(classesOf(container.firstElementChild)).toContain("grid-cols-1");
  });

  it("perfil: el podio de Pokémon va en una columna en móvil", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({
      username: "ash",
      avatarId: null,
      stats: {
        played: 2,
        wins: 1,
        draws: 0,
        losses: 1,
        winRate: 0.5,
        currentStreak: 1,
        bestStreak: 1,
        averagePower: 300,
        bestGameScore: 300,
        topPokemon: [{ pokemon: pokemon(6, 534), wins: 1 }],
      },
    }));
    renderWithServices(
      <Routes>
        <Route path="/perfil" element={<ProfilePage />} />
      </Routes>,
      { services, route: "/perfil" },
    );
    const top = await screen.findByRole("region", { name: "Pokémon más ganados" });
    expect(classesOf(top.querySelector("ul"))).toContain("grid-cols-1");
  });
});

/**
 * jsdom no calcula tamaños: estas pruebas fijan las clases que evitan los desbordes que se midieron en un navegador de
 * verdad (e2e/tests/layout.spec.ts, con nombres de 30 letras a 360 y 375 px), para que un cambio de clases salte rápido.
 */
describe("encabezado y menú de apariencia en pantallas estrechas", () => {
  async function openMenu(username = "ash") {
    const services = fakeServices();
    signIn(services, { ...ASH, username });
    renderWithServices(<Header />, { services });
    const toggle = screen.getByRole("button", { name: "Apariencia" });
    await userEvent.click(toggle);
    return document.getElementById(toggle.getAttribute("aria-controls")!)!;
  }

  it("el panel se ancla al contenedor del encabezado y no al botón (con sesión el botón queda a media pantalla y el panel se salía por la izquierda)", async () => {
    const panel = await openMenu();
    expect(classesOf(panel)).toContain("absolute");
    expect(classesOf(panel)).toContain("right-4");
    expect(panel.parentElement!.closest(".relative")).toBe(panel.closest("header")!.firstElementChild);
  });

  it("el nombre largo se recorta en vez de ensanchar la fila, y las etiquetas de texto solo caben desde pantallas anchas", async () => {
    const name = "a".repeat(30);
    await openMenu(name);
    const shown = screen.getByText(name);
    expect(classesOf(shown)).toContain("truncate");
    expect(classesOf(shown)).toContain("lg:inline");
    for (const label of ["Apariencia", "Mi perfil", "Cerrar sesión"]) {
      expect(classesOf(screen.getByText(label)), label).toContain("lg:not-sr-only");
    }
  });
});

describe("marcador fijo de la ronda en pantallas estrechas", () => {
  it("el encabezado mide siempre lo mismo (--header-h) y el marcador de la barra se pega justo debajo al desplazarse", () => {
    const services = fakeServices();
    signIn(services);
    const header = renderWithServices(<Header />, { services });
    expect(classesOf(header.container.querySelector("header"))).toContain("h-(--header-h)");
    header.unmount();

    renderRoom([
      event.roomState({
        phase: "round_active",
        players: [ash({ totalStats: 500, teamSize: 1 }), misty({ totalStats: 400, teamSize: 1 })],
        round: roundState({ number: 2 }),
      }),
    ]);
    const score = screen.getByLabelText("Marcador");
    for (const token of ["sticky", "top-(--header-h)", "z-10", "md:hidden"]) expect(classesOf(score), token).toContain(token);
  });
});

describe("textos largos y tarjetas sueltas en pantallas estrechas", () => {
  it("sala de espera: la tarjeta ocupa el ancho disponible, las casillas se encogen y los nombres se parten", () => {
    const { container } = renderRoom([event.roomState({ phase: "waiting", players: [ash({ username: "a".repeat(30) })] })]);
    expect(classesOf(container.querySelector("section"))).toContain("w-full");
    expect(classesOf(screen.getByLabelText("Código de la sala").firstElementChild)).toContain("min-w-0");
    const player = screen.getByRole("list", { name: "Jugadores" }).firstElementChild!;
    expect(classesOf(player)).toContain("min-w-0");
    expect(classesOf(screen.getByText("a".repeat(30)))).toContain("[overflow-wrap:anywhere]");
  });

  it("cuenta atrás: la tarjeta ocupa el ancho disponible y el título parte el nombre del rival", () => {
    const { container } = renderRoom([
      event.roomState({ phase: "starting", players: [ash(), misty({ username: "b".repeat(30) })] }),
    ]);
    expect(classesOf(container.querySelector("section"))).toContain("w-full");
    expect(classesOf(screen.getByRole("heading", { name: /Partida contra/ }))).toContain("[overflow-wrap:anywhere]");
  });

  it("resultado de la ronda: la respuesta del rival, aunque sean 100 letras seguidas, se parte", () => {
    renderRoom([
      event.roomState({ phase: "round_result", roundsPlayed: 1, players: [ash(), misty()] }),
      event.roundResult(),
    ]);
    expect(classesOf(screen.getByText(/Escribió: «zzz»/))).toContain("[overflow-wrap:anywhere]");
  });

  async function renderProfile() {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({
      username: "a".repeat(30),
      avatarId: null,
      stats: {
        played: 2,
        wins: 1,
        draws: 0,
        losses: 1,
        winRate: 0.5,
        currentStreak: 1,
        bestStreak: 1,
        averagePower: 300,
        bestGameScore: 300,
        topPokemon: [],
      },
    }));
    renderWithServices(
      <Routes>
        <Route path="/perfil" element={<ProfilePage />} />
      </Routes>,
      { services, route: "/perfil" },
    );
    await screen.findByText("Victorias");
  }

  it("perfil: la ficha del porcentaje ocupa dos columnas y reserva sitio a la derecha para su anillo", async () => {
    await renderProfile();
    const tile = screen.getByText("Victorias").parentElement!;
    expect(classesOf(tile)).toContain("col-span-2");
    expect(classesOf(tile)).toContain("pr-20");
  });

  it("perfil: el nombre propio largo se recorta", async () => {
    await renderProfile();
    expect(classesOf(screen.getByText("a".repeat(30)))).toContain("truncate");
  });
});

describe("revancha en pantallas estrechas", () => {
  const longName = "m".repeat(30);

  it("el bloque de espera envuelve el título y la etiqueta en vez de ensanchar la pantalla", () => {
    renderRoom([
      event.roomState({ phase: "finished", mySeat: 1, players: [ash(), misty({ username: longName, guest: true })] }),
      event.gameEnded({ winnerSeat: 1 }),
      event.rematchState({ status: "theirs", deadline: SERVER_NOW + 60_000 }),
    ]);
    const heading = screen.getByRole("heading", { name: `${longName} quiere la revancha` });
    expect(classesOf(heading)).toContain("[overflow-wrap:anywhere]");
    expect(classesOf(heading)).toContain("min-w-0");
    expect(classesOf(heading.parentElement)).toContain("flex-wrap");
  });

  it("la pantalla «¡Revancha!» parte un nombre largo en las fichas de quién entró", () => {
    renderRoom([event.roomState({ phase: "waiting", rematch: true, players: [ash(), misty({ username: longName, connected: false })] })]);
    const pill = screen.getByText(`${longName} entrando…`);
    expect(classesOf(pill)).toContain("[overflow-wrap:anywhere]");
    expect(classesOf(pill.closest("ul"))).toContain("flex-wrap");
  });
});

describe("resumen en pantallas estrechas", () => {
  it("«Ver perfil de …» con un nombre de 30 letras se parte en vez de ensanchar la pantalla", () => {
    const longName = "m".repeat(30);
    renderRoom([
      event.roomState({ phase: "finished", mySeat: 1, players: [ash(), misty({ username: longName })] }),
      event.gameEnded({ winnerSeat: 1 }),
    ]);
    const button = screen.getByRole("button", { name: `Ver perfil de ${longName}` });
    expect(classesOf(button)).toContain("max-w-full");
    expect(classesOf(button)).toContain("[overflow-wrap:anywhere]");
  });
});
