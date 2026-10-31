import type { BattleFighterView } from "@pokemon-minigames/shared";
import { hpTone } from "../../../game/battle";
import { BATTLE_TEXT } from "../../../i18n/es";

/** La barra de vida con su nombre y sus PS. `reverse` hace que baje hacia el centro en el lado del rival. */
export function HpBar({ fighter, reverse = false }: { fighter: BattleFighterView; reverse?: boolean }) {
  const name = fighter.pokemon.names.es;
  const percent = Math.max(0, Math.min(100, (fighter.hp / fighter.maxHp) * 100));
  const tone = hpTone(fighter.hp, fighter.maxHp);
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">{name}</p>
      <div
        role="meter"
        aria-label={BATTLE_TEXT.hpOf(name)}
        aria-valuemin={0}
        aria-valuemax={fighter.maxHp}
        aria-valuenow={fighter.hp}
        data-tone={tone}
        className="framed mt-1 h-3 overflow-hidden rounded-pill bg-surface-2"
      >
        <div className={`hp-fill hp-${tone} h-full transition-[width] duration-(--dur-fast) ${reverse ? "ml-auto" : ""}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-0.5 font-num text-xs tabular-nums text-muted">
        {fighter.hp} / {fighter.maxHp}
      </p>
    </div>
  );
}
