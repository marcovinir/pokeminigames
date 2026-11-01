import type { BattleFighterView, BattleView, Seat } from "@pokemon-minigames/shared";
import { SERVER_NOW, event, pokemon } from "./events";
import { ash, misty } from "./room";

export const fighter = (id: number, name: string, hp = 100, maxHp = 100): BattleFighterView => ({ pokemon: pokemon(id, 400, { names: { es: name, en: name } }), hp, maxHp });
export const MY_TEAM = [fighter(1, "Uno"), fighter(2, "Dos"), fighter(3, "Tres")];
export const RIVAL_TEAM = [fighter(4, "Cuatro"), fighter(5, "Cinco"), fighter(6, "Seis")];

export const battleView = (over: Partial<BattleView> = {}): BattleView => ({
  round: 1,
  turn: 1,
  scene: "bosque",
  deadline: null,
  choosing: true,
  stepId: 77,
  warningUntil: null,
  rivalIdle: false,
  confirmed: false,
  myLineup: null,
  myMove: null,
  mySwitch: null,
  myPause: null,
  myTeam: MY_TEAM,
  rivalTeam: RIVAL_TEAM,
  myTitular: 1,
  rivalTitular: 4,
  moves: [
    { move: "fire", effectiveness: 2, used: false },
    { move: "forcejeo", effectiveness: 1, used: false },
    { move: "recuperar", effectiveness: null, used: false },
  ],
  ...over,
});

/** El `room-state` de un combate, visto desde el asiento 1. */
export const battleState = (phase: "lineup" | "battle" | "battle_pause", over: Partial<BattleView> = {}, mySeat: Seat = 1) =>
  event.roomState({
    phase,
    mySeat,
    config: { game: "subasta", traps: true },
    players: [ash(), misty()],
    auction: { money: { 1: 10, 2: 10 }, teamSizes: { 1: 3, 2: 3 }, purchases: { 1: [], 2: [] }, lot: null, reveal: [], battle: battleView({ deadline: phase === "battle" ? null : SERVER_NOW + 8000, ...over }) },
  });
