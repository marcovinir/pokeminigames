import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSoundSettingsStore } from "../../src/sound/settings-store";
import { type SoundService, createSoundService } from "../../src/sound/sound-service";
import { BATTLE_TRACKS, LOBBY_TRACKS, LOSE_TRACK, WIN_TRACK } from "../../src/sound/tracks";
import { FakeAudio, FakeAudioContext, fakeDocument, fakeTimers } from "./fakes";

let doc: ReturnType<typeof fakeDocument>;
let timers: ReturnType<typeof fakeTimers>;
let settings: ReturnType<typeof createSoundSettingsStore>;
let service: SoundService;

function build(random: () => number = () => 0) {
  doc = fakeDocument();
  timers = fakeTimers();
  settings = createSoundSettingsStore({ storage: null });
  service = createSoundService({
    settings,
    createAudio: (src) => new FakeAudio(src) as unknown as HTMLAudioElement,
    createContext: () => new FakeAudioContext() as unknown as AudioContext,
    random,
    document: doc as unknown as Document,
    timers,
  });
}

/** Deja que se resuelvan las promesas pendientes (los `play()`). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const playingSrcs = () => FakeAudio.playing().map((a) => a.src);

beforeEach(() => {
  FakeAudio.reset();
  FakeAudioContext.reset();
  build();
});
afterEach(() => service.dispose());

describe("la música", () => {
  it("la sala toca un tema de la lista, en bucle y al volumen de los ajustes", async () => {
    service.setMusic({ zone: "lobby" });
    await flush();
    const [audio] = FakeAudio.playing();
    expect(audio?.src).toBe(LOBBY_TRACKS[0]!.src);
    expect(audio?.loop).toBe(true);
    expect(audio?.volume).toBeCloseTo(0.5);
  });

  it("pedir la misma zona otra vez no reinicia nada", async () => {
    service.setMusic({ zone: "lobby" });
    service.setMusic({ zone: "lobby" });
    await flush();
    expect(FakeAudio.created).toHaveLength(1);
  });

  it("al cambiar de zona funde la anterior y empieza la nueva; Porkymon empieza por su entrada", async () => {
    service.setMusic({ zone: "lobby" });
    await flush();
    const lobby = FakeAudio.playing()[0]!;
    service.setMusic({ zone: "battle" });
    await flush();
    expect(playingSrcs()).toContain(BATTLE_TRACKS[0]!.intro);
    timers.advance(400);
    expect(lobby.paused).toBe(true);
    const intro = FakeAudio.created.find((a) => a.src === BATTLE_TRACKS[0]!.intro)!;
    expect(intro.loop).toBe(false);
    intro.end();
    await flush();
    const main = FakeAudio.playing().find((a) => a.src === BATTLE_TRACKS[0]!.src)!;
    expect(main.loop).toBe(true);
  });

  it("al volver a una zona elige otro tema distinto del último", async () => {
    service.setMusic({ zone: "lobby" });
    service.setMusic({ zone: "battle" });
    service.setMusic({ zone: "lobby" });
    await flush();
    timers.advance(400);
    const lobbies = FakeAudio.created.filter((a) => LOBBY_TRACKS.some((t) => t.src === a.src)).map((a) => a.src);
    expect(lobbies).toHaveLength(2);
    expect(lobbies[1]).not.toBe(lobbies[0]);
  });

  it("el final espera al efecto (~1,2 s), suena una vez y después hay silencio", async () => {
    service.setMusic({ zone: "final", outcome: "win" });
    await flush();
    expect(playingSrcs()).toEqual([]);
    timers.advance(1200);
    await flush();
    const win = FakeAudio.playing()[0]!;
    expect(win.src).toBe(WIN_TRACK.src);
    expect(win.loop).toBe(false);
    win.end();
    await flush();
    expect(playingSrcs()).toEqual([]);
    // Ni un clic ni volver a la pestaña lo hacen sonar otra vez.
    doc.fire("pointerdown");
    doc.fire("visibilitychange");
    await flush();
    expect(playingSrcs()).toEqual([]);
    service.setMusic({ zone: "final", outcome: "lose" });
    timers.advance(1200);
    await flush();
    expect(playingSrcs()).toEqual([LOSE_TRACK.src]);
  });

  it("ninguna zona detiene la música", async () => {
    service.setMusic({ zone: "lobby" });
    await flush();
    service.setMusic({ zone: "none" });
    timers.advance(400);
    expect(playingSrcs()).toEqual([]);
  });

  it("con la música apagada no suena, y al encenderla vuelve la de la zona", async () => {
    service.setMusic({ zone: "lobby" });
    await flush();
    settings.getState().update({ musicOn: false });
    expect(playingSrcs()).toEqual([]);
    service.setMusic({ zone: "battle" });
    await flush();
    timers.advance(400);
    expect(playingSrcs()).toEqual([]);
    settings.getState().update({ musicOn: true });
    await flush();
    expect(playingSrcs()).toEqual([BATTLE_TRACKS[0]!.intro]);
  });

  it("el volumen sigue a los ajustes al momento", async () => {
    service.setMusic({ zone: "lobby" });
    await flush();
    settings.getState().update({ musicVolume: 0.2 });
    expect(FakeAudio.playing()[0]!.volume).toBeCloseTo(0.2);
  });

  it("con la pestaña oculta se pausa y sigue al volver", async () => {
    service.setMusic({ zone: "lobby" });
    await flush();
    doc.visibilityState = "hidden";
    doc.fire("visibilitychange");
    expect(playingSrcs()).toEqual([]);
    doc.visibilityState = "visible";
    doc.fire("visibilitychange");
    await flush();
    expect(playingSrcs()).toEqual([LOBBY_TRACKS[0]!.src]);
  });

  it("si el navegador bloquea el audio, no lanza y vuelve a intentarlo con la primera interacción", async () => {
    const errors = vi.fn();
    process.on("unhandledRejection", errors);
    FakeAudio.blocked = true;
    service.setMusic({ zone: "lobby" });
    await flush();
    expect(playingSrcs()).toEqual([]);
    FakeAudio.blocked = false;
    doc.fire("pointerdown");
    await flush();
    expect(playingSrcs()).toEqual([LOBBY_TRACKS[0]!.src]);
    process.off("unhandledRejection", errors);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("los efectos", () => {
  it("suenan con el sintetizador (el contexto de audio se crea al primer efecto)", () => {
    expect(FakeAudioContext.created).toHaveLength(0);
    service.play("correct");
    expect(FakeAudioContext.created).toHaveLength(1);
    expect(FakeAudioContext.created[0]!.oscillators).toBeGreaterThan(0);
  });

  it("todos los efectos se pueden tocar sin errores", () => {
    for (const effect of ["correct", "wrong", "win", "lose", "round", "tick", "click", "reveal", "rival"] as const) {
      expect(() => service.play(effect)).not.toThrow();
    }
  });

  it("con retraso, esperan; con los efectos apagados, no suenan", () => {
    service.play("correct", 600);
    expect(FakeAudioContext.created[0]?.oscillators ?? 0).toBe(0);
    timers.advance(600);
    expect(FakeAudioContext.created[0]!.oscillators).toBeGreaterThan(0);
    const before = FakeAudioContext.created[0]!.oscillators;
    settings.getState().update({ effectsOn: false });
    service.play("win");
    expect(FakeAudioContext.created[0]!.oscillators).toBe(before);
  });

  it("la primera interacción despierta el contexto de audio", () => {
    service.play("click");
    doc.fire("keydown");
    expect(FakeAudioContext.created[0]!.resumes).toBeGreaterThan(0);
  });
});
