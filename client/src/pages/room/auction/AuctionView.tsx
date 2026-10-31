import type { AuctionLotView, Seat } from "@pokemon-minigames/shared";
import { useEffect, useRef, useState } from "react";
import { bidOptions } from "../../../game/auction-bids";
import { rivalSeat } from "../../../game/seats";
import { AUCTION_TEXT, SILHOUETTE_SCREEN, auctionMoney, auctionSaleText } from "../../../i18n/es";
import { useGame } from "../../../services";
import { useLastSeconds } from "../../../sound/use-last-seconds";
import { LeaveButton } from "../LeaveButton";
import { focusWasLost } from "../RematchPanel";
import { useRoom } from "../use-room";
import { InactivityWarning } from "./InactivityWarning";
import { AuctionHelp } from "./AuctionHelp";
import { AuctionPlayer } from "./AuctionPlayers";

const BID_COLORS = ["auction-bid-green", "auction-bid-blue", "auction-bid-purple"];

/** La silueta del lote, que flota sobre su plataforma. Si no carga, un aviso y se sigue pujando. */
function StageSilhouette({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="absolute top-1/2 left-1/2 w-44 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-2 text-center text-sm font-bold text-[#141033]">{SILHOUETTE_SCREEN.unavailable}</p>;
  return <img src={src} alt={SILHOUETTE_SCREEN.imageAlt} onError={() => setFailed(true)} className="auction-float auction-silhouette absolute bottom-[7%] left-1/2 h-[78%] max-w-[80%] -translate-x-1/2 object-contain" />;
}

/** El sello de venta: aparece un momento sobre el lote siguiente y se va. */
function SoldStamp() {
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <div aria-hidden="true" onAnimationEnd={() => setDone(true)} className="auction-stamp font-pixel absolute top-1/2 left-1/2 z-10 rounded-lg border-4 border-[#b3261e] bg-white px-4 py-1 text-3xl font-bold text-[#b3261e]">
      {AUCTION_TEXT.sold}
    </div>
  );
}

function Bids({ lot, nameOf }: { lot: AuctionLotView; nameOf(seat: Seat): string }) {
  return (
    <>
      <div className="mb-1 text-sm font-extrabold">{AUCTION_TEXT.lotBids}</div>
      <ol aria-label={AUCTION_TEXT.lotBids} className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
        {[...lot.bids].reverse().map((bid) => (
          <li key={bid.amount} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">{nameOf(bid.seat)}</span>
            <b className="tabular-nums">{auctionMoney(bid.amount)}</b>
          </li>
        ))}
      </ol>
    </>
  );
}

