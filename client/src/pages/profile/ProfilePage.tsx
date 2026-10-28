import { avatarPokemonName } from "@pokemon-minigames/shared";
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiError } from "../../api/client";
import { isGuest } from "../../api/types";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { LogoMark } from "../../components/Logo";
import { Notice } from "../../components/Notice";
import { rise } from "../../components/rise";
import { AVATAR_TEXT, MENU_TEXT, avatarLabel, errorMessage } from "../../i18n/es";
import { useServices, useSession } from "../../services";
import { AvatarPicker } from "./AvatarPicker";
import { DeleteAccount } from "./DeleteAccount";
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
  const [picking, setPicking] = useState(false);
  // Al cerrar la ventana el foco vuelve a «Cambiar avatar» (Button no reenvía refs: se busca dentro de su envoltorio).
  const changeRef = useRef<HTMLDivElement>(null);
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
  const account = sessionUser && !isGuest(sessionUser) ? sessionUser : null;
  const avatarId = own ? (account?.avatarId ?? null) : state.data.avatarId;
  const closePicker = () => {
    setPicking(false);
    changeRef.current?.querySelector("button")?.focus();
  };
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header style={rise(0)} className="animate-rise flex items-center gap-4">
        <Avatar name={name} avatarId={avatarId} label={avatarId !== null ? avatarLabel(avatarPokemonName(avatarId)) : undefined} size="xl" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-semibold">{own ? "Tu perfil" : name}</h1>
          {own ? <p className="truncate text-muted">{name}</p> : null}
          {own && account ? (
            <div ref={changeRef} className="mt-2">
              <Button onClick={() => setPicking(true)}>{AVATAR_TEXT.change}</Button>
            </div>
          ) : null}
        </div>
      </header>
      {picking ? <AvatarPicker current={avatarId} name={name} onClose={closePicker} /> : null}
      <StatsView stats={stats} own={own} />
      {own ? <HistoryList /> : null}
      {own && account ? <DeleteAccount /> : null}
      <div>
        <Button onClick={() => navigate("/")}>{MENU_TEXT.backToMenu}</Button>
      </div>
    </div>
  );
}
