import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "../../src/components/Footer";
import { AppRoutes } from "../../src/routes";
import { GUEST, LocationProbe, fakeServices, renderWithServices, signIn } from "../helpers/services";

const FEEDBACK = "https://github.com/marcovinir/pokeminigames-comentarios";

/** Las 7 páginas, en el orden del pie: [texto del enlace, ruta, título de la página]. */
const PAGES = [
  ["Acerca de", "/acerca", "Acerca de PokeMiniGames"],
  ["Contacto", "/contacto", "Contacto"],
  ["FAQ", "/faq", "Preguntas frecuentes"],
  ["Privacidad", "/privacidad", "Privacidad"],
  ["Términos", "/terminos", "Términos de uso"],
  ["Aviso legal", "/aviso-legal", "Aviso legal"],
  ["Apoya el proyecto", "/apoya", "Apoya el proyecto"],
] as const;

type Who = "anónimo" | "cuenta" | "invitado";

function renderAt(route: string, who: Who) {
  const services = fakeServices();
  if (who === "anónimo") services.session.setState({ status: "anonymous", user: null });
  if (who === "cuenta") signIn(services);
  if (who === "invitado") signIn(services, GUEST);
  return renderWithServices(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { services, route },
  );
}

const pageText = (path: string) => {
  const { unmount, container } = renderAt(path, "anónimo");
  const text = container.textContent ?? "";
  return { text, unmount };
};

describe("el pie", () => {
  it("tiene la navegación «Información» con las 7 páginas en orden", () => {
    renderWithServices(<Footer />);
    const nav = screen.getByRole("navigation", { name: "Información" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(PAGES.map(([label, path]) => [label, path]));
  });

  it("conserva el aviso de proyecto de fans", () => {
    renderWithServices(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Proyecto de fans sin fines de lucro.");
    expect(footer).toHaveTextContent("Arte y datos de PokeAPI.");
  });
});

describe("las páginas de información", () => {
  it.each(["anónimo", "cuenta", "invitado"] as const)("se ven %s, sin redirigir", (who) => {
    for (const [, path, title] of PAGES) {
      const { unmount } = renderAt(path, who);
      expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent(path);
      unmount();
    }
  });

  it("«Volver» lleva a /login sin sesión y al menú con ella", () => {
    const anon = renderAt("/faq", "anónimo");
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/login");
    anon.unmount();
    renderAt("/faq", "invitado");
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/");
  });

  it("Contacto enlaza a las plantillas de idea y de error y avisa de que son públicas", () => {
    renderAt("/contacto", "anónimo");
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(`${FEEDBACK}/issues/new?template=idea.yml`);
    expect(hrefs).toContain(`${FEEDBACK}/issues/new?template=error.yml`);
    expect(document.body).toHaveTextContent(/públicas/);
  });

  it("los enlaces externos abren aparte sin dar acceso a esta ventana", () => {
    renderAt("/contacto", "anónimo");
    for (const link of screen.getAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("https://"))) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("Acerca de da el crédito de la música que lo exige, con su licencia y enlace, y agradece a los demás", () => {
    renderAt("/acerca", "anónimo");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Trevor Lentz");
    expect(text).toContain("CC-BY-SA 3.0");
    expect(text).toContain("SuperGamersGames");
    expect(text).toContain("CC-BY 4.0");
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("https://opengameart.org/content/town-center");
    expect(hrefs).toContain("https://opengameart.org/content/6-chiptune-loops");
    for (const author of ["Joth", "Aureolus_Omicron", "Wolfgang_", "Centurion_of_war"]) expect(text).toContain(author);
  });

  it("Acerca de enlaza al perfil de GitHub de Marco", () => {
    renderAt("/acerca", "anónimo");
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toContain("https://github.com/marcovinir");
  });

  it("ninguna página pide dinero", () => {
    for (const [, path] of PAGES) {
      const { text, unmount } = pageText(path);
      expect(text, path).not.toMatch(/donar|donaci|precio|premium/i);
      unmount();
    }
  });

  it("Privacidad dice que los límites por IP cubren inicio de sesión, registro, invitados y peticiones", () => {
    const { text } = pageText("/privacidad");
    expect(text).toMatch(/inicio de sesión, los registros, las entradas como invitado y las peticiones/);
  });

  it("Privacidad explica la cookie, la contraseña cifrada y cómo borrar la cuenta, con fecha", () => {
    const { text } = pageText("/privacidad");
    expect(text).toMatch(/cookie/i);
    expect(text).toContain("contraseña cifrada");
    expect(text).toContain("Borrar mi cuenta");
    expect(text).toContain("Última actualización: 27 de octubre de 2026");
  });

  it("Aviso legal nombra a los dueños de Pokémon y dice que no es asesoría legal", () => {
    const { text } = pageText("/aviso-legal");
    expect(text).toContain("Nintendo");
    expect(text).toContain("no es asesoría legal");
  });

  it("FAQ explica cada minijuego y cómo jugar con un amigo", () => {
    const { text } = pageText("/faq");
    expect(text).toContain("Doble tipo");
    expect(text).toContain("¿Quién es ese Pokémon?");
    expect(text).toMatch(/código/);
  });
});
