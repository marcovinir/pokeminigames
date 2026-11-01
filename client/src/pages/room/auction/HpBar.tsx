import type { BattleFighterView, BoostStat } from "@pokemon-minigames/shared";
import { STATUS_LABELS, hpTone, stageLabel } from "../../../game/battle";
import { BATTLE_TEXT } from "../../../i18n/es";

/** El recuadro de un Pokémon en el escenario. Del rival, los PS van en porcentaje, como en Showdown. */
export function HpBar({ fighter, standing, percentOnly = false }: { fighter: BattleFighterView; standing?: number; percentOnly?: boolean }) {
  const name = fighter.pokemon.names.es;
  const percent = Math.max(0, Math.min(100, (fighter.hp / fighter.maxHp) * 100));
  const tone = hpTone(fighter.hp, fighter.maxHp);
  return (
    <div className="battle-hud">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate font-display text-sm font-semibold lg:text-lg">{name}</p>
        {standing === undefined ? null : <span className="flex-none text-xs font-extrabold">{BATTLE_TEXT.stillStanding(standing)}</span>}
      </div>
      <div
        role="meter"
        aria-label={BATTLE_TEXT.hpOf(name)}
        aria-valuemin={0}
        aria-valuemax={fighter.maxHp}
        aria-valuenow={fighter.hp}
        data-tone={tone}
        className="mt-1 h-2.5 overflow-hidden rounded-pill bg-[#e5e3f2]"
      >
        <div className={`hp-fill hp-${tone} h-full transition-[width] duration-(--dur-fast)`} style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <p className="m-0 font-num text-xs font-bold tabular-nums">{percentOnly ? `${Math.round(percent)} %` : `${fighter.hp} / ${fighter.maxHp}`}</p>
        {fighter.status ? <span className={`battle-status battle-status-${fighter.status}`}>{STATUS_LABELS[fighter.status]}</span> : null}
        {Object.entries(fighter.stages).map(([stat, stage]) => (
          <span key={stat} className="battle-status battle-status-stage">{stageLabel(stat as BoostStat, stage)}</span>
        ))}
      </div>
    </div>
  );
}
