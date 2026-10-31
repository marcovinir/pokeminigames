import type { AuctionSummary as Summary, Seat } from "@pokemon-minigames/shared";
import { Card } from "../../../components/Card";
import { AUCTION_SUMMARY_TEXT, auctionMoney } from "../../../i18n/es";

/** Lo que dejó la partida: daño hecho por cada uno y dinero gastado. */
export function AuctionSummary({ summary, names, mySeat }: { summary: Summary; names: Record<Seat, string>; mySeat: Seat }) {
  const seats: Seat[] = mySeat === 1 ? [1, 2] : [2, 1];
  return (
    <Card as="section" aria-label={AUCTION_SUMMARY_TEXT.title} className="grid grid-cols-2 gap-4 p-4 text-center">
      {seats.map((seat) => (
        <dl key={seat} data-summary-seat={seat} className="min-w-0 text-sm">
          <p className="font-display font-semibold [overflow-wrap:anywhere]">{names[seat]}</p>
          <dt className="mt-2 text-muted">{AUCTION_SUMMARY_TEXT.damage}</dt>
          <dd className="font-num text-xl font-semibold tabular-nums">{summary.damage[seat]}</dd>
          <dt className="mt-2 text-muted">{AUCTION_SUMMARY_TEXT.spent}</dt>
          <dd className="font-num tabular-nums">{auctionMoney(summary.spent[seat])}</dd>
        </dl>
      ))}
    </Card>
  );
}
