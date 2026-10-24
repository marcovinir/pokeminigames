import { AVATAR_POKEMON } from "@pokemon-minigames/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import type { SessionUser } from "../../src/api/types";
import { Header } from "../../src/components/Header";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { ASH, GUEST, type FakeServices, fakeServices, renderWithServices, signIn } from "../helpers/services";

function renderProfile(route = "/perfil", user: SessionUser = ASH, services: FakeServices = fakeServices()) {
  signIn(services, user);
  const utils = renderWithServices(
    <>
      <Header />
      <Routes>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/jugador/:username" element={<ProfilePage />} />
      </Routes>
    </>,
    { services, route },
  );
  return { ...utils, services, user: userEvent.setup() };
}

const changeButton = () => screen.findByRole("button", { name: "Cambiar avatar" });
const dialog = () => screen.getByRole("dialog", { name: "Elige tu avatar" });
const pokemonButton = (name: string) => within(dialog()).getByRole("button", { name });

async function openPicker(user: SessionUser = ASH, services?: FakeServices) {
  const rendered = renderProfile("/perfil", user, services);
  await rendered.user.click(await changeButton());
  return rendered;
}

describe("la ventana «Elige tu avatar»", () => {
  it("el perfil propio tiene «Cambiar avatar»; el ajeno y el de un invitado no", async () => {
    const own = renderProfile();
    expect(await changeButton()).toBeInTheDocument();
    own.unmount();

    const other = renderProfile("/jugador/misty");
    await screen.findByRole("heading", { name: "misty" });
    expect(screen.queryByRole("button", { name: "Cambiar avatar" })).not.toBeInTheDocument();
    other.unmount();

    renderProfile("/perfil", GUEST);
    await screen.findByRole("heading", { name: "Tu perfil" });
    expect(screen.queryByRole("button", { name: "Cambiar avatar" })).not.toBeInTheDocument();
  });

  it("abre una ventana con los 24 en orden; el actual va marcado y con el foco", async () => {
    await openPicker({ ...ASH, avatarId: 94 });
    const names = within(dialog())
      .getAllByRole("button")
      .map((button) => button.textContent?.trim())
      .filter((name) => AVATAR_POKEMON.some((p) => p.name === name));
    expect(names).toEqual(AVATAR_POKEMON.map((p) => p.name));
    expect(pokemonButton("Gengar")).toHaveAttribute("aria-pressed", "true");
    expect(pokemonButton("Pikachu")).toHaveAttribute("aria-pressed", "false");
    expect(pokemonButton("Gengar")).toHaveFocus();
  });

  it("sin avatar, el foco va al primero", async () => {
    await openPicker();
    expect(pokemonButton("Pikachu")).toHaveFocus();
  });

  it("elegir guarda, cierra y actualiza el perfil y el encabezado", async () => {
    const { user, services, container } = await openPicker();
    await user.click(pokemonButton("Gengar"));
    expect(services.endpoints.auth.saveAvatar).toHaveBeenCalledTimes(1);
    expect(services.endpoints.auth.saveAvatar).toHaveBeenCalledWith(94);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("img", { name: "Avatar: Gengar" })).toBeInTheDocument();
    expect(container.querySelector("header img[src$='/official-artwork/94.png']")).not.toBeNull();
  });

  it("tocar el que ya tienes solo cierra", async () => {
    const { user, services } = await openPicker({ ...ASH, avatarId: 94 });
    await user.click(pokemonButton("Gengar"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(services.endpoints.auth.saveAvatar).not.toHaveBeenCalled();
  });

  it("mientras guarda no admite otro toque", async () => {
    const services = fakeServices();
    let finish: (value: number | null) => void = () => {};
    services.endpoints.auth.saveAvatar = vi.fn(() => new Promise<number | null>((resolve) => (finish = resolve)));
    const { user } = await openPicker(ASH, services);
    await user.click(pokemonButton("Gengar"));
    await user.click(pokemonButton("Pikachu"));
    expect(services.endpoints.auth.saveAvatar).toHaveBeenCalledTimes(1);
    expect(services.endpoints.auth.saveAvatar).toHaveBeenCalledWith(94);
    finish(94);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("si falla, sigue abierta con el aviso y el avatar anterior", async () => {
    const services = fakeServices();
    services.endpoints.auth.saveAvatar = vi.fn(async () => {
      throw new ApiError(0, "NETWORK");
    });
    const { user } = await openPicker({ ...ASH, avatarId: 25 }, services);
    await user.click(pokemonButton("Gengar"));
    expect(await screen.findByText("No se pudo guardar tu avatar. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(dialog()).toBeInTheDocument();
    expect(pokemonButton("Pikachu")).toHaveAttribute("aria-pressed", "true");
    expect(pokemonButton("Gengar")).toHaveAttribute("aria-pressed", "false");
  });

  it("«Usar mis iniciales» solo aparece con un avatar, y lo quita", async () => {
    const without = await openPicker();
    expect(within(dialog()).queryByRole("button", { name: "Usar mis iniciales" })).not.toBeInTheDocument();
    without.unmount();

    const { user, services } = await openPicker({ ...ASH, avatarId: 94 });
    await user.click(within(dialog()).getByRole("button", { name: "Usar mis iniciales" }));
    expect(services.endpoints.auth.saveAvatar).toHaveBeenCalledWith(null);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("img", { name: /^Avatar:/ })).not.toBeInTheDocument();
  });

  it("Escape y «Cerrar» la cierran y el foco vuelve a «Cambiar avatar»", async () => {
    const { user } = await openPicker();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await changeButton()).toHaveFocus();

    await user.click(await changeButton());
    await user.click(within(dialog()).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await changeButton()).toHaveFocus();
  });

  it("el foco no sale de la ventana con Tab ni Mayús+Tab", async () => {
    const { user } = await openPicker({ ...ASH, avatarId: 94 });
    const close = within(dialog()).getByRole("button", { name: "Cerrar" });
    close.focus();
    await user.tab();
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
    expect(pokemonButton("Pikachu")).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it("tras un clic fuera de los botones (el foco cae en la página), Escape sigue cerrando", async () => {
    const { user } = await openPicker();
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tras un clic fuera de los botones, Tab y Mayús+Tab vuelven a la ventana", async () => {
    const { user } = await openPicker({ ...ASH, avatarId: 94 });
    (document.activeElement as HTMLElement).blur();
    await user.tab();
    expect(pokemonButton("Pikachu")).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    await user.tab({ shift: true });
    expect(within(dialog()).getByRole("button", { name: "Cerrar" })).toHaveFocus();
  });
});
