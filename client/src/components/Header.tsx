import { Link } from "react-router";
import { useServices, useSession } from "../services";
import { Button } from "./Button";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function Header() {
  const user = useSession((s) => s.user);
  const { session } = useServices();

  return (
    <header className="border-b-(length:--frame) border-line bg-header text-header-fg">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="font-num text-lg font-medium">
          Pokémon Minigames
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <ThemeSwitcher />
          {user ? (
            <>
              <span className="text-sm">{user.username}</span>
              <Button variant="header" onClick={() => void session.getState().logout()}>
                Cerrar sesión
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
