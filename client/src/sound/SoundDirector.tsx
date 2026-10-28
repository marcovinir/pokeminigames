import { useEffect } from "react";
import { useLocation } from "react-router";
import { useGame, useServices, useSession } from "../services";
import { musicCueFor } from "./cues";

/**
 * Elige la música según la pantalla y la fase de la partida, y la pide al servicio solo cuando cambia de zona (el servicio
 * tampoco reinicia la misma). La zona queda en `<html data-music>` para que la E2E pueda comprobarla.
 */
export function SoundDirector() {
  const { sound } = useServices();
  const { pathname } = useLocation();
  const view = useGame((s) => s.view);
  const session = useSession((s) => s.status);
  const cue = musicCueFor(pathname, view, session);
  const key = cue === null ? null : cue.zone === "final" ? `final:${cue.outcome}` : cue.zone;

  useEffect(() => {
    if (cue === null) return; // Sin cambio: sigue lo que sonaba.
    sound.setMusic(cue);
    document.documentElement.dataset.music = cue.zone;
    // `cue` cambia de identidad en cada render; lo que importa es la zona (y el resultado del final).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound, key]);

  return null;
}
