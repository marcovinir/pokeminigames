import { useNavigate, useParams } from "react-router";
import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { errorMessage } from "../../i18n/es";
import { useServices } from "../../services";
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
  const own = username === undefined;
  const { state, reload } = useLoad(
    () => (username === undefined ? endpoints.stats.mine() : endpoints.stats.forUser(username)),
    [endpoints, username],
  );

  if (state.status === "loading") {
    return (
      <p role="status" className="text-center text-muted">
        Cargando perfil…
      </p>
    );
  }

  if (state.status === "error") {
    const notFound = state.error instanceof ApiError && state.error.code === "USER_NOT_FOUND";
    const message = state.error instanceof ApiError ? state.error.message : errorMessage(undefined);
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
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
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-medium">{own ? "Tu perfil" : name}</h1>
        {own ? <p className="text-muted">{name}</p> : null}
      </header>
      <StatsView stats={stats} own={own} />
      {own ? <HistoryList /> : null}
      <div>
        <Button onClick={() => navigate("/")}>Volver al lobby</Button>
      </div>
    </div>
  );
}
