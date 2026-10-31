import { secondsLeft, useCountdown } from "../../../game/clock";
import { AUCTION_TEXT } from "../../../i18n/es";

/** «¿Sigues ahí?»: sale sobre el escenario, en la puja y en el combate. */
export function InactivityWarning({ until, offset, onStillHere }: { until: number; offset: number; onStillHere(): void }) {
  const remaining = useCountdown(until, offset);
  return (
    <div className="absolute inset-x-2 top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#ffcb05] p-3 text-[#141033] shadow-[0_4px_0_#b38c00]">
      {/* La cuenta atrás va aparte: dentro del aviso, el lector de pantalla lo repetiría cada segundo. */}
      <p role="alert" className="font-pixel text-xl font-bold">
        {AUCTION_TEXT.stillThere}
      </p>
      <span aria-hidden="true" className="font-num text-xl font-bold tabular-nums">
        {secondsLeft(remaining)} s
      </span>
      <button type="button" onClick={onStillHere} className="auction-bid auction-bid-green min-h-11 px-4 text-base">
        {AUCTION_TEXT.stillHere}
      </button>
    </div>
  );
}
