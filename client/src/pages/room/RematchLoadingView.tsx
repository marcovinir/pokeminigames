import { gameOf } from "@pokemon-minigames/shared";
import { lobbyPath } from "../lobby-path";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Avatar } from "../../components/Avatar";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { GuestTag } from "../../components/GuestTag";
import { Notice } from "../../components/Notice";
import { rise } from "../../components/rise";
import { REMATCH_TEXT, rematchEntering, rematchNoShow } from "../../i18n/es";
import { focusWasLost } from "./RematchPanel";
import { useRoom } from "./use-room";

/**
 * «¡Revancha!»: entre que los dos aceptan y empieza la cuenta atrás. Se ve en el resumen mientras el servidor crea la sala
 * y en la sala nueva hasta que entran los dos (casi siempre 1–2 s). En la sala vieja nadie ha entrado aún a la nueva:
 * quien mira ya está listo (aceptó) y el rival, entrando. (No hay ficha de «rival listo»: con los dos dentro la sala pasa
 * a la cuenta atrás antes de que se pudiera ver.)
 */
export function RematchLoadingView() {
  const { view, me, opponent, client } = useRoom();
  const navigate = useNavigate();
  const rival = opponent?.username ?? "Tu rival";
  const inNewRoom = view.isRematchRoom && view.phase === "waiting";
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Se llega aquí pulsando «Aceptar», que desaparece: el foco va al título en vez de perderse.
  useEffect(() => {
    if (focusWasLost()) titleRef.current?.focus();
  }, []);

  return (
    <Card as="section" tone="raised" style={rise(0)} className="animate-rise mx-auto w-full max-w-lg p-6 text-center sm:p-8">
      <h1 ref={titleRef} tabIndex={-1} className="font-display text-3xl font-semibold outline-none">
        {REMATCH_TEXT.loadingTitle}
      </h1>
      <div className="mt-6 flex items-center justify-center gap-5">
        <Avatar name={me?.username ?? "Tú"} avatarId={me?.avatarId} size="lg" />
        <span aria-hidden="true" className="pokeball animate-rock" />
        <Avatar name={rival} avatarId={opponent?.avatarId} size="lg" />
      </div>
      <p className="mt-5 text-sm text-muted">{REMATCH_TEXT.loadingSub}</p>
      <ul className="mt-3 flex flex-wrap justify-center gap-2">
        <li>
          <Badge tone="success">{REMATCH_TEXT.youReady}</Badge>
        </li>
        <li className="flex min-w-0 max-w-full items-center gap-1.5">
          <Badge tone="gold" className="max-w-full [overflow-wrap:anywhere]">
            {rematchEntering(rival)}
          </Badge>
          {opponent?.guest ? <GuestTag /> : null}
        </li>
      </ul>
      {/* En la sala nueva quien espera puede irse sin esperar los 30 s a que el rival entre. */}
      {inNewRoom ? (
        <div className="mt-6">
          <Button
            variant="ghost"
            onClick={() => {
              client.leave();
              navigate(lobbyPath(gameOf(view.config ?? {})));
            }}
          >
            {REMATCH_TEXT.backToLobby}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** La sala de la revancha caducó sin que el rival entrara: no hubo partida, así que no hay veredicto que enseñar. */
export function RematchNoShow() {
  const { view, opponent, client } = useRoom();
  const navigate = useNavigate();
  return (
    <section className="mx-auto max-w-md text-center">
      <Notice>
        {rematchNoShow(opponent?.username ?? "Tu rival")}
        {opponent?.guest ? (
          <>
            {" "}
            <GuestTag className="align-middle" />
          </>
        ) : null}
      </Notice>
      <div className="mt-4">
        <Button
          variant="primary"
          onClick={() => {
            client.leave();
            navigate(lobbyPath(gameOf(view.config ?? {})));
          }}
        >
          {REMATCH_TEXT.backToLobby}
        </Button>
      </div>
    </section>
  );
}
