import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TRACKS, BATTLE_TRACKS, LOBBY_TRACKS, LOSE_TRACK, WIN_TRACK } from "../../src/sound/tracks";

const publicDir = join(import.meta.dirname, "../../public");
const fileOf = (src: string) => join(publicDir, src);

/** Un MP3 empieza por una etiqueta ID3 o por una trama de sincronía (0xFFE…). */
function isMp3(file: string): boolean {
  const head = readFileSync(file).subarray(0, 3);
  return head.toString("latin1") === "ID3" || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0);
}

describe("los temas de música", () => {
  it("son los que eligió Marco, en su orden", () => {
    expect(LOBBY_TRACKS.map((t) => t.title)).toEqual(["Town Center", "Title Screen", "Bittersweet Story", "Pavane", "Dungeon"]);
    expect(BATTLE_TRACKS.map((t) => t.title)).toEqual(["Porkymon Battle Theme", "8-Bit Battle Loop", "Chipped Urgency"]);
    expect(WIN_TRACK.title).toBe("Menu");
    expect(LOSE_TRACK.title).toBe("Game Over");
  });

  it("cada archivo existe, es MP3 y entre todos pesan 15 MB como mucho", () => {
    const files = ALL_TRACKS.flatMap((t) => (t.intro ? [t.src, t.intro] : [t.src]));
    let total = 0;
    for (const src of files) {
      expect(src, src).toMatch(/^\/audio\/[a-z0-9-]+\.mp3$/);
      const file = fileOf(src);
      expect(existsSync(file), src).toBe(true);
      expect(isMp3(file), `${src} no es MP3`).toBe(true);
      total += statSync(file).size;
    }
    expect(total).toBeLessThanOrEqual(15 * 1024 * 1024);
  });

  it("los de sala y partida se repiten en bucle; los de final suenan una vez; Porkymon tiene su entrada", () => {
    for (const track of [...LOBBY_TRACKS, ...BATTLE_TRACKS]) expect(track.loop, track.title).toBe(true);
    expect(WIN_TRACK.loop).toBe(false);
    expect(LOSE_TRACK.loop).toBe(false);
    expect(BATTLE_TRACKS[0]!.intro).toBe("/audio/porkymon-battle-start.mp3");
  });

  it("cada tema lleva autor, licencia y página; los créditos los nombran a todos", () => {
    const credits = readFileSync(join(publicDir, "audio/CREDITOS.md"), "utf8");
    for (const track of ALL_TRACKS) {
      expect(track.author, track.title).not.toBe("");
      expect(track.page, track.title).toMatch(/^https:\/\/opengameart\.org\//);
      expect(credits, track.title).toContain(track.title);
      expect(credits, track.title).toContain(track.author);
    }
    expect(ALL_TRACKS.find((t) => t.title === "Town Center")!.license).toBe("CC-BY-SA 3.0");
    expect(WIN_TRACK.license).toBe("CC-BY 4.0");
  });
});
