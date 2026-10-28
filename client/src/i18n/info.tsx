import { GAME_KINDS } from "@pokemon-minigames/shared";
import type { ReactNode } from "react";
import { FEEDBACK_REPO_URL, GITHUB_PROFILE_URL, newIssueUrl } from "../links";
import { GAME_CARDS } from "./es";

/*
 * Las páginas de información del pie. Los textos describen lo que el juego hace de verdad (ver la spec
 * docs/superpowers/specs/2026-10-27-inicio-y-pie-design.md, «Qué hace el juego con los datos»): si el juego cambia lo
 * que guarda, hay que cambiar Privacidad.
 */

export const INFO_SLUGS = ["acerca", "contacto", "faq", "privacidad", "terminos", "aviso-legal", "apoya"] as const;
export type InfoSlug = (typeof INFO_SLUGS)[number];

export interface InfoPageContent {
  path: string;
  /** El título de la página (h1). */
  title: string;
  /** El texto del enlace en el pie. */
  footerLabel: string;
  body: ReactNode;
}

const UPDATED = "Última actualización: 27 de octubre de 2026.";

/** Un enlace a otro sitio: se abre aparte y sin acceso a esta ventana. */
function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
      {children}
    </a>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="font-display text-lg font-semibold">{title}</h2>
    {children}
  </section>
);

const List = ({ children }: { children: ReactNode }) => <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>;

const PUBLIC_WARNING = "Las issues son públicas: no pongas tu correo, tu contraseña ni otros datos personales.";

