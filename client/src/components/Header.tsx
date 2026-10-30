import { Link, useLocation } from "react-router";
import { isGuest } from "../api/types";
import { TYPES_TEXT } from "../i18n/es";
import { useServices, useSession } from "../services";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { GuestTag } from "./GuestTag";
import { Logo } from "./Logo";
import { SoundMenu } from "./SoundMenu";
import { ThemeMenu } from "./ThemeMenu";

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 lg:hidden" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 lg:hidden" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 sm:hidden" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 lg:hidden" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  );
}

export function Header() {
  const user = useSession((s) => s.user);
  const { session } = useServices();
  const guest = isGuest(user);
  // En una sala no se ofrece: salir de la página cierra la conexión con la partida.
  const inRoom = useLocation().pathname.startsWith("/sala/");

  return (
    <header data-app-header className="sticky top-0 z-20 h-(--header-h) border-b-(length:--frame) border-line bg-header text-header-fg">
      {/* `relative`: el panel del menú de apariencia se ancla a este contenedor y no a su botón, que con sesión queda a media fila. */}
      <div className="relative mx-auto flex h-full max-w-5xl items-center gap-2 px-4 sm:gap-3">
        {/* Luces de adorno: solo en el tema Pokédex (el encabezado rojo tipo consola). */}
        <span data-leds aria-hidden="true" className="hidden items-center gap-1.5 in-data-[theme=pokedex]:flex">
          <span className="size-6 rounded-full border-2 border-header-fg bg-accent-2" />
          <span className="size-2 rounded-full bg-gold" />
          <span className="size-2 rounded-full bg-success" />
          <span className="size-2 rounded-full bg-danger" />
        </span>
        <Link to="/" className="shrink-0 rounded-ui">
          <Logo hideNameOnMobile={Boolean(user)} />
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-3">
          {inRoom ? null : (
            <Link to="/tipos" className="inline-flex shrink-0 items-center gap-2 rounded-pill px-2 py-1.5 font-display text-sm font-semibold hover:bg-header-fg/15">
              <GridIcon />
              <span className="sr-only lg:not-sr-only">{TYPES_TEXT.link}</span>
            </Link>
          )}
          <SoundMenu />
          <ThemeMenu compact={Boolean(user)} />
          {user ? (
            <>
              {guest ? (
                // Un invitado no tiene perfil: en su lugar, el camino a tener cuenta.
                <Link to="/registro" className="inline-flex shrink-0 items-center gap-2 rounded-pill px-2 py-1.5 font-display text-sm font-semibold hover:bg-header-fg/15">
                  <UserPlusIcon />
                  <span className="sr-only sm:not-sr-only">Crear cuenta</span>
                </Link>
              ) : (
                <Link to="/perfil" className="inline-flex shrink-0 items-center gap-2 rounded-pill px-2 py-1.5 font-display text-sm font-semibold hover:bg-header-fg/15">
                  <UserIcon />
                  <span className="sr-only lg:not-sr-only">Mi perfil</span>
                </Link>
              )}
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={user.username} avatarId={guest ? null : user.avatarId} size="sm" />
                {guest ? <GuestTag /> : null}
                <span className="hidden max-w-40 truncate font-display text-sm font-semibold lg:inline">{user.username}</span>
              </span>
              <Button variant="header" className="shrink-0 max-lg:px-3" onClick={() => void session.getState().logout()}>
                <ExitIcon />
                <span className="sr-only lg:not-sr-only">Cerrar sesión</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
