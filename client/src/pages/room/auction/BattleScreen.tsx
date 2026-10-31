import type { Seat } from "@pokemon-minigames/shared";
import { useEffect, useRef, useState } from "react";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Timer } from "../../../components/Timer";
import { effectivenessLabel, moveLabel, turnLines } from "../../../game/battle";
import { BATTLE_MOVE_MS } from "../../../game/durations";
import { useReducedMotion } from "../../../game/motion";
import { rivalSeat } from "../../../game/seats";
import { AUCTION_ITEM_LABELS, BATTLE_TEXT } from "../../../i18n/es";
import { useLastSeconds } from "../../../sound/use-last-seconds";
import { LeaveButton } from "../LeaveButton";
import { focusWasLost } from "../RematchPanel";
import { useRoom } from "../use-room";
import { BattleSprite } from "./BattleSprite";
import { HpBar } from "./HpBar";

/** Cada ataque de un turno se anima 1,2 s: en los 3 s que espera el servidor caben los dos. */
const STRIKE_MS = 1200;

/** Qué le toca animar ahora a cada lado. */
function useStrike(actions: { actor: Seat; damage: number }[] | null, key: string | null): { attacker: Seat; target: Seat } | null {
  const [strike, setStrike] = useState<{ attacker: Seat; target: Seat } | null>(null);
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const hits = (latest.current ?? []).filter((action) => action.damage > 0);
    if (key === null || hits.length === 0) {
      setStrike(null);
      return;
    }
    // Un turno nuevo cancela lo que quedara del anterior: nadie se queda teñido.
    const show = (index: number) => setStrike(index < hits.length ? { attacker: hits[index]!.actor, target: rivalSeat(hits[index]!.actor) } : null);
    show(0);
    const timers = hits.map((_, index) => setTimeout(() => show(index + 1), STRIKE_MS * (index + 1)));
    return () => timers.forEach(clearTimeout);
  }, [key]);
  return strike;
}

/** El combate de vista lateral: tú a la izquierda, el rival a la derecha, y abajo el registro y los movimientos. */
export function BattleScreen() {
  const { view, client } = useRoom();
  const reduced = useReducedMotion();
  const battle = view.auction?.battle;
  const last = view.battleLog[view.battleLog.length - 1] ?? null;
  const strike = useStrike(last?.actions ?? null, last ? `${last.round}-${last.turn}` : null);
  const movesRef = useRef<HTMLDivElement>(null);
  const deadline = battle?.deadline ?? null;
  useLastSeconds({ deadline, offset: view.clockOffset, answered: battle?.confirmed ?? true, round: deadline ?? 0 });
  // Un turno nuevo vuelve a poner los botones: si el foco se perdió con ellos, regresa.
  useEffect(() => {
    if (deadline !== null && focusWasLost()) movesRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [deadline]);
  if (!battle || view.mySeat === null) return null;

  const mySeat = view.mySeat;
  const rival = rivalSeat(mySeat);
  const mine = battle.myTeam.find((one) => one.pokemon.id === battle.myTitular);
  const theirs = battle.rivalTeam.find((one) => one.pokemon.id === battle.rivalTitular);
  const effectOf = (seat: Seat): string => {
    if (!strike) return "";
    if (seat === strike.target) return reduced ? "battle-flash" : "battle-hit";
    if (seat === strike.attacker && !reduced) return seat === mySeat ? "battle-lunge" : "battle-lunge battle-lunge-left";
    return "";
  };
  const knockedOut = view.lastRoundEnd?.round === battle.round;
  const lines = [...view.battleLog].reverse().flatMap((entry) => turnLines(entry.actions, entry.names).map((line, index) => ({ key: `${entry.round}-${entry.turn}-${index}`, line })));

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        <div className="min-w-0">
          {mine ? <HpBar fighter={mine} reverse /> : null}
          {battle.cinta[mySeat] ? <Badge tone="info">{AUCTION_ITEM_LABELS.cinta.name}</Badge> : null}
        </div>
        <Timer deadline={deadline} offset={view.clockOffset} totalMs={BATTLE_MOVE_MS} label={BATTLE_TEXT.moveTimer} size={56} />
        <div className="min-w-0">
          {theirs ? <HpBar fighter={theirs} /> : null}
          {battle.cinta[rival] ? <Badge tone="info">{AUCTION_ITEM_LABELS.cinta.name}</Badge> : null}
        </div>
      </div>

      <p className="text-center text-sm font-semibold text-muted">{BATTLE_TEXT.roundTurn(battle.round, battle.turn)}</p>

      <Card data-arena tone="raised" className="relative flex items-end justify-between overflow-hidden px-3 py-6 sm:px-10">
        {mine ? <BattleSprite key={mine.pokemon.id} id={mine.pokemon.id} name={mine.pokemon.names.es} flipped={false} effect={effectOf(mySeat)} /> : null}
        {theirs ? <BattleSprite key={theirs.pokemon.id} id={theirs.pokemon.id} name={theirs.pokemon.names.es} flipped effect={effectOf(rival)} /> : null}
        {knockedOut ? <p className="battle-ko absolute inset-0 flex items-center justify-center font-display text-6xl font-bold text-danger sm:text-8xl">K.O.</p> : null}
      </Card>

      {deadline === null ? (
        <p className="text-center font-semibold">{BATTLE_TEXT.resolving}</p>
      ) : (
        <div ref={movesRef} className="grid grid-cols-2 gap-2">
          {battle.moves.map((one) => {
            const isAttack = one.move !== "forcejeo" && one.move !== "recuperar";
            const label = isAttack ? `${moveLabel(one.move)} ${effectivenessLabel(one.effectiveness)}`.trim() : moveLabel(one.move);
            return (
              <Button key={one.move} variant={battle.myMove === one.move ? "primary" : "secondary"} className="px-2 [overflow-wrap:anywhere]" aria-pressed={battle.myMove === one.move} disabled={one.used} onClick={() => client.move(one.move)}>
                {label}
              </Button>
            );
          })}
        </div>
      )}

      <div data-battle-log aria-hidden="true" className="framed h-24 overflow-y-auto rounded-ui bg-surface p-2 font-mono text-xs">
        {lines.map((entry) => (
          <p key={entry.key}>{entry.line}</p>
        ))}
      </div>

      <div className="text-center">
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
