import type { AuctionLotView } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { bidOptions } from "../../src/game/auction-bids";

const lot = (over: Partial<AuctionLotView>): AuctionLotView => ({
  number: 1,
  kind: "pokemon",
  silhouetteUrl: "/silhouettes/x",
  price: 150_000,
  currentBid: null,
  leader: null,
  turn: 1,
  deadline: 0,
  turnId: 1,
  myLimit: 800_000,
  ...over,
});

describe("bidOptions", () => {
  it("sin puja, la única opción es abrir al precio inicial", () => {
    expect(bidOptions(lot({}))).toEqual([{ step: null, amount: 150_000, affordable: true }]);
  });

  it("con puja, suben los tres saltos y se marca lo que no alcanza", () => {
    expect(bidOptions(lot({ currentBid: 200_000, myLimit: 260_000 }))).toEqual([
      { step: 10_000, amount: 210_000, affordable: true },
      { step: 50_000, amount: 250_000, affordable: true },
      { step: 100_000, amount: 300_000, affordable: false },
    ]);
  });

  it("el tope exacto alcanza; por debajo del precio inicial, no", () => {
    expect(bidOptions(lot({ myLimit: 150_000 }))[0]!.affordable).toBe(true);
    expect(bidOptions(lot({ myLimit: 149_999 }))[0]!.affordable).toBe(false);
  });
});
