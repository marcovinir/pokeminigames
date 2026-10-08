import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEmailVerification } from "../../src/session/auth-options";
import { fakeServices, renderWithServices } from "../helpers/services";

function Probe({ name = "sonda" }: { name?: string }) {
  return <p>{`${name}: ${useEmailVerification() ? "activa" : "apagada"}`}</p>;
}

describe("useEmailVerification", () => {
  it("empieza como apagada (todo como antes) y pasa a activa cuando el servidor lo dice", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.options).mockResolvedValue({ emailVerification: true });
    renderWithServices(<Probe />, { services });
    expect(screen.getByText("sonda: apagada")).toBeInTheDocument();
    expect(await screen.findByText("sonda: activa")).toBeInTheDocument();
  });

  it("si el servidor dice que está apagada, sigue apagada", async () => {
    const services = fakeServices();
    renderWithServices(<Probe />, { services });
    await waitFor(() => expect(services.endpoints.auth.options).toHaveBeenCalled());
    expect(screen.getByText("sonda: apagada")).toBeInTheDocument();
  });

  it("si la consulta falla se queda apagada, sin romper la pantalla, y la próxima vez se vuelve a preguntar", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.options).mockRejectedValueOnce(new Error("sin red"));
    const first = renderWithServices(<Probe />, { services });
    await waitFor(() => expect(services.endpoints.auth.options).toHaveBeenCalledTimes(1));
    expect(screen.getByText("sonda: apagada")).toBeInTheDocument();
    first.unmount();

    vi.mocked(services.endpoints.auth.options).mockResolvedValueOnce({ emailVerification: true });
    renderWithServices(<Probe />, { services });
    expect(await screen.findByText("sonda: activa")).toBeInTheDocument();
    expect(services.endpoints.auth.options).toHaveBeenCalledTimes(2);
  });

  it("varias pantallas a la vez preguntan una sola vez", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.options).mockResolvedValue({ emailVerification: true });
    renderWithServices(
      <>
        <Probe name="uno" />
        <Probe name="dos" />
      </>,
      { services },
    );
    expect(await screen.findByText("uno: activa")).toBeInTheDocument();
    expect(await screen.findByText("dos: activa")).toBeInTheDocument();
    expect(services.endpoints.auth.options).toHaveBeenCalledTimes(1);
  });

  it("no hace falta que haya una sesión: se pregunta también a quien aún no entró", async () => {
    const services = fakeServices();
    expect(services.session.getState().status).toBe("loading");
    renderWithServices(<Probe />, { services });
    await waitFor(() => expect(services.endpoints.auth.options).toHaveBeenCalled());
  });
});
