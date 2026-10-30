import { Link, useLocation } from "react-router";
import { isGuest } from "../api/types";
import { HEADER_MENU_TEXT, TYPES_TEXT } from "../i18n/es";
import { useSession } from "../services";
import { Avatar } from "./Avatar";
import { GuestTag } from "./GuestTag";
import { HeaderMenu } from "./HeaderMenu";
import { Logo } from "./Logo";

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

const TILE = "flex items-center gap-2 rounded-ui border-2 px-3 py-1.5 font-display text-sm font-semibold";
const BAR_TILE = `${TILE} border-header-fg/40 hover:bg-header-fg/15`;
const PANEL_TILE = `${TILE} border-line hover:bg-surface-2`;

/** Los accesos a las secciones: rectángulos con su icono, en la barra (escritorio) o dentro del menú (pantallas estrechas). */
function Shortcuts({ tileClassName, onChoose }: { tileClassName: string; onChoose?: () => void }) {
  return (
    <Link to="/tipos" onClick={onChoose} className={tileClassName}>
      <GridIcon />
      {TYPES_TEXT.link}
    </Link>
  );
}

export function Header() {
  const user = useSession((s) => s.user);
  const guest = isGuest(user);
  // En una sala no se ofrece: salir de la página cierra la conexión con la partida.
  const inRoom = useLocation().pathname.startsWith("/sala/");

  return (
    <header data-app-header className="sticky top-0 z-20 h-(--header-h) border-b-(length:--frame) border-line bg-header text-header-fg">
      {/* `relative`: el panel del menú se ancla a este contenedor y no a su botón. */}
      <div className="relative mx-auto flex h-full max-w-5xl items-center gap-2 px-4 sm:gap-3">
        {/* Luces de adorno: solo en el tema Pokédex (el encabezado rojo tipo consola) y con sitio de sobra: en pantallas estrechas desbordaban la fila. */}
        <span data-leds aria-hidden="true" className="hidden items-center gap-1.5 md:in-data-[theme=pokedex]:flex">
          <span className="size-6 rounded-full border-2 border-header-fg bg-accent-2" />
          <span className="size-2 rounded-full bg-gold" />
          <span className="size-2 rounded-full bg-success" />
          <span className="size-2 rounded-full bg-danger" />
        </span>
        <Link to="/" className="shrink-0 rounded-ui">
          <Logo hideNameOnMobile={Boolean(user)} />
        </Link>
        {inRoom ? null : (
          <nav aria-label={HEADER_MENU_TEXT.sections} className="ml-3 hidden items-center gap-2 lg:flex">
            <Shortcuts tileClassName={BAR_TILE} />
          </nav>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-3">
          {user ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={user.username} avatarId={guest ? null : user.avatarId} size="sm" />
              {guest ? <GuestTag /> : null}
              <span className="hidden max-w-40 truncate font-display text-sm font-semibold lg:inline">{user.username}</span>
            </span>
          ) : null}
          <HeaderMenu
            shortcuts={
              inRoom
                ? undefined
                : (close) => (
                    <div className="flex flex-col gap-2 lg:hidden">
                      <Shortcuts tileClassName={PANEL_TILE} onChoose={close} />
                    </div>
                  )
            }
          />
        </div>
      </div>
    </header>
  );
}
