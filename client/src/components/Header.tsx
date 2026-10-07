import { Link } from "react-router";
import { useServices, useSession } from "../services";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Logo } from "./Logo";
import { ThemeMenu } from "./ThemeMenu";

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 sm:hidden" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 sm:hidden" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  );
}

export function Header() {
  const user = useSession((s) => s.user);
  const { session } = useServices();

  return (
    <header className="sticky top-0 z-20 border-b-(length:--frame) border-line bg-header text-header-fg">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 sm:gap-3">
        <Link to="/" className="rounded-ui">
          <Logo hideNameOnMobile={Boolean(user)} />
        </Link>
        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <ThemeMenu />
          {user ? (
            <>
              <Link to="/perfil" className="inline-flex items-center gap-2 rounded-pill px-2 py-1.5 text-sm font-semibold hover:bg-header-fg/15">
                <UserIcon />
                <span className="sr-only sm:not-sr-only">Mi perfil</span>
              </Link>
              <span className="flex items-center gap-2">
                <Avatar name={user.username} size="sm" />
                <span className="hidden text-sm font-semibold sm:inline">{user.username}</span>
              </span>
              <Button variant="header" onClick={() => void session.getState().logout()}>
                <ExitIcon />
                <span className="sr-only sm:not-sr-only">Cerrar sesión</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
