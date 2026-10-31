import type { AuctionStateView, RoomPlayerView } from "@pokemon-minigames/shared";
import { GuestTag } from "../../../components/GuestTag";
import { AUCTION_TEXT, auctionMoney } from "../../../i18n/es";

const SLOTS = 6;

/** Lo que se sabe de un jugador: la subasta es abierta, así que su dinero y sus compras están a la vista, como siluetas. */
export function AuctionPlayer({ player, auction, isMe, active, note }: { player: RoomPlayerView; auction: AuctionStateView; isMe: boolean; active: boolean; note?: string }) {
  const purchases = auction.purchases[player.seat];
  return (
    <section role="group" aria-label={player.username} data-active={active} className={`auction-panel flex min-w-0 flex-col gap-2 p-3 lg:gap-3 ${active ? (isMe ? "auction-panel-me" : "auction-panel-rival") : ""}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <span className="font-pixel min-w-0 text-lg font-bold [overflow-wrap:anywhere] lg:text-2xl">{player.username}</span>
        {player.guest ? <GuestTag /> : null}
      </div>
      <div className={`rounded-lg p-2 ${isMe ? "auction-money-me" : "auction-money-rival"}`}>
        <div className="text-xs font-extrabold">{isMe ? AUCTION_TEXT.yourMoney : AUCTION_TEXT.theirMoney}</div>
        <div className="font-pixel text-lg font-bold tabular-nums lg:text-2xl">{auctionMoney(auction.money[player.seat])}</div>
      </div>
      <div className="text-sm font-extrabold">{AUCTION_TEXT.teamSize(purchases.length)}</div>
      <div className="grid grid-cols-6 gap-1 lg:grid-cols-3 lg:gap-1.5">
        {Array.from({ length: SLOTS }, (_, index) => {
          const url = purchases[index];
          return url ? (
            <div key={index} data-slot className={`aspect-square overflow-hidden rounded-md ${isMe ? "auction-money-me" : "auction-money-rival"}`}>
              <img src={url} alt={AUCTION_TEXT.boughtSilhouette} className="size-full object-contain" />
            </div>
          ) : (
            <div key={index} data-slot className="auction-slot-empty aspect-square rounded-md" />
          );
        })}
      </div>
      {note ? <p className="hidden text-xs leading-snug lg:block">{note}</p> : null}
    </section>
  );
}
