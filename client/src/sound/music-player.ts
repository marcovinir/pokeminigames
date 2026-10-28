import type { MusicCue } from "./cues";
import { BATTLE_TRACKS, LOBBY_TRACKS, LOSE_TRACK, type Track, WIN_TRACK } from "./tracks";

/** Lo que el reproductor necesita de `HTMLAudioElement`. */
export type AudioLike = Pick<HTMLAudioElement, "play" | "pause" | "loop" | "volume" | "currentTime" | "addEventListener" | "removeEventListener" | "removeAttribute" | "load">;

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface MusicPlayerDeps {
  createAudio(src: string): AudioLike;
  random(): number;
  timers: Timers;
  /** Si ahora debe sonar música (interruptor encendido y pestaña visible). */
  canPlay(): boolean;
  volume(): number;
}

export interface MusicPlayer {
  setCue(cue: MusicCue): void;
  /** Vuelve a intentar sonar (tras la primera interacción, al encender la música o al volver a la pestaña). */
  resume(): void;
  /** Pausa sin olvidar qué sonaba (música apagada o pestaña oculta). */
  pause(): void;
  applyVolume(): void;
  stop(): void;
}

/** El fundido al cambiar de tema. */
export const FADE_MS = 400;
const FADE_STEPS = 8;
/** El tema de final espera a que acabe el efecto de ganar o perder (que a su vez puede esperar 0,5 s al de la ronda). */
export const FINAL_DELAY_MS = 1700;

interface Playing {
  track: Track;
  main: AudioLike | null;
  intro: AudioLike | null;
  introDone: boolean;
  /** Un tema sin bucle (el final) que ya terminó: no vuelve a empezar. */
  finished: boolean;
}

const keyOf = (cue: MusicCue): string => (cue.zone === "final" ? `final:${cue.outcome}` : cue.zone);

/**
 * Un tema a la vez. Pedir la misma zona no reinicia nada; al cambiar, el tema anterior se funde y empieza uno al azar de
 * la zona sin repetir el último. *Porkymon* toca su entrada y después el bucle; el final suena una vez y luego silencio.
 * Si el navegador rechaza `play()` (aún no hubo interacción), se reintenta en `resume()`.
 */
export function createMusicPlayer(deps: MusicPlayerDeps): MusicPlayer {
  let key: string | null = null;
  let playing: Playing | null = null;
  let finalTimer: unknown = null;
  const lastByZone = new Map<string, string>();

  const active = (p: Playing): AudioLike | null => (p.intro && !p.introDone ? p.intro : p.main);

  const tryPlay = (audio: AudioLike) => {
    audio.volume = deps.volume();
    // El navegador puede rechazarlo hasta la primera interacción: se reintenta en `resume()`.
    audio.play().catch(() => {});
  };

  const fadeOut = (audios: AudioLike[]) => {
    if (audios.length === 0) return;
    const start = audios.map((a) => a.volume);
    for (let step = 1; step <= FADE_STEPS; step++) {
      deps.timers.setTimeout(() => {
        audios.forEach((audio, i) => {
          audio.volume = Math.max(0, start[i]! * (1 - step / FADE_STEPS));
          if (step === FADE_STEPS) {
            audio.pause();
            // Suelta el archivo (y su descarga, si seguía): el reproductor no se vuelve a usar.
            audio.removeAttribute("src");
            audio.load();
          }
        });
      }, (FADE_MS / FADE_STEPS) * step);
    }
  };

  const createElements = (p: Playing) => {
    const main = deps.createAudio(p.track.src);
    main.loop = p.track.loop;
    if (!p.track.loop) main.addEventListener("ended", () => (p.finished = true));
    p.main = main;
    if (p.track.intro) {
      const intro = deps.createAudio(p.track.intro);
      intro.loop = false;
      intro.addEventListener("ended", () => {
        if (playing !== p) return;
        p.introDone = true;
        if (deps.canPlay()) tryPlay(main);
      });
      p.intro = intro;
    }
  };

  const start = (track: Track) => {
    const p: Playing = { track, main: null, intro: null, introDone: false, finished: false };
    playing = p;
    if (!deps.canPlay()) return; // Empezará al encender la música o al volver a la pestaña.
    createElements(p);
    tryPlay(active(p)!);
  };

  const pick = (zone: "lobby" | "battle"): Track => {
    const list = zone === "lobby" ? LOBBY_TRACKS : BATTLE_TRACKS;
    const last = lastByZone.get(zone);
    const candidates = list.length > 1 ? list.filter((t) => t.id !== last) : list;
    const track = candidates[Math.min(candidates.length - 1, Math.floor(deps.random() * candidates.length))]!;
    lastByZone.set(zone, track.id);
    return track;
  };

  const leaveCurrent = () => {
    if (finalTimer !== null) {
      deps.timers.clearTimeout(finalTimer);
      finalTimer = null;
    }
    if (playing) fadeOut([playing.intro, playing.main].filter((a): a is AudioLike => a !== null));
    playing = null;
  };

  return {
    setCue(cue) {
      const next = keyOf(cue);
      if (next === key) return;
      key = next;
      leaveCurrent();
      if (cue.zone === "none") return;
      if (cue.zone === "final") {
        const track = cue.outcome === "win" ? WIN_TRACK : LOSE_TRACK;
        finalTimer = deps.timers.setTimeout(() => {
          finalTimer = null;
          // Si no puede sonar ahora (pestaña oculta, música apagada), el final se descarta: no tendría sentido minutos después.
          if (!deps.canPlay()) return;
          start(track);
        }, FINAL_DELAY_MS);
        return;
      }
      start(pick(cue.zone));
    },
    resume() {
      if (!playing || !deps.canPlay()) return;
      if (!playing.main) createElements(playing);
      // Un final que ya terminó no vuelve a empezar.
      if (playing.finished) return;
      const audio = active(playing);
      if (audio) tryPlay(audio);
    },
    pause() {
      if (playing) active(playing)?.pause();
    },
    applyVolume() {
      if (playing) for (const audio of [playing.intro, playing.main]) if (audio) audio.volume = deps.volume();
    },
    stop() {
      key = null;
      leaveCurrent();
    },
  };
}
