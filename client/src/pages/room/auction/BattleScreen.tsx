import type { BattleFighterView, BattleMoveView, Seat } from "@pokemon-minigames/shared";
import { useEffect, useRef, useState } from "react";
import { spriteUrl } from "../../../catalog/artwork";
import { BATTLE_MAX_TURNS } from "../../../game/durations";
import { MOVE_COLORS, effectivenessLabel, turnLines } from "../../../game/battle";
import { useReducedMotion } from "../../../game/motion";
import { rivalSeat } from "../../../game/seats";
import { BATTLE_TEXT, TYPE_LABELS } from "../../../i18n/es";
import { useLastSeconds } from "../../../sound/use-last-seconds";
import { LeaveButton } from "../LeaveButton";
import { focusWasLost } from "../RematchPanel";
import { useRoom } from "../use-room";
import { BattleSprite } from "./BattleSprite";
import { HpBar } from "./HpBar";
import { InactivityWarning } from "./InactivityWarning";

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

const standing = (team: BattleFighterView[]): number => team.filter((one) => one.hp > 0).length;

const moveNote = (one: BattleMoveView): string => one.effect && one.category === "status" ? one.effect : effectivenessLabel(one.effectiveness);

function moveFacts(one: BattleMoveView): string {
  const type = one.type ? TYPE_LABELS[one.type] : "";
  const label = type ? `${type.charAt(0).toUpperCase()}${type.slice(1)}` : "";
  return [label, one.power ?? BATTLE_TEXT.noRoll, one.accuracy === null ? BATTLE_TEXT.noRoll : `${one.accuracy} %`].filter((part) => part !== "").join(" · ");
}