export const INFO_PAGES: Record<InfoSlug, InfoPageContent> = {
  acerca: {
    path: "/acerca",
    title: "Acerca de PokeMiniGames",
    footerLabel: "Acerca de",
    body: (
      <>
        <p>
          PokeMiniGames es una colección de minijuegos Pokémon para jugar 1 vs 1 con tus amigos, en tiempo real y desde el
          navegador. Es gratis, no tiene anuncios y no hace falta instalar nada.
        </p>
        <p>
          Lo hace Marco, un estudiante, como proyecto de portafolio: puedes ver su trabajo en{" "}
          <External href={GITHUB_PROFILE_URL}>su perfil de GitHub</External>. Está hecho con React, Node.js, Socket.io y
          PostgreSQL.
        </p>
        <p>
          Es un proyecto de fans, no oficial: Pokémon y sus personajes son de Nintendo, Game Freak y The Pokémon Company, sin
          relación con ellos.
        </p>
      </>
    ),
  },
  contacto: {
    path: "/contacto",
    title: "Contacto",
    footerLabel: "Contacto",
    body: (
      <>
        <p>
          Los mensajes se reciben en un repositorio público de GitHub,{" "}
          <External href={FEEDBACK_REPO_URL}>pokeminigames-comentarios</External>. Necesitas una cuenta de GitHub (es
          gratis).
        </p>
        <List>
          <li>
            ¿Tienes una idea o un minijuego en mente? <External href={newIssueUrl("idea")}>Cuéntala</External>.
          </li>
          <li>
            ¿Algo no funciona? <External href={newIssueUrl("error")}>Avisa del error</External>.
          </li>
        </List>
        <p>{PUBLIC_WARNING}</p>
        <p>Para borrar tu cuenta no hace falta escribir: entra en tu perfil y usa «Borrar mi cuenta».</p>
      </>
    ),
  },
  faq: {
    path: "/faq",
    title: "Preguntas frecuentes",
    footerLabel: "FAQ",
    body: (
      <>
        <Section title="¿A qué se juega?">
          <List>
            {GAME_KINDS.map((game) => (
              <li key={game}>
                <strong>{GAME_CARDS[game].name}:</strong> {GAME_CARDS[game].description}
              </li>
            ))}
          </List>
        </Section>
        <Section title="¿Cómo juego con un amigo?">
          <p>
            Elige un minijuego en el menú y pulsa «Crear sala». Pásale a tu amigo el código de la sala: lo escribe en «Unirse
            a una sala» y la partida empieza.
          </p>
        </Section>
        <Section title="¿Necesito una cuenta?">
          <p>
            No: puedes entrar como invitado solo con un nombre. Con una cuenta, tus partidas de «Doble tipo» se guardan y
            tienes perfil, estadísticas, historial y avatar.
          </p>
        </Section>
        <Section title="¿Es oficial? ¿Cuesta algo?">
          <p>No es oficial: es un proyecto de fans. Y es gratis, sin anuncios ni compras.</p>
        </Section>
        <Section title="¿Cómo borro mi cuenta?">
          <p>Entra en tu perfil y usa «Borrar mi cuenta» al final de la página; te pedirá tu contraseña.</p>
        </Section>
      </>
    ),
  },
  privacidad: {
    path: "/privacidad",
    title: "Privacidad",
    footerLabel: "Privacidad",
    body: (
      <>
        <p>{UPDATED}</p>
        <Section title="Qué se guarda">
          <List>
            <li>
              <strong>Si creas una cuenta:</strong> tu correo, tu nombre de usuario, tu contraseña cifrada (nunca se guarda tal
              cual), la fecha de alta, el tema que elijas y tu avatar.
            </li>
            <li>
              <strong>Tus partidas de «Doble tipo»:</strong> los jugadores, las rondas, los Pokémon y los puntos, para tu
              perfil y tus estadísticas. Las de «¿Quién es ese Pokémon?» no se guardan.
            </li>
            <li>
              <strong>Si entras como invitado:</strong> solo el nombre, mientras dura la sesión; tus partidas no se guardan.
            </li>
          </List>
        </Section>
        <Section title="Cookies y almacenamiento del navegador">
          <p>
            Solo se usa la cookie necesaria para mantener tu sesión iniciada (una para las cuentas y otra para los
            invitados). No hay cookies de publicidad ni de analítica. El navegador recuerda el tema que elegiste.
          </p>
        </Section>
        <Section title="Con quién se comparte">
          <p>
            Con nadie: no se vende nada ni hay anuncios. El juego está alojado en Render (servidor) y Neon (base de datos),
            que como cualquier servidor pueden registrar direcciones IP en sus registros técnicos. Las imágenes de los
            Pokémon se cargan de PokeAPI y GitHub. Para evitar abusos, el servidor cuenta durante un rato los intentos de
            inicio de sesión por dirección IP.
          </p>
        </Section>
        <Section title="Borrar tu cuenta">
          <p>
            En tu perfil, «Borrar mi cuenta» (con tu contraseña) borra tu correo, tu nombre, tu contraseña y tu avatar, y
            cierra tus sesiones. Tus partidas siguen en el historial de tus rivales como «Cuenta borrada», sin nada que te
            identifique.
          </p>
        </Section>
      </>
    ),
  },
  terminos: {
    path: "/terminos",
    title: "Términos de uso",
    footerLabel: "Términos",
    body: (
      <>
        <p>{UPDATED}</p>
        <List>
          <li>PokeMiniGames es gratis y se ofrece tal cual, sin garantías: puede fallar, cambiar o cerrar en cualquier momento.</li>
          <li>Juega limpio y con respeto. Los nombres de usuario ofensivos o que suplanten a otra persona pueden retirarse.</li>
          <li>No intentes romper el juego ni saturar el servidor.</li>
          <li>Al crear una cuenta aceptas lo que explica la página de Privacidad.</li>
        </List>
      </>
    ),
  },
  "aviso-legal": {
    path: "/aviso-legal",
    title: "Aviso legal",
    footerLabel: "Aviso legal",
    body: (
      <>
        <p>
          PokeMiniGames es un proyecto de fans sin fines de lucro. Pokémon y sus personajes son marcas de Nintendo, Game Freak
          y The Pokémon Company; no hay relación con ellos ni respaldo suyo.
        </p>
        <p>
          El arte y los datos de los Pokémon salen de <External href="https://pokeapi.co">PokeAPI</External>.
        </p>
        <p>
          Si tienes derechos sobre algo que aparece aquí y quieres que se retire, escribe por la vía de Contacto y se
          retirará.
        </p>
        <p>Estos textos explican cómo funciona el juego con palabras sencillas; no es asesoría legal.</p>
      </>
    ),
  },
  apoya: {
    path: "/apoya",
    title: "Apoya el proyecto",
    footerLabel: "Apoya el proyecto",
    body: (
      <>
        <p>PokeMiniGames es gratis y seguirá siéndolo. La mejor forma de apoyarlo:</p>
        <List>
          <li>Compártelo con tus amigos y juega con ellos.</li>
          <li>
            Propón minijuegos o mejoras: <External href={newIssueUrl("idea")}>cuenta tu idea</External>.
          </li>
          <li>
            Si algo falla, <External href={newIssueUrl("error")}>avisa del error</External>.
          </li>
        </List>
        <p>{PUBLIC_WARNING}</p>
      </>
    ),
  },
};
