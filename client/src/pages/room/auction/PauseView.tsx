import { useState } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Notice } from "../../../components/Notice";
import { Timer } from "../../../components/Timer";
import { aliveIds } from "../../../game/battle";
import { BATTLE_PAUSE_MS } from "../../../game/durations";
import { AUCTION_TEXT, BATTLE_TEXT } from "../../../i18n/es";
import { LeaveButton } from "../LeaveButton";
import { useRoom } from "../use-room";
import { HpBar } from "./HpBar";

/** Entre asaltos: quién sale a pelear. Hasta que los dos confirman, el rival no lo ve. */
export function PauseView() {
  const { view, client } = useRoom();
  const battle = view.auction?.battle;
  const [chosen, setChosen] = useState<number | null>(() => battle?.myPause?.titular ?? battle?.myTitular ?? null);
  if (!battle) return null;

  const confirmed = battle.confirmed;
  const eligible = aliveIds(battle.myTeam);
  // Si solo hay uno posible ya está elegido.
  const titular = chosen !== null && eligible.includes(chosen) ? chosen : eligible.length === 1 ? eligible[0]! : null;
  const nameOf = (id: number) => battle.myTeam.find((one) => one.pokemon.id === id)?.pokemon.names.es ?? "";

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card tone="raised" className="flex flex-col items-center gap-3 p-6 text-center">
        <h1 className="font-pixel text-3xl font-bold">{BATTLE_TEXT.pauseTitle}</h1>
        <Timer deadline={battle.deadline} offset={view.clockOffset} totalMs={BATTLE_PAUSE_MS} label={BATTLE_TEXT.pauseTimer} />
      </Card>

      {eligible.length === 0 ? <Notice tone="danger">{BATTLE_TEXT.nobodyLeft}</Notice> : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {battle.myTeam.map((one) => (
          <div key={one.pokemon.id} className="framed rounded-ui bg-surface p-2">
            <HpBar fighter={one} />
          </div>
        ))}
      </div>

      {eligible.length > 0 ? <h2 className="font-display text-lg font-semibold">{BATTLE_TEXT.whoGoesOut}</h2> : null}
      {eligible.length > 0 ? (
        <div role="group" aria-label={BATTLE_TEXT.titular} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {eligible.map((id) => (
            <Button key={id} variant={titular === id ? "primary" : "secondary"} aria-pressed={titular === id} aria-label={BATTLE_TEXT.sendOut(nameOf(id))} disabled={confirmed} onClick={() => setChosen(id)}>
              <span className="[overflow-wrap:anywhere]">{nameOf(id)}</span>
            </Button>
          ))}
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 font-display text-lg font-semibold">{BATTLE_TEXT.rivalTeam}</h2>
        <ul aria-label={BATTLE_TEXT.rivalTeam} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {battle.rivalTeam.map((one) => (
            <li key={one.pokemon.id} className="framed rounded-ui bg-surface p-2">
              <HpBar fighter={one} />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col items-center gap-3">
        {eligible.length === 0 ? null : (
          <Button variant="primary" size="lg" disabled={confirmed || titular === null} onClick={() => client.pauseConfirm({ titular: titular! })}>
            {confirmed ? AUCTION_TEXT.waitingRival : BATTLE_TEXT.confirm}
          </Button>
        )}
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
