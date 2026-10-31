import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Notice } from "../../../components/Notice";
import { rise } from "../../../components/rise";
import { Timer } from "../../../components/Timer";
import { bidOptions } from "../../../game/auction-bids";
import { AUCTION_TURN_MS } from "../../../game/durations";
import { AUCTION_ITEM_LABELS, AUCTION_TEXT, auctionMoney } from "../../../i18n/es";
import { useLastSeconds } from "../../../sound/use-last-seconds";
import { LeaveButton } from "../LeaveButton";
import { SilhouetteImage } from "../SilhouetteRoundView";
import { useRoom } from "../use-room";
import { AuctionPlayers } from "./AuctionPlayers";

/** La puja de un lote: la silueta o el objeto, a cuánto va, el reloj y, en mi turno, los botones. */
export function AuctionView() {
  const { view, client, opponent } = useRoom();
  const auction = view.auction;
  const lot = auction?.lot ?? null;
  const myTurn = lot !== null && lot.turn === view.mySeat;
  // Cada turno tiene su aviso de últimos segundos, y solo para quien tiene que decidir.
  useLastSeconds({ deadline: lot?.deadline ?? null, offset: view.clockOffset, answered: !myTurn, round: lot?.deadline ?? 0 });
  if (!auction || !lot) return null;

  const options = bidOptions(lot);
  const canBid = options.some((option) => option.affordable);
  const item = lot.kind === "item" && lot.item ? AUCTION_ITEM_LABELS[lot.item] : null;

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <AuctionPlayers auction={auction} />

      <Card data-arena tone="raised" style={rise(0)} className="animate-rise relative z-5 flex min-w-0 flex-col gap-4 p-6 text-center">
        <p className="font-display text-sm font-semibold text-muted">{AUCTION_TEXT.lotOf(lot.number)}</p>
        {item ? (
          <div>
            <h1 className="font-display text-2xl font-semibold">{item.name}</h1>
            <p className="mt-1 text-sm text-muted">{item.description}</p>
          </div>
        ) : (
          <>
            <h1 className="sr-only">{AUCTION_TEXT.question}</h1>
            {lot.silhouetteUrl ? <SilhouetteImage src={lot.silhouetteUrl} /> : null}
          </>
        )}
        <div>
          <p className="text-sm text-muted">{lot.currentBid === null ? AUCTION_TEXT.startingPrice : AUCTION_TEXT.currentBid}</p>
          <p className="font-num text-4xl font-semibold tabular-nums">{auctionMoney(lot.currentBid ?? lot.price)}</p>
        </div>
        <Timer deadline={lot.deadline} offset={view.clockOffset} totalMs={AUCTION_TURN_MS} label={AUCTION_TEXT.turnTimer} />
        {myTurn ? (
          <>
            {canBid ? null : <Notice>{AUCTION_TEXT.cannotBid}</Notice>}
            <div className="grid grid-cols-1 gap-2 sm:grid-flow-col sm:auto-cols-fr">
              {options.map((option) => (
                <Button key={option.amount} variant="primary" size="lg" disabled={!option.affordable} onClick={() => client.bid(option.step)}>
                  {AUCTION_TEXT.bid(option.amount)}
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="lg" onClick={() => client.pass()}>
              {AUCTION_TEXT.pass}
            </Button>
          </>
        ) : (
          <p className="font-semibold [overflow-wrap:anywhere]">{AUCTION_TEXT.rivalTurn(opponent?.username ?? "Tu rival")}</p>
        )}
      </Card>

      <div className="text-center">
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
