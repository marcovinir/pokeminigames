import { Card } from "../../../components/Card";
import { AUCTION_TEXT } from "../../../i18n/es";
import { LeaveButton } from "../LeaveButton";
import { useRoom } from "../use-room";

/** Hasta que exista la pantalla del combate (#39), lo que ve quien llega hasta aquí. El juego aún no se ofrece en el menú. */
export function BattleSoonView() {
  const { client } = useRoom();
  return (
    <Card as="section" tone="raised" className="mx-auto flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
      <h1 className="font-display text-2xl font-semibold">{AUCTION_TEXT.battleSoon}</h1>
      <LeaveButton onLeave={() => client.leave()} />
    </Card>
  );
}
