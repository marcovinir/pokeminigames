import type { StoreApi } from "zustand";
import type { MusicCue, SoundEffect } from "./cues";
import { type AudioLike, type Timers, createMusicPlayer } from "./music-player";
import type { SoundSettingsState } from "./settings-store";
import { type Synth, createSynth } from "./synth";

/** Lo que la interfaz usa del sonido. En las pruebas se reemplaza por un doble que registra las llamadas. */
export interface SoundService {
  /** Un efecto, ahora o tras `delayMs`. No hace nada con los efectos apagados. */
  play(effect: SoundEffect, delayMs?: number): void;
  /** La música de un momento; pedir el mismo otra vez no la reinicia. */
  setMusic(cue: MusicCue): void;
  /** Despierta el audio (el navegador no deja sonar nada hasta la primera interacción). */
  unlock(): void;
  dispose(): void;
}

export interface SoundServiceDeps {
  settings: StoreApi<SoundSettingsState>;
  createAudio(src: string): AudioLike;
  createContext(): AudioContext;
  random(): number;
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  timers: Timers;
}

/** Los eventos que el navegador cuenta como interacción para dejar sonar audio. */
const UNLOCK_EVENTS = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;

export function createSoundService(deps: SoundServiceDeps): SoundService {
  const settings = () => deps.settings.getState().settings;
  const visible = () => deps.document.visibilityState !== "hidden";

  const player = createMusicPlayer({
    createAudio: deps.createAudio,
    random: deps.random,
    timers: deps.timers,
    canPlay: () => settings().musicOn && visible(),
    volume: () => settings().musicVolume,
  });

  // El contexto de audio se crea con la primera interacción: antes, el navegador lo deja suspendido y lo que se programara
  // en él sonaría todo de golpe al despertarlo.
  let ctx: AudioContext | null = null;
  let synth: Synth | null = null;
  const ensureSynth = (): Synth | null => {
    try {
      ctx ??= deps.createContext();
      synth ??= createSynth(ctx);
      return synth;
    } catch {
      return null; // Sin Web Audio (navegador viejo): el juego sigue sin efectos.
    }
  };

  const unlock = () => {
    if (ensureSynth()) ctx?.resume().catch(() => {});
    player.resume();
  };
  const onVisibility = () => (visible() ? player.resume() : player.pause());
  // La primera interacción desbloquea el audio. En el teléfono un toque solo cuenta al levantar el dedo (pointerup,
  // touchend, click), no en pointerdown. Se sigue escuchando porque cada vuelta a la pestaña puede necesitarlo.
  for (const type of UNLOCK_EVENTS) deps.document.addEventListener(type, unlock);
  deps.document.addEventListener("visibilitychange", onVisibility);

  let previous = settings();
  const unsubscribe = deps.settings.subscribe(({ settings: next }) => {
    if (next.musicOn !== previous.musicOn) {
      if (next.musicOn) player.resume();
      else player.pause();
    }
    if (next.musicVolume !== previous.musicVolume) player.applyVolume();
    previous = next;
  });

  return {
    play(effect, delayMs = 0) {
      if (!settings().effectsOn) return;
      const run = () => {
        if (!settings().effectsOn) return;
        // Sin desbloquear (o aún suspendido) no se programa nada: no debe sonar todo junto al primer toque.
        if (!synth || ctx?.state !== "running") return;
        try {
          synth.play(effect, settings().effectsVolume);
        } catch {
          // Un efecto que falla no debe romper la partida.
        }
      };
      if (delayMs > 0) deps.timers.setTimeout(run, delayMs);
      else run();
    },
    setMusic: (cue) => player.setCue(cue),
    unlock,
    dispose() {
      for (const type of UNLOCK_EVENTS) deps.document.removeEventListener(type, unlock);
      deps.document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      player.stop();
      ctx?.close().catch(() => {});
    },
  };
}
