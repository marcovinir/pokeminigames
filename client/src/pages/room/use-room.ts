import { useGame, useServices } from "../../services";

/** Lo que necesitan las vistas de la sala: el estado de la partida, quién soy y quién es el rival. */
export function useRoom() {
  const view = useGame((s) => s.view);
  const { game } = useServices();
  const me = view.players.find((p) => p.seat === view.mySeat) ?? null;
  const opponent = view.players.find((p) => p.seat !== view.mySeat) ?? null;
  return { view, client: game.client, me, opponent };
}
