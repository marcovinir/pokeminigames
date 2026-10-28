import type { ServerEvent } from "@pokemon-minigames/shared";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoomPage } from "../../src/pages/room/RoomPage";
import { SERVER_NOW } from "./events";
import { type FakeServices, fakeServices, renderRoute } from "./services";

export const ash = (extra: object = {}) => ({ seat: 1 as const, username: "ash", connected: true, totalStats: 0, teamSize: 0, ...extra });
export const misty = (extra: object = {}) => ({ seat: 2 as const, username: "misty", connected: true, totalStats: 0, teamSize: 0, ...extra });

export const roundState = (overrides: object = {}) => ({
  number: 1,
  pair: ["flying", "fire"] as ["flying", "fire"],
  deadline: SERVER_NOW + 15_000,
  answered: false,
  typeChosen: false,
  opponentAnswered: false,
  ...overrides,
});

/** La pantalla de la sala con los eventos del servidor ya recibidos. */
export function renderRoom(events: ServerEvent[] = [], services: FakeServices = fakeServices()) {
  for (const e of events) services.game.store.getState().receive(e, SERVER_NOW);
  const utils = renderRoute("/sala/:code", <RoomPage />, { services, route: "/sala/ABC234" });
  return { user: userEvent.setup(), ...utils };
}

/** Recibir un evento del servidor con la pantalla ya abierta. */
export const serverSends = (services: FakeServices, e: ServerEvent) => act(() => services.game.store.getState().receive(e, SERVER_NOW));