/** La puja de un lote: sin reloj a la vista, se turnan hasta que uno se retira. */
export function AuctionView() {
  const { view, client, me, opponent } = useRoom();
  const connection = useGame((s) => s.connection);
  // El turno en el que ya decidí: un segundo toque no debe salir hacia el servidor.
  const [sentTurn, setSentTurn] = useState<number | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const auction = view.auction;
  const lot = auction?.lot ?? null;
  const myTurn = lot !== null && !lot.auto && lot.turn === view.mySeat;
  const warningUntil = lot?.warningUntil ?? null;
  // Solo hay urgencia con el aviso abierto: suena a los últimos segundos, una vez por aviso.
  useLastSeconds({ deadline: warningUntil, offset: view.clockOffset, answered: warningUntil === null, round: warningUntil ?? 0 });
  const turnId = lot?.turnId ?? null;
  // Lo enviado pudo perderse con la conexión: al volver se puede decidir otra vez.
  useEffect(() => {
    if (connection === "connected") setSentTurn(null);
  }, [connection]);
  // Al pujar, los botones desaparecen y el foco se pierde: vuelve a ellos cuando me toca otra vez.
  useEffect(() => {
    if (myTurn && focusWasLost()) actionsRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [myTurn, turnId, warningUntil]);
  if (!auction || !lot || !me || !opponent || view.mySeat === null) return null;

  const rival = opponent.username;
  const nameOf = (seat: Seat) => view.players.find((player) => player.seat === seat)?.username ?? "";
  // Si el servidor rechazó lo que envié, se puede volver a intentar.
  const locked = sentTurn === lot.turnId && view.lastError === null;
  const decide = (send: (turnId: number) => void) => {
    setSentTurn(lot.turnId);
    send(lot.turnId);
  };
  const options = bidOptions(lot);
  const canBid = options.some((option) => option.affordable);
  const title = lot.auto ? AUCTION_TEXT.autoFor(nameOf(lot.turn)) : myTurn ? AUCTION_TEXT.yourTurn : AUCTION_TEXT.rivalTurn(rival);
  const bannerClass = lot.auto ? "bg-white" : myTurn ? "auction-banner-me" : "auction-banner-rival";
  const retireNote = lot.currentBid !== null ? AUCTION_TEXT.rivalTakes(rival) : lot.retired !== null ? AUCTION_TEXT.bothRetire : AUCTION_TEXT.rivalDecides(rival);
  const waitingNote = lot.rivalIdle ? AUCTION_TEXT.waitingFor(rival) : lot.leader === view.mySeat ? AUCTION_TEXT.ifRivalRetires(rival) : lot.retired === view.mySeat ? AUCTION_TEXT.youRetired(rival) : AUCTION_TEXT.rivalDeciding(rival);

  return (
    <section className="auction-screen grid grid-cols-2 gap-3 p-3 lg:grid-cols-[230px_minmax(0,1fr)_230px]">
      <AuctionPlayer player={me} auction={auction} isMe active={myTurn} note={lot.auto ? undefined : AUCTION_TEXT.limitNote(auctionMoney(lot.myLimit))} />
      <div className="order-last col-span-2 flex min-w-0 flex-col gap-3 lg:order-none lg:col-span-1">
        <div className={`flex flex-wrap items-center justify-between gap-x-3 rounded-xl px-4 py-2 text-[#141033] shadow-[0_5px_0_rgb(0_0_0/0.35)] ${bannerClass} ${myTurn ? "auction-pulse" : ""}`}>
          <h1 className="font-pixel text-2xl font-bold [overflow-wrap:anywhere] lg:text-4xl">{title}</h1>
          <span className="font-extrabold">{AUCTION_TEXT.lotOf(lot.number)}</span>
        </div>

        <div className="relative h-44 overflow-hidden rounded-xl lg:h-96">
          <img data-scene src={`/auction/lote-${lot.scene}.png`} alt="" className="auction-pixel absolute inset-0 size-full object-cover" />
          <StageSilhouette key={lot.silhouetteUrl} src={lot.silhouetteUrl} />
          <div className="absolute top-2 right-2 rounded-lg bg-[#141033] px-3 py-1 text-right text-white shadow-[0_4px_0_rgb(0_0_0/0.4)]">
            <div className="text-xs font-extrabold">{lot.leader !== null ? AUCTION_TEXT.leading(nameOf(lot.leader)) : AUCTION_TEXT.startingPrice}</div>
            <div key={lot.currentBid ?? lot.price} data-testid="current-bid" className="auction-bump font-num text-3xl font-bold text-[#ffcb05] tabular-nums">
              {auctionMoney(lot.currentBid ?? lot.price)}
            </div>
          </div>
          {view.lastSale?.lot === lot.number - 1 ? <SoldStamp key={view.lastSale.lot} /> : null}
          {warningUntil !== null ? <InactivityWarning until={warningUntil} offset={view.clockOffset} onStillHere={() => client.stillHere(lot.turnId)} /> : null}
          <AuctionHelp />
        </div>

        {lot.auto ? null : myTurn ? (
          <div ref={actionsRef} className="flex flex-col gap-2">
            {lot.retired !== null ? <p className="rounded-lg bg-white p-2 text-center font-bold text-[#141033]">{AUCTION_TEXT.rivalRetired(rival)}</p> : null}
            {canBid ? null : (
              <p className="rounded-lg bg-white p-2 text-center font-bold text-[#141033]">
                {AUCTION_TEXT.cannotBid} <span className="font-semibold">{AUCTION_TEXT.yourCap(auctionMoney(lot.myLimit))}</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-flow-col sm:auto-cols-fr">
              {options.map((option, index) => (
                <button key={option.amount} type="button" disabled={!option.affordable || locked} onClick={() => decide((id) => client.bid(option.step, id))} className={`auction-bid min-h-18 px-2 ${BID_COLORS[index]}`}>
                  {option.step === null ? (
                    AUCTION_TEXT.openAt(auctionMoney(option.amount))
                  ) : (
                    <>
                      +{auctionMoney(option.step).replace("₽ ", "")}
                      <span className="block font-sans text-xs font-extrabold">{AUCTION_TEXT.endsAt(auctionMoney(option.amount))}</span>
                    </>
                  )}
                </button>
              ))}
              <button type="button" disabled={locked} onClick={() => decide((id) => client.pass(id))} className="auction-bid auction-bid-retire min-h-18 px-2">
                {AUCTION_TEXT.retire}
                <span className="block font-sans text-xs font-extrabold">{retireNote}</span>
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-white p-3 font-bold text-[#141033] [overflow-wrap:anywhere]">{waitingNote}</p>
        )}

        {view.lastSale ? <p className="text-center text-sm font-semibold text-white [overflow-wrap:anywhere]">{auctionSaleText(view.lastSale, nameOf(view.lastSale.winner))}</p> : null}
        <div className="auction-leave text-center">
          <LeaveButton onLeave={() => client.leave()} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <AuctionPlayer player={opponent} auction={auction} isMe={false} active={!lot.auto && lot.turn === rivalSeat(view.mySeat)} />
        <div className="auction-panel hidden p-3 lg:block">
          <Bids lot={lot} nameOf={nameOf} />
        </div>
      </div>
    </section>
  );
}
