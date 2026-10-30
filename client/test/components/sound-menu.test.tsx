import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/Header";
import { fakeServices, renderWithServices, signIn } from "../helpers/services";

const soundButton = () => screen.getByRole("button", { name: "Menú" });

describe("el control de sonido", () => {
  it("se llega por el menú del encabezado, con y sin sesión", () => {
    const anon = renderWithServices(<Header />);
    expect(soundButton()).toBeInTheDocument();
    anon.unmount();
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(soundButton()).toBeInTheDocument();
  });

  it("abre un panel con interruptores y volumen que cambian los ajustes", async () => {
    const { services } = renderWithServices(<Header />);
    const user = userEvent.setup();
    await user.click(soundButton());
    expect(soundButton()).toHaveAttribute("aria-expanded", "true");

    const music = screen.getByRole("switch", { name: "Música" });
    const effects = screen.getByRole("switch", { name: "Efectos" });
    expect(music).toBeChecked();
    expect(effects).toBeChecked();
    await user.click(music);
    expect(services.soundSettings.getState().settings.musicOn).toBe(false);
    await user.click(effects);
    expect(services.soundSettings.getState().settings.effectsOn).toBe(false);

    fireEvent.change(screen.getByRole("slider", { name: "Volumen de la música" }), { target: { value: "20" } });
    expect(services.soundSettings.getState().settings.musicVolume).toBeCloseTo(0.2);
    fireEvent.change(screen.getByRole("slider", { name: "Volumen de los efectos" }), { target: { value: "90" } });
    expect(services.soundSettings.getState().settings.effectsVolume).toBeCloseTo(0.9);
  });

});
