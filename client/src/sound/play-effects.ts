import type { ServerEvent } from "@pokemon-minigames/shared";
import type { GameView } from "../game/apply-event";
import { effectsForEvent } from "./cues";
import type { SoundService } from "./sound-service";

/** El oyente que el store de la partida llama con cada evento: toca los efectos que corresponden. */
export function soundEffectsListener(sound: Pick<SoundService, "play">) {
  return (before: GameView, event: ServerEvent, after: GameView): void => {
    for (const { effect, delayMs } of effectsForEvent(before, event, after)) sound.play(effect, delayMs);
  };
}
