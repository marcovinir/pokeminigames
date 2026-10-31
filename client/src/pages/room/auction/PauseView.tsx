import type { AuctionItem, PauseChoice } from "@pokemon-minigames/shared";
import { useId, useState } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Notice } from "../../../components/Notice";
import { Timer } from "../../../components/Timer";
import { pauseTitulars, validTargets } from "../../../game/battle";
import { BATTLE_PAUSE_MS } from "../../../game/durations";
import { AUCTION_ITEM_LABELS, AUCTION_TEXT, BATTLE_TEXT } from "../../../i18n/es";
import { LeaveButton } from "../LeaveButton";
import { useRoom } from "../use-room";
import { HpBar } from "./HpBar";

/** Lo elegido para cada objeto que se tiene, en su mismo orden: un número de Pokémon, `null` en la Cinta usada, o sin usar. */
type Picks = (number | null | undefined)[];

/** Lo ya confirmado, repartido entre los objetos que se tienen: sirve para recuperarlo al recargar. */
function picksFrom(items: AuctionItem[], choice: PauseChoice | null): Picks {
  const pending = [...(choice?.items ?? [])];
  return items.map((item) => {
    const index = pending.findIndex((used) => used.item === item);
    return index < 0 ? undefined : pending.splice(index, 1)[0]!.target;
  });
}

/** Entre asaltos: objetos y quién sale a pelear. Hasta que los dos confirman, el rival no ve nada de esto. */
export function PauseView() {
  const { view, client } = useRoom();
  const battle = view.auction?.battle;
  const items = view.mySeat !== null ? (view.auction?.items[view.mySeat] ?? []) : [];
  const [picks, setPicks] = useState<Picks>(() => picksFrom(items, battle?.myPause ?? null));
  const [chosen, setChosen] = useState<number | null>(() => battle?.myPause?.titular ?? battle?.myTitular ?? null);
  const baseId = useId();
  if (!battle) return null;

  const confirmed = battle.confirmed;
  const used: PauseChoice["items"] = items.flatMap((item, index) => {
    const target = picks[index];
    return target === undefined ? [] : [{ item, target }];
  });
  const eligible = pauseTitulars(battle.myTeam, used);
  const titular = chosen !== null && eligible.includes(chosen) ? chosen : null;
  const nameOf = (id: number) => battle.myTeam.find((one) => one.pokemon.id === id)?.pokemon.names.es ?? "";
  const setPick = (index: number, value: number | null | undefined) => setPicks(items.map((_, other) => (other === index ? value : picks[other])));
  const nobodyLeft = eligible.length === 0 && !items.includes("revivir");

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card tone="raised" className="flex flex-col items-center gap-3 p-6 text-center">
        <h1 className="font-display text-2xl font-semibold">{BATTLE_TEXT.pauseTitle}</h1>
        <Timer deadline={battle.deadline} offset={view.clockOffset} totalMs={BATTLE_PAUSE_MS} label={BATTLE_TEXT.pauseTimer} />
      </Card>

      <div className="grid grid-cols-1 gap-2">
        {battle.myTeam.map((one) => (
          <div key={one.pokemon.id} className="framed rounded-ui bg-surface p-2">
            <HpBar fighter={one} />
          </div>
        ))}
      </div>

      {nobodyLeft ? <Notice tone="danger">{BATTLE_TEXT.nobodyLeft}</Notice> : null}
      {eligible.length === 0 && !nobodyLeft ? <Notice tone="danger">{BATTLE_TEXT.useRevive}</Notice> : null}

      {items.map((item, index) => {
        const label = AUCTION_ITEM_LABELS[item];
        const id = `${baseId}-${index}`;
        if (item === "cinta") {
          return (
            <label key={id} className="flex cursor-pointer items-center gap-2 font-semibold">
              <input type="checkbox" role="switch" aria-label={label.name} disabled={confirmed} checked={picks[index] === null} onChange={(event) => setPick(index, event.target.checked ? null : undefined)} />
              <span>
                {label.name} <span className="text-sm font-normal text-muted">{label.description}</span>
              </span>
            </label>
          );
        }
        // El mismo objetivo no se ofrece dos veces para el mismo objeto.
        const taken = picks.filter((pick, other) => other !== index && items[other] === item);
        const targets = validTargets(item, battle.myTeam).filter((target) => !taken.includes(target));
        return (
          <div key={id}>
            <label htmlFor={id} className="mb-1 block text-sm font-semibold">
              {label.name}
            </label>
            <select
              id={id}
              disabled={confirmed}
              value={picks[index] ?? ""}
              onChange={(event) => setPick(index, event.target.value === "" ? undefined : Number(event.target.value))}
              className="framed-field w-full rounded-ui bg-surface px-4 py-3 text-fg"
            >
              <option value="">{BATTLE_TEXT.noUse}</option>
              {targets.map((target) => (
                <option key={target} value={target}>
                  {nameOf(target)}
                </option>
              ))}
            </select>
          </div>
        );
      })}

      {eligible.length > 0 ? (
        <div role="group" aria-label={BATTLE_TEXT.titular} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {eligible.map((id) => (
            <Button key={id} variant={titular === id ? "primary" : "ghost"} aria-pressed={titular === id} aria-label={BATTLE_TEXT.sendOut(nameOf(id))} disabled={confirmed} onClick={() => setChosen(id)}>
              <span className="[overflow-wrap:anywhere]">{nameOf(id)}</span>
            </Button>
          ))}
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 font-display text-lg font-semibold">{BATTLE_TEXT.rivalTeam}</h2>
        <ul aria-label={BATTLE_TEXT.rivalTeam} className="grid grid-cols-1 gap-2">
          {battle.rivalTeam.map((one) => (
            <li key={one.pokemon.id} className="framed rounded-ui bg-surface p-2">
              <HpBar fighter={one} />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col items-center gap-3">
        {nobodyLeft ? null : (
          <Button variant="primary" size="lg" disabled={confirmed || titular === null} onClick={() => client.pauseConfirm({ items: used, titular: titular! })}>
            {confirmed ? AUCTION_TEXT.waitingRival : BATTLE_TEXT.confirm}
          </Button>
        )}
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