/** El combate con el aspecto de Showdown: tu Pokémon de espaldas abajo, el rival de frente arriba, y sin reloj para elegir. */
export function BattleScreen() {
  const { view, client } = useRoom();
  const reduced = useReducedMotion();
  const battle = view.auction?.battle;
  const last = view.battleLog[view.battleLog.length - 1] ?? null;
  // Solo el turno en curso: al volver de la pausa la pantalla se monta de nuevo con el último golpe en el registro.
  const current = last && battle && last.round === battle.round && last.turn === battle.turn ? last : null;
  const strike = useStrike(current?.actions ?? null, current ? `${current.round}-${current.turn}` : null);
  const movesRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<"mine" | "theirs" | null>(null);
  const titulars = `${battle?.myTitular}-${battle?.rivalTitular}`;
  // Al entrar otro Pokémon el sprite se monta de nuevo sin avisar de que se fue el cursor.
  useEffect(() => setTip(null), [titulars]);
  // En un móvil nada avisa de que se tocó fuera: el foco no siempre se mueve.
  useEffect(() => {
    if (tip === null) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.("[data-ability-sprite]")) setTip(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [tip]);
  const choosing = battle?.choosing ?? false;
  // Se llega pulsando «Confirmar», más abajo: en el móvil el escenario quedaría cortado.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const warningUntil = battle?.warningUntil ?? null;
  // Solo hay urgencia con el aviso abierto: suena a los últimos segundos, una vez por aviso.
  useLastSeconds({ deadline: warningUntil, offset: view.clockOffset, answered: warningUntil === null, round: warningUntil ?? 0 });
  // También al responder el aviso: su botón desaparece.
  const turnKey = choosing && warningUntil === null ? `${battle?.round}-${battle?.turn}` : null;
  // Un turno nuevo vuelve a poner los botones: si el foco se perdió con ellos, regresa.
  useEffect(() => {
    if (turnKey !== null && focusWasLost()) movesRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [turnKey]);
  if (!battle || view.mySeat === null) return null;

  const mySeat = view.mySeat;
  const rival = rivalSeat(mySeat);
  const rivalName = view.players.find((player) => player.seat === rival)?.username ?? "";
  const mine = battle.myTeam.find((one) => one.pokemon.id === battle.myTitular);
  const theirs = battle.rivalTeam.find((one) => one.pokemon.id === battle.rivalTitular);
  const effectOf = (seat: Seat): string => {
    if (!strike) return "";
    if (seat === strike.target) return reduced ? "battle-flash" : "battle-hit";
    if (seat === strike.attacker && !reduced) return seat === mySeat ? "battle-lunge" : "battle-lunge battle-lunge-left";
    return "";
  };
  // El K.O. sale cuando acaba el golpe que lo causó.
  const knockedOut = view.lastRoundEnd?.round === battle.round && strike === null;
  const lines = [...view.battleLog].reverse().flatMap((entry) => turnLines(entry.actions, entry.names, entry).map((line, index) => ({ key: `${entry.round}-${entry.turn}-${index}`, line })));
  const tipAbility = (tip === "mine" ? mine : tip === "theirs" ? theirs : undefined)?.ability ?? null;
  const prompt = !choosing ? BATTLE_TEXT.resolving : battle.rivalIdle ? BATTLE_TEXT.rivalSlow(rivalName) : battle.confirmed ? BATTLE_TEXT.waitingFor(rivalName) : mine ? BATTLE_TEXT.whatDoes(mine.pokemon.names.es) : "";

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-2 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-3">
      <div className="flex min-w-0 flex-col gap-2 lg:gap-3">
        <div data-arena className="battle-arena relative h-64 overflow-hidden rounded-xl bg-[#1b1147] sm:aspect-video sm:h-auto lg:aspect-auto lg:h-[30rem]">
          <img src={`/auction/combate-${battle.scene}.png`} alt="" className="absolute inset-0 size-full object-cover [image-rendering:pixelated]" />
          {theirs ? <BattleSprite key={theirs.pokemon.id} id={theirs.pokemon.id} name={theirs.pokemon.names.es} side="front" effect={effectOf(rival)} showsAbility={theirs.ability !== null} describedBy={tip === "theirs" ? "battle-tip" : undefined} onAbility={(open) => setTip(open ? "theirs" : null)} /> : null}
          {mine ? <BattleSprite key={mine.pokemon.id} id={mine.pokemon.id} name={mine.pokemon.names.es} side="back" effect={effectOf(mySeat)} showsAbility={mine.ability !== null} describedBy={tip === "mine" ? "battle-tip" : undefined} onAbility={(open) => setTip(open ? "mine" : null)} /> : null}
          {theirs ? (
            <div className="absolute top-1.5 left-1.5 w-44 lg:top-4 lg:left-4 lg:w-72">
              <HpBar fighter={theirs} standing={standing(battle.rivalTeam)} percentOnly />
            </div>
          ) : null}
          {mine ? (
            <div className="absolute right-1.5 bottom-1.5 w-44 lg:right-4 lg:bottom-4 lg:w-72">
              <HpBar fighter={mine} standing={standing(battle.myTeam)} />
            </div>
          ) : null}
          <p className="absolute top-1.5 right-1.5 m-0 max-w-28 rounded-md bg-[#1b1147] px-1.5 py-0.5 text-center font-num text-xs font-bold text-white lg:top-4 lg:right-4 lg:max-w-none lg:px-2 lg:py-1 lg:text-base">{BATTLE_TEXT.roundLabel(battle.round, battle.turn, BATTLE_MAX_TURNS)}</p>
          {tipAbility ? (
            <div id="battle-tip" role="tooltip" className="battle-tip">
              <b className="block font-display">{tipAbility.name}</b>
              {tipAbility.description}
            </div>
          ) : null}
          {knockedOut ? <p className="battle-ko font-pixel absolute inset-0 m-0 flex items-center justify-center text-6xl font-bold text-[#ffcb05] [text-shadow:0_4px_0_#1b1147] lg:text-8xl">K.O.</p> : null}
          {battle.warningUntil !== null ? <InactivityWarning until={battle.warningUntil} offset={view.clockOffset} onStillHere={() => client.stillHere(battle.stepId)} /> : null}
        </div>

        <div className="rounded-xl bg-surface p-2 lg:p-3">
          <p className="m-0 mb-1.5 text-sm font-extrabold">{prompt}</p>
          {choosing ? (
            <div ref={movesRef} className="grid grid-cols-2 gap-1.5 lg:grid-cols-4 lg:gap-2">
              {battle.moves.map((one) => {
                const [color, edge] = MOVE_COLORS[one.type ?? "forcejeo"];
                return (
                  <button key={one.move} type="button" className="battle-move" style={{ background: color, boxShadow: `0 3px 0 ${edge}` }} aria-pressed={battle.myMove === one.move} disabled={one.pp <= 0} onClick={() => client.move(one.move)}>
                    {one.name}{" "}
                    <span className="block font-sans text-xs font-bold">{moveFacts(one)}</span>{" "}
                    <span className="block font-sans text-xs font-extrabold">{moveNote(one)}</span>{" "}
                    {one.type === null ? null : <span className="block font-num text-xs font-bold">PP {one.pp}/{one.maxPp}</span>}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-2 lg:gap-3">
        <section aria-label={BATTLE_TEXT.yourTeam} className="order-1 rounded-xl bg-surface p-2 lg:order-2 lg:p-3">
          <p className="m-0 mb-1 text-sm font-extrabold">{BATTLE_TEXT.switchCost}</p>
          <div className="grid grid-cols-6 gap-1 lg:grid-cols-2 lg:gap-1.5">
            {battle.myTeam.map((one) => {
              const name = one.pokemon.names.es;
              const percent = Math.round((one.hp / one.maxHp) * 100);
              const fainted = one.hp <= 0;
              const active = one.pokemon.id === battle.myTitular;
              const label = active ? BATTLE_TEXT.inBattle(name) : fainted ? BATTLE_TEXT.fainted(name) : BATTLE_TEXT.switchTo(name, percent);
              return (
                <button key={one.pokemon.id} type="button" aria-label={label} aria-pressed={battle.mySwitch === one.pokemon.id} disabled={fainted || active || !choosing} data-active={active || undefined} data-fainted={fainted || undefined} onClick={() => client.switchTo(one.pokemon.id)} className="battle-team-member flex-col lg:flex-row">
                  <img src={spriteUrl(one.pokemon.id)} alt="" className="size-8 flex-none [image-rendering:pixelated] lg:size-11" />
                  <span aria-hidden="true" className="min-w-0 text-left text-xs leading-tight font-extrabold">
                    <span className="hidden truncate lg:block">{name}</span>
                    <span className="font-num">{percent} %</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="order-2 min-h-0 rounded-xl bg-surface p-2 lg:order-1 lg:flex-1 lg:p-3">
          <p aria-hidden="true" className="m-0 mb-1 hidden font-display text-base font-semibold lg:block">{BATTLE_TEXT.log}</p>
          <div data-battle-log aria-hidden="true" className="h-24 overflow-y-auto text-sm lg:h-64">
            {lines.map((entry) => (
              <p key={entry.key} className="m-0 mb-1">{entry.line}</p>
            ))}
          </div>
        </section>
        <div className="order-3 text-center">
          <LeaveButton onLeave={() => client.leave()} />
        </div>
      </aside>
    </section>
  );
}
