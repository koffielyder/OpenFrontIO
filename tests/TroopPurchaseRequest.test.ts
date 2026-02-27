import { AllianceRequestExecution } from "../src/core/execution/alliance/AllianceRequestExecution";
import { BuyTroopsReplyExecution } from "../src/core/execution/BuyTroopsReplyExecution";
import { BuyTroopsRequestExecution } from "../src/core/execution/BuyTroopsRequestExecution";
import { Game, Player, PlayerType } from "../src/core/game/Game";
import { playerInfo, setup } from "./util/Setup";

let game: Game;
let buyer: Player;
let seller: Player;

describe("TroopPurchaseRequest", () => {
  beforeEach(async () => {
    game = await setup(
      "plains",
      {
        infiniteGold: false,
        infiniteTroops: false,
        donateTroops: true,
      },
      [
        playerInfo("buyer", PlayerType.Human),
        playerInfo("seller", PlayerType.Human),
      ],
    );

    buyer = game.player("buyer");
    seller = game.player("seller");

    buyer.conquer(game.ref(0, 0));
    seller.conquer(game.ref(0, 1));

    while (game.inSpawnPhase()) {
      game.executeNextTick();
    }

    game.addExecution(new AllianceRequestExecution(buyer, seller.id()));
    game.executeNextTick();
    game.addExecution(new AllianceRequestExecution(seller, buyer.id()));
    game.executeNextTick();

    buyer.addGold(10_000n);
  });

  test("accept sends available troops and reduces gold to actual sent", () => {
    seller.setTroops(35);

    const buyerTroopsBefore = buyer.troops();
    const sellerTroopsBefore = seller.troops();
    const buyerGoldBefore = buyer.gold();
    const sellerGoldBefore = seller.gold();

    game.addExecution(
      new BuyTroopsRequestExecution(buyer, seller.id(), 1_000n),
    );
    game.executeNextTick();

    game.addExecution(new BuyTroopsReplyExecution(seller, buyer.id(), true));
    game.executeNextTick();

    expect(buyer.troops()).toBe(buyerTroopsBefore + sellerTroopsBefore);
    expect(seller.troops()).toBe(0);
    expect(buyer.gold()).toBe(
      buyerGoldBefore - BigInt(sellerTroopsBefore * 10),
    );
    expect(seller.gold()).toBe(
      sellerGoldBefore + BigInt(sellerTroopsBefore * 10),
    );
  });

  test("reject keeps resources unchanged", () => {
    const buyerTroopsBefore = buyer.troops();
    const sellerTroopsBefore = seller.troops();
    const buyerGoldBefore = buyer.gold();
    const sellerGoldBefore = seller.gold();

    game.addExecution(new BuyTroopsRequestExecution(buyer, seller.id(), 500n));
    game.executeNextTick();

    game.addExecution(new BuyTroopsReplyExecution(seller, buyer.id(), false));
    game.executeNextTick();

    expect(buyer.troops()).toBe(buyerTroopsBefore);
    expect(seller.troops()).toBe(sellerTroopsBefore);
    expect(buyer.gold()).toBe(buyerGoldBefore);
    expect(seller.gold()).toBe(sellerGoldBefore);
  });
});
