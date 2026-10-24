import { avatarPokemonName } from "@pokemon-minigames/shared";
import { useNavigate, useParams } from "react-router";
import { ApiError } from "../../api/client";
import { isGuest } from "../../api/types";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { LogoMark } from "../../components/Logo";
import { Notice } from "../../components/Notice";
import { rise } from "../../components/rise";
import { avatarLabel, errorMessage } from "../../i18n/es";
import { useServices, useSession } from "../../services";
import { HistoryList } from "./HistoryList";
import { StatsView } from "./StatsView";
import { useLoad } from "./use-load";

/**
 * `/perfil` es el propio (estadísticas e historial); `/jugador/:username` es el de otra persona: las mismas
 * estadísticas, sin historial.
 */
export function ProfilePage() {
  const { username } = useParams();
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const sessionUser = useSession((s) => s.user);
  const own = username === undefined;
  const { state, reload } = useLoad(
    () => (username === undefined ? endpoints.stats.mine() : endpoints.stats.forUser(username)),
    [endpoints, username],
  );

  if (state.status === "loading") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-12 text-muted">
        <LogoMark size={40} className="animate-spin-slow" />
        <p>Cargando perfil…</p>
      </div>
    );
  }

  if (state.status === "error") {
    const notFound = state.error instanceof ApiError && state.error.code === "USER_NOT_FOUND";
    const message = state.error instanceof ApiError ? state.error.message : errorMessage(undefined);
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <div data-lost aria-hidden="true">
          <LogoMark size={72} className="opacity-40" />
        </div>
        <Notice tone="danger">{message}</Notice>
        {notFound ? (
          <Button variant="primary" onClick={() => navigate("/")}>
            Volver al lobby
          </Button>
        ) : (
          <Button variant="primary" onClick={reload}>
            Reintentar
          </Button>
        )}
      </section>
    );
  }

  const { username: name, stats } = state.data;
  // El propio sale de la sesión (se actualiza al instante al cambiarlo); el ajeno, de sus estadísticas.
  const avatarId = own ? (sessionUser && !isGuest(sessionUser) ? sessionUser.avatarId : null) : state.data.avatarId;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header style={rise(0)} className="animate-rise flex items-center gap-4">
        <Avatar name={name} avatarId={avatarId} label={avatarId !== null ? avatarLabel(avatarPokemonName(avatarId)) : undefined} size="xl" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-semibold">{own ? "Tu perfil" : name}</h1>
          {own ? <p className="truncate text-muted">{name}</p> : null}
        </div>
      </header>
      <StatsView stats={stats} own={own} />
      {own ? <HistoryList /> : null}
      <div>
        <Button onClick={() => navigate("/")}>Volver al lobby</Button>
      </div>
    </div>
  );
}
