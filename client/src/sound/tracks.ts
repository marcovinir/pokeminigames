/**
 * Los temas de música del juego: el de la sala lo hizo un amigo de Marco; los demás son originales de licencia libre de
 * OpenGameArt, elegidos por Marco (nada de la música de los juegos de Pokémon ni remixes suyos). Los créditos completos están en `client/public/audio/CREDITOS.md` y en la
 * página «Acerca de».
 */
export interface Track {
  id: string;
  title: string;
  src: string;
  author: string;
  license: "CC0" | "CC-BY 4.0" | "Cedida por su autor";
  /** Dónde está publicado; `null` si solo está aquí. */
  page: string | null;
  /** Una entrada corta que suena una vez antes del bucle (como en los combates de los juegos). */
  intro?: string;
  loop: boolean;
}

const MELODIC = "https://opengameart.org/content/15-melodic-rpg-chiptunes";

/** La sala: el menú, los lobbies y la espera antes de empezar. Un solo tema, siempre el mismo. */
export const LOBBY_TRACKS: readonly Track[] = [
  { id: "tema-principal", title: "Tema principal de PokeMiniGames", src: "/audio/tema-principal.mp3", author: "Un amigo de Marco, creado con Gemini", license: "Cedida por su autor", page: null, loop: true },
];

/** La partida, desde la cuenta atrás hasta la última ronda. */
export const BATTLE_TRACKS: readonly Track[] = [
  {
    id: "porkymon-battle",
    title: "Porkymon Battle Theme",
    src: "/audio/porkymon-battle-main.mp3",
    intro: "/audio/porkymon-battle-start.mp3",
    author: "Joth",
    license: "CC0",
    page: "https://opengameart.org/node/95339",
    loop: true,
  },
  { id: "8bit-battle-loop", title: "8-Bit Battle Loop", src: "/audio/8bit-battle-loop.mp3", author: "Wolfgang_", license: "CC0", page: "https://opengameart.org/content/8-bit-battle-loop", loop: true },
  { id: "chipped-urgency", title: "Chipped Urgency", src: "/audio/chipped-urgency.mp3", author: "Centurion_of_war", license: "CC0", page: "https://opengameart.org/content/chipped-urgency", loop: true },
];

/** El final cuando se gana (o se empata una partida completa). */
export const WIN_TRACK: Track = { id: "victory-menu", title: "Menu", src: "/audio/victory-menu.mp3", author: "SuperGamersGames", license: "CC-BY 4.0", page: "https://opengameart.org/content/6-chiptune-loops", loop: false };

/** El final cuando se pierde. */
export const LOSE_TRACK: Track = { id: "game-over", title: "Game Over", src: "/audio/game-over.mp3", author: "Aureolus_Omicron", license: "CC0", page: MELODIC, loop: false };

export const ALL_TRACKS: readonly Track[] = [...LOBBY_TRACKS, ...BATTLE_TRACKS, WIN_TRACK, LOSE_TRACK];
