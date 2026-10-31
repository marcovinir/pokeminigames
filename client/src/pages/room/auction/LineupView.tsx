import { useEffect, useRef, useState } from "react";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Timer } from "../../../components/Timer";
import { BATTLE_LINEUP_MS } from "../../../game/durations";
import { AUCTION_TEXT, BATTLE_TEXT } from "../../../i18n/es";
import { LeaveButton } from "../LeaveButton";
import { useRoom } from "../use-room";

/** Elegir titular y orden, con botones. Del rival se ve quién está, no su orden. */
export function LineupView() {
  const { view, client } = useRoom();
  const battle = view.auction?.battle;
  const [order, setOrder] = useState<number[]>(() => battle?.myLineup ?? battle?.myTeam.map((one) => one.pokemon.id) ?? []);
  const [moved, setMoved] = useState<{ id: number; dir: "up" | "down" } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Si el botón pulsado quedó desactivado (llegó al extremo), el foco pasa al otro de ese Pokémon.
  useEffect(() => {
    if (!moved) return;
    const other = moved.dir === "up" ? "down" : "up";
    const target = [moved.dir, other].map((dir) => listRef.current?.querySelector<HTMLButtonElement>(`[data-move="${moved.id}-${dir}"]`)).find((button) => button && !button.disabled);
    target?.focus({ preventScroll: true });
  }, [moved, order]);
  if (!battle) return null;

  const confirmed = battle.confirmed;
  const shown = confirmed && battle.myLineup ? battle.myLineup : order;
  const nameOf = (id: number) => battle.myTeam.find((one) => one.pokemon.id === id)?.pokemon.names.es ?? "";
  const move = (id: number, dir: "up" | "down") => {
    const from = order.indexOf(id);
    const to = dir === "up" ? from - 1 : from + 1;
    const next = [...order];
    next[from] = next[to]!;
    next[to] = id;
    setOrder(next);
    setMoved({ id, dir });
  };

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card tone="raised" className="flex flex-col items-center gap-3 p-6 text-center">
        <h1 className="font-pixel text-3xl font-bold">{BATTLE_TEXT.lineupTitle}</h1>
        <Timer deadline={battle.deadline} offset={view.clockOffset} totalMs={BATTLE_LINEUP_MS} label={BATTLE_TEXT.lineupTimer} />
      </Card>
      <p role="status" className="sr-only">
        {moved ? BATTLE_TEXT.position(nameOf(moved.id), order.indexOf(moved.id) + 1) : ""}
      </p>
      <ul ref={listRef} aria-label={BATTLE_TEXT.yourLineup} className="flex flex-col gap-2">
        {shown.map((id, index) => (
          <li key={id} className="framed flex min-w-0 items-center gap-2 rounded-card bg-surface p-3">
            <span className="min-w-0 flex-1 font-display font-semibold [overflow-wrap:anywhere]">{nameOf(id)}</span>
            {index === 0 ? <Badge tone="info">{BATTLE_TEXT.titular}</Badge> : null}
            <Button variant="secondary" data-move={`${id}-up`} aria-label={BATTLE_TEXT.moveUp(nameOf(id))} disabled={confirmed || index === 0} onClick={() => move(id, "up")}>
              ↑
            </Button>
            <Button variant="secondary" data-move={`${id}-down`} aria-label={BATTLE_TEXT.moveDown(nameOf(id))} disabled={confirmed || index === shown.length - 1} onClick={() => move(id, "down")}>
              ↓
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <h2 className="mb-2 font-display text-lg font-semibold">{BATTLE_TEXT.rivalTeam}</h2>
        <ul aria-label={BATTLE_TEXT.rivalTeam} className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          {battle.rivalTeam.map((one) => (
            <li key={one.pokemon.id} className="framed rounded-ui bg-surface p-2 [overflow-wrap:anywhere]">
              {one.pokemon.names.es}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Button variant="primary" size="lg" disabled={confirmed} onClick={() => client.lineup(order)}>
          {confirmed ? AUCTION_TEXT.waitingRival : BATTLE_TEXT.confirm}
        </Button>
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
