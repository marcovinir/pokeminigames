import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { LoginPage } from "../../src/pages/AuthPages";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { LocationProbe, type FakeServices, fakeServices, renderWithServices, signIn } from "../helpers/services";

function renderAt(route: string, services: FakeServices = fakeServices()) {
  signIn(services);
  const utils = renderWithServices(
    <>
      <Routes>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/jugador/:username" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
      <LocationProbe />
    </>,
    { services, route },
  );
  return { ...utils, services, user: userEvent.setup() };
}

const openForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: "Borrar mi cuenta" }));
};

describe("Borrar mi cuenta", () => {
  it("está en el perfil propio, con el aviso, y no en el de otra persona", async () => {
    renderAt("/perfil");
    expect(await screen.findByRole("heading", { name: "Borrar mi cuenta" })).toBeInTheDocument();
    expect(screen.getByText(/no se puede deshacer/i)).toBeInTheDocument();
    expect(screen.getByText(/«Cuenta borrada»/)).toBeInTheDocument();
  });

  it("no aparece en el perfil de otra persona", async () => {
    renderAt("/jugador/misty");
    expect(await screen.findByRole("heading", { name: "misty" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Borrar mi cuenta" })).not.toBeInTheDocument();
  });

  it("sin contraseña no llama a la API", async () => {
    const { services, user } = renderAt("/perfil");
    await openForm(user);
    await user.click(screen.getByRole("button", { name: "Borrar mi cuenta para siempre" }));
    expect(services.endpoints.auth.deleteAccount).not.toHaveBeenCalled();
    expect(screen.getByText("Escribe tu contraseña.")).toBeInTheDocument();
  });

  it("con la contraseña la borra, cierra la sesión y lleva a /login con un aviso", async () => {
    const { services, user } = renderAt("/perfil");
    await openForm(user);
    await user.type(screen.getByLabelText("Contraseña"), "secreta");
    await user.click(screen.getByRole("button", { name: "Borrar mi cuenta para siempre" }));
    expect(services.endpoints.auth.deleteAccount).toHaveBeenCalledWith("secreta");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
    expect(services.session.getState().status).toBe("anonymous");
    expect(screen.getByText("Tu cuenta se borró.")).toBeInTheDocument();
  });

  it("si la contraseña no es la suya lo dice y la sesión sigue", async () => {
    const services = fakeServices();
    services.endpoints.auth.deleteAccount = vi.fn(async () => {
      throw new ApiError(403, "WRONG_PASSWORD");
    });
    const { user } = renderAt("/perfil", services);
    await openForm(user);
    await user.type(screen.getByLabelText("Contraseña"), "otra");
    await user.click(screen.getByRole("button", { name: "Borrar mi cuenta para siempre" }));
    expect(await screen.findByText("La contraseña no es correcta.")).toBeInTheDocument();
    expect(services.session.getState().status).toBe("authenticated");
    expect(screen.getByTestId("location")).toHaveTextContent("/perfil");
  });
});

describe("una cuenta borrada en el historial", () => {
  it("se ve como «Cuenta borrada», sin enlace; un rival normal conserva su enlace", async () => {
    const services = fakeServices();
    const game = {
      endedAt: "2026-09-30T12:00:00.000Z",
      result: "won" as const,
      reason: "completed" as const,
      myScore: 1100,
      opponentScore: 0,
      config: { typeMode: "random" as const, lengthMode: "fixed_rounds" as const, roundsLimit: 3, statsGoal: null },
    };
    services.endpoints.stats.history = vi.fn(async () => ({
      games: [
        { ...game, id: "g1", opponent: { username: "borrada_3f2a9c1e77b4", avatarId: null } },
        { ...game, id: "g2", opponent: { username: "misty", avatarId: null } },
      ],
      nextCursor: null,
    }));
    renderAt("/perfil", services);
    expect(await screen.findByText("Cuenta borrada")).toBeInTheDocument();
    expect(screen.queryByText("borrada_3f2a9c1e77b4")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Cuenta borrada" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "misty" })).toHaveAttribute("href", "/jugador/misty");
  });
});
