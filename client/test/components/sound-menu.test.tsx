import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/Header";
import { fakeServices, renderWithServices, signIn } from "../helpers/services";

const soundButton = () => screen.getByRole("button", { name: /Sonido/ });

describe("el control de sonido", () => {
  it("está en el encabezado, con y sin sesión", () => {
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

  it("Escape cierra el panel y devuelve el foco al botón", async () => {
    renderWithServices(<Header />);
    const user = userEvent.setup();
    await user.click(soundButton());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("switch", { name: "Música" })).not.toBeInTheDocument();
    expect(soundButton()).toHaveFocus();
  });

  it("sacar el foco del panel con Tab lo cierra", async () => {
    renderWithServices(
      <>
        <Header />
        <button type="button">Después</button>
      </>,
    );
    const user = userEvent.setup();
    await user.click(soundButton());
    screen.getByRole("slider", { name: "Volumen de los efectos" }).focus();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.queryByRole("switch", { name: "Música" })).not.toBeInTheDocument();
  });

  it("el botón dice si todo está silenciado", async () => {
    const { services } = renderWithServices(<Header />);
    expect(soundButton()).toHaveAccessibleName("Sonido");
    services.soundSettings.getState().update({ musicOn: false });
    expect(await screen.findByRole("button", { name: "Sonido" })).toBeInTheDocument();
    services.soundSettings.getState().update({ effectsOn: false });
    expect(await screen.findByRole("button", { name: "Sonido (silenciado)" })).toBeInTheDocument();
  });
});
