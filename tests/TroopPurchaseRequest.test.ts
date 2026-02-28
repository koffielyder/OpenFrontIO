import { AllianceRequestExecution } from "../src/core/execution/alliance/AllianceRequestExecution";
import { BotExecution } from "../src/core/execution/BotExecution";
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

  test("accept sends available troops and refunds unused reserved gold", () => {
    seller.setTroops(35);

    const buyerTroopsBefore = buyer.troops();
    const sellerTroopsBefore = seller.troops();
    const buyerGoldBefore = buyer.gold();
    const sellerGoldBefore = seller.gold();

    game.addExecution(
      new BuyTroopsRequestExecution(buyer, seller.id(), 1_000n),
    );
    game.executeNextTick();

    const createdRequest = buyer.outgoingTroopPurchaseRequests()[0];
    expect(createdRequest).toBeDefined();
    const reservedGold = createdRequest!.gold();
    expect(buyer.gold()).toBe(buyerGoldBefore - reservedGold);

    game.addExecution(new BuyTroopsReplyExecution(seller, buyer.id(), true));
    game.executeNextTick();

    expect(buyer.troops()).toBe(buyerTroopsBefore + sellerTroopsBefore);
    expect(seller.troops()).toBe(0);
    expect(buyer.gold()).toBe(buyerGoldBefore - BigInt(sellerTroopsBefore));
    expect(seller.gold()).toBe(sellerGoldBefore + BigInt(sellerTroopsBefore));
  });

  test("reject refunds all reserved gold", () => {
    const buyerTroopsBefore = buyer.troops();
    const sellerTroopsBefore = seller.troops();
    const buyerGoldBefore = buyer.gold();
    const sellerGoldBefore = seller.gold();

    game.addExecution(new BuyTroopsRequestExecution(buyer, seller.id(), 500n));
    game.executeNextTick();

    const createdRequest = buyer.outgoingTroopPurchaseRequests()[0];
    expect(createdRequest).toBeDefined();
    const reservedGold = createdRequest!.gold();
    expect(buyer.gold()).toBe(buyerGoldBefore - reservedGold);

    game.addExecution(new BuyTroopsReplyExecution(seller, buyer.id(), false));
    game.executeNextTick();

    expect(buyer.troops()).toBe(buyerTroopsBefore);
    expect(seller.troops()).toBe(sellerTroopsBefore);
    expect(buyer.gold()).toBe(buyerGoldBefore);
    expect(seller.gold()).toBe(sellerGoldBefore);
  });

  test("timeout refunds all reserved gold", () => {
    const buyerGoldBefore = buyer.gold();

    game.addExecution(new BuyTroopsRequestExecution(buyer, seller.id(), 300n));
    game.executeNextTick();

    const createdRequest = buyer.outgoingTroopPurchaseRequests()[0];
    expect(createdRequest).toBeDefined();
    const reservedGold = createdRequest!.gold();
    expect(buyer.gold()).toBe(buyerGoldBefore - reservedGold);

    const timeoutTicks = game.config().allianceRequestDuration() + 2;
    for (let i = 0; i < timeoutTicks; i++) {
      game.executeNextTick();
    }

    expect(buyer.outgoingTroopPurchaseRequests().length).toBe(0);
    expect(buyer.gold()).toBe(buyerGoldBefore);
  });

  test("cannot request troops when buyer is already at max troops", () => {
    seller.setTroops(20);
    buyer.setTroops(game.config().maxTroops(buyer));

    game.addExecution(new BuyTroopsRequestExecution(buyer, seller.id(), 200n));
    game.executeNextTick();

    expect(buyer.outgoingTroopPurchaseRequests().length).toBe(0);
  });

  test("can request troops without alliance", async () => {
    const noAllianceGame = await setup(
      "plains",
      {
        infiniteGold: false,
        infiniteTroops: false,
        donateTroops: true,
      },
      [
        playerInfo("buyer_no_ally", PlayerType.Human),
        playerInfo("seller_no_ally", PlayerType.Human),
      ],
    );

    const noAllianceBuyer = noAllianceGame.player("buyer_no_ally");
    const noAllianceSeller = noAllianceGame.player("seller_no_ally");

    noAllianceBuyer.conquer(noAllianceGame.ref(0, 0));
    noAllianceSeller.conquer(noAllianceGame.ref(0, 1));

    while (noAllianceGame.inSpawnPhase()) {
      noAllianceGame.executeNextTick();
    }

    noAllianceBuyer.addGold(500n);
    noAllianceGame.addExecution(
      new BuyTroopsRequestExecution(
        noAllianceBuyer,
        noAllianceSeller.id(),
        200n,
      ),
    );
    noAllianceGame.executeNextTick();

    expect(noAllianceBuyer.outgoingTroopPurchaseRequests().length).toBe(1);
  });

  test("cannot request troops when seller embargoes buyer", () => {
    seller.addEmbargo(buyer, false);
    buyer.addGold(500n);

    game.addExecution(new BuyTroopsRequestExecution(buyer, seller.id(), 200n));
    game.executeNextTick();

    expect(buyer.outgoingTroopPurchaseRequests().length).toBe(0);
  });

  test("bots reject troop purchase requests on their next tick", async () => {
    const botGame = await setup(
      "plains",
      {
        infiniteGold: false,
        infiniteTroops: false,
        donateTroops: true,
      },
      [
        playerInfo("human_buyer", PlayerType.Human),
        playerInfo("bot_seller", PlayerType.Bot),
      ],
    );

    const humanBuyer = botGame.player("human_buyer");
    const botSeller = botGame.player("bot_seller");

    humanBuyer.conquer(botGame.ref(0, 0));
    botSeller.conquer(botGame.ref(0, 1));

    while (botGame.inSpawnPhase()) {
      botGame.executeNextTick();
    }

    humanBuyer.addGold(500n);
    botSeller.setTroops(100);

    botGame.addExecution(new BotExecution(botSeller));
    botGame.executeNextTick();

    const buyerGoldBefore = humanBuyer.gold();
    botGame.addExecution(
      new BuyTroopsRequestExecution(humanBuyer, botSeller.id(), 200n),
    );
    botGame.executeNextTick();

    expect(humanBuyer.outgoingTroopPurchaseRequests().length).toBe(1);
    expect(humanBuyer.gold()).toBeLessThan(buyerGoldBefore);

    botGame.executeNextTick();

    expect(humanBuyer.outgoingTroopPurchaseRequests().length).toBe(0);
    expect(humanBuyer.gold()).toBe(buyerGoldBefore);
  });
});
