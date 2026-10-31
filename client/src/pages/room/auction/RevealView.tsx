import type { AuctionRevealEntry } from "@pokemon-minigames/shared";
import { ArtImage } from "../../../components/ArtImage";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { useCountdown } from "../../../game/clock";
import { AUCTION_REVEAL_MS, AUCTION_REVEAL_STEP_MS } from "../../../game/durations";
import { useReducedMotion } from "../../../game/motion";
import { AUCTION_TEXT } from "../../../i18n/es";
import { LeaveButton } from "../LeaveButton";
import { useRoom } from "../use-room";

/** Cuántos Pokémon se han revelado ya: el primero al empezar y otro cada 3 s. Se calcula del plazo: al recargar sale igual. */
export function revealedCount(deadline: number, now: number, total: number): number {
  const elapsed = now - (deadline - AUCTION_REVEAL_MS);
  return Math.min(total, Math.max(1, 1 + Math.floor(elapsed / AUCTION_REVEAL_STEP_MS)));
}

function RevealEntry({ entry, shown, animated }: { entry: AuctionRevealEntry; shown: boolean; animated: boolean }) {
  if (!shown) {
    return (
      <li className="framed flex min-h-24 items-center justify-center rounded-card bg-surface p-3 font-display text-2xl font-semibold text-muted">
        <span>???</span>
      </li>
    );
  }
  return (
    <li data-reveal-entry className={`framed flex min-w-0 items-center gap-3 rounded-card bg-surface p-3 ${animated ? "animate-rise" : ""} ${entry.wasTrap ? `border-danger ${animated ? "auction-trap" : ""}` : ""}`}>
      <ArtImage id={entry.pokemon.id} spriteUrl={entry.pokemon.spriteUrl} size={72} variant="sprite" eager className="auction-pixel size-18 shrink-0 object-contain" />
      <span className="min-w-0">
        <span className="font-display block font-semibold [overflow-wrap:anywhere]">{entry.pokemon.names.es}</span>
        {entry.wasTrap ? <span className="block text-sm font-semibold text-danger">{AUCTION_TEXT.wasTrap}</span> : null}
      </span>
    </li>
  );
}

/** Los Pokémon reales, uno por uno y en el orden de compra, con el momento de la trampa. */
export function RevealView() {
  const { view, client, me, opponent } = useRoom();
  const auction = view.auction;
  const deadline = auction?.battle?.deadline ?? null;
  const remaining = useCountdown(deadline, view.clockOffset);
  const reduced = useReducedMotion();
  if (!auction || view.mySeat === null) return null;

  const total = auction.reveal.length;
  const count = deadline === null ? total : revealedCount(deadline, deadline - remaining, total);
  const shown = auction.reveal.slice(0, count);
  const last = shown[shown.length - 1];
  const confirmed = auction.battle?.confirmed === true;

  const column = (title: string, seat: number) => (
    <section aria-label={AUCTION_TEXT.teamOf(title)} className="flex min-w-0 flex-col gap-2">
      <h2 className="font-display text-lg font-semibold text-white [overflow-wrap:anywhere]">{title}</h2>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {auction.reveal.map((entry, index) =>
          entry.owner === seat ? <RevealEntry key={entry.pokemon.id} entry={entry} shown={index < count} animated={!reduced} /> : null,
        )}
      </ul>
    </section>
  );

  return (
    <section className="auction-screen relative mx-auto flex w-full max-w-5xl flex-col gap-4 overflow-hidden p-3">
      <img src="/auction/lote-noche.png" alt="" className="auction-pixel absolute inset-0 size-full object-cover" />
      <p role="log" aria-label={AUCTION_TEXT.revealLog} className="sr-only">
        {last ? `${last.pokemon.names.es}${last.wasTrap ? `. ${AUCTION_TEXT.wasTrap}` : ""}` : ""}
      </p>
      <Card tone="raised" className="relative p-4 text-center">
        <h1 className="font-pixel text-3xl font-bold">{AUCTION_TEXT.revealTitle}</h1>
      </Card>
      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2">
        {column(me?.username ?? "Tú", view.mySeat)}
        {column(opponent?.username ?? "Tu rival", view.mySeat === 1 ? 2 : 1)}
      </div>
      <div className="auction-leave relative flex flex-col items-center gap-3">
        <Button variant="primary" size="lg" disabled={confirmed} onClick={() => client.ready()}>
          {confirmed ? AUCTION_TEXT.waitingRival : AUCTION_TEXT.ready}
        </Button>
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
