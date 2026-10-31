import type { AuctionStateView } from "@pokemon-minigames/shared";
import { Avatar } from "../../../components/Avatar";
import { GuestTag } from "../../../components/GuestTag";
import { AUCTION_ITEM_LABELS, AUCTION_TEXT, auctionMoney } from "../../../i18n/es";
import { useRoom } from "../use-room";

/** Lo que se sabe de los dos: la subasta es abierta, así que dinero, cuántos Pokémon llevan y objetos están a la vista. */
export function AuctionPlayers({ auction }: { auction: AuctionStateView }) {
  const { me, opponent } = useRoom();
  return (
    <div role="group" aria-label={AUCTION_TEXT.players} className="grid grid-cols-2 gap-3">
      {[me, opponent].map((player) =>
        player ? (
          <div key={player.seat} className="framed flex min-w-0 flex-col items-center gap-1 rounded-card bg-surface p-3 text-center shadow-card">
            <Avatar name={player.username} avatarId={player.avatarId} size="sm" />
            <span className="max-w-full text-sm font-semibold [overflow-wrap:anywhere]">{player.username}</span>
            {player.guest ? <GuestTag /> : null}
            <span className="font-num text-lg font-semibold tabular-nums">{auctionMoney(auction.money[player.seat])}</span>
            <span className="text-xs text-muted">{AUCTION_TEXT.teamSize(auction.teamSizes[player.seat])}</span>
            {auction.items[player.seat].length > 0 ? (
              <ul className="flex flex-wrap justify-center gap-1 text-xs">
                {auction.items[player.seat].map((item, index) => (
                  <li key={`${item}-${index}`} className="rounded-pill bg-surface-2 px-2 py-0.5">
                    {AUCTION_ITEM_LABELS[item].name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null,
      )}
    </div>
  );
}
