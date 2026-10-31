import { useState } from "react";
import { AUCTION_HELP } from "../../../i18n/es";

const SEEN_KEY = "pokeminigames:subasta-ayuda";

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

/** La explicación de cómo se puja: se ofrece la primera vez y se reabre con «?». No bloquea el turno de nadie. */
export function AuctionHelp() {
  const [open, setOpen] = useState(() => !alreadySeen());

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "vista");
    } catch {
      // Sin almacenamiento volverá a salir la próxima vez: no impide jugar.
    }
  };

  if (!open) {
    return (
      <button type="button" aria-label={AUCTION_HELP.title} onClick={() => setOpen(true)} className="font-pixel absolute right-2 bottom-2 z-10 size-11 cursor-pointer rounded-lg border-0 bg-white text-xl font-bold text-[#141033] shadow-[0_3px_0_rgb(0_0_0/0.4)]">
        ?
      </button>
    );
  }
  return (
    <section aria-label={AUCTION_HELP.title} className="absolute inset-x-2 bottom-2 z-10 rounded-lg bg-white p-3 text-sm text-[#141033] shadow-[0_4px_0_rgb(0_0_0/0.4)]">
      <h2 className="font-pixel mb-1 text-lg font-bold">{AUCTION_HELP.title}</h2>
      <ol className="mb-2 flex list-decimal flex-col gap-1 pl-5">
        {AUCTION_HELP.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <button type="button" onClick={close} className="auction-bid auction-bid-green min-h-11 px-4 text-base">
        {AUCTION_HELP.close}
      </button>
    </section>
  );
}
