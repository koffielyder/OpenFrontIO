import { NationAllianceBehavior } from "../src/core/execution/nation/NationAllianceBehavior";
import { NationEmojiBehavior } from "../src/core/execution/nation/NationEmojiBehavior";
import {
  AllianceRequest,
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  Tick,
  TroopPurchaseRequest,
} from "../src/core/game/Game";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { setup } from "./util/Setup";

let game: Game;
let player: Player;
let requestor: Player;
let allianceBehavior: NationAllianceBehavior;

describe("AllianceBehavior.handleAllianceRequests", () => {
  beforeEach(async () => {
    game = await setup("big_plains", {
      infiniteGold: true,
      instantBuild: true,
    });

    const playerInfo = new PlayerInfo(
      "player_id",
      PlayerType.Bot,
      null,
      "player_id",
    );
    const requestorInfo = new PlayerInfo(
      "requestor_id",
      PlayerType.Human,
      null,
      "requestor_id",
    );

    game.addPlayer(playerInfo);
    game.addPlayer(requestorInfo);

    player = game.player("player_id");
    requestor = game.player("requestor_id");

    // Use a fixed random seed for deterministic behavior
    const random = new PseudoRandom(46);

    allianceBehavior = new NationAllianceBehavior(
      random,
      game,
      player,
      new NationEmojiBehavior(random, game, player),
    );
  });

  function setupAllianceRequest({
    isTraitor = false,
    relationDelta = 2,
    numTilesPlayer = 10,
    numTilesRequestor = 10,
    alliancesCount = 0,
  } = {}) {
    if (isTraitor) requestor.markTraitor();

    player.updateRelation(requestor, relationDelta);
    requestor.updateRelation(player, relationDelta);

    game.map().forEachTile((tile) => {
      if (game.map().isLand(tile)) {
        if (numTilesPlayer > 0) {
          player.conquer(tile);
          numTilesPlayer--;
        } else if (numTilesRequestor > 0) {
          requestor.conquer(tile);
          numTilesRequestor--;
        }
      }
    });

    vi.spyOn(player, "alliances").mockReturnValue(new Array(alliancesCount));

    const mockRequest = {
      requestor: () => requestor,
      recipient: () => player,
      createdAt: () => 0 as unknown as Tick,
      accept: vi.fn(),
      reject: vi.fn(),
    } as unknown as AllianceRequest;

    vi.spyOn(player, "incomingAllianceRequests").mockReturnValue([mockRequest]);

    return mockRequest;
  }

  test("should accept alliance when all conditions are met", () => {
    const request = setupAllianceRequest({});

    allianceBehavior.handleAllianceRequests();

    expect(request.accept).toHaveBeenCalled();
    expect(request.reject).not.toHaveBeenCalled();
  });

  test("should reject alliance if requestor is a traitor", () => {
    const request = setupAllianceRequest({ isTraitor: true });

    allianceBehavior.handleAllianceRequests();

    expect(request.accept).not.toHaveBeenCalled();
    expect(request.reject).toHaveBeenCalled();
  });

  test("should reject alliance if relation is hostile", () => {
    const request = setupAllianceRequest({ relationDelta: -2 });

    allianceBehavior.handleAllianceRequests();

    expect(request.accept).not.toHaveBeenCalled();
    expect(request.reject).toHaveBeenCalled();
  });

  test("should accept alliance if requestor is much larger (> 3 times size of recipient)", () => {
    const request = setupAllianceRequest({
      numTilesRequestor: 40,
    });

    allianceBehavior.handleAllianceRequests();

    expect(request.accept).toHaveBeenCalled();
    expect(request.reject).not.toHaveBeenCalled();
  });

  test("should reject alliance if player has too many alliances", () => {
    const request = setupAllianceRequest({ alliancesCount: 10 });

    allianceBehavior.handleAllianceRequests();

    expect(request.accept).not.toHaveBeenCalled();
    expect(request.reject).toHaveBeenCalled();
  });
});

describe("AllianceBehavior.handleAllianceExtensionRequests", () => {
  let mockGame: any;
  let mockPlayer: any;
  let mockAlliance: any;
  let mockHuman: any;
  let mockRandom: any;
  let allianceBehavior: NationAllianceBehavior;

  beforeEach(() => {
    mockGame = { addExecution: vi.fn() };
    mockHuman = { id: vi.fn(() => "human_id") };
    mockAlliance = {
      onlyOneAgreedToExtend: vi.fn(() => true),
      other: vi.fn(() => mockHuman),
    };
    mockRandom = { chance: vi.fn() };

    mockPlayer = {
      alliances: vi.fn(() => [mockAlliance]),
      relation: vi.fn(),
      id: vi.fn(() => "bot_id"),
      type: vi.fn(() => PlayerType.Nation),
    };

    allianceBehavior = new NationAllianceBehavior(
      mockRandom,
      mockGame,
      mockPlayer,
      new NationEmojiBehavior(mockRandom, mockGame, mockPlayer),
    );
  });

  it("should NOT request extension if onlyOneAgreedToExtend is false (no expiration yet or both already agreed)", () => {
    mockAlliance.onlyOneAgreedToExtend.mockReturnValue(false);
    allianceBehavior.handleAllianceExtensionRequests();
    expect(mockGame.addExecution).not.toHaveBeenCalled();
  });
});

describe("AllianceBehavior.handleTroopPurchaseRequests", () => {
  let mockGame: any;
  let mockPlayer: any;
  let mockRequestor: any;
  let mockNeighbor: any;
  let mockRequest: TroopPurchaseRequest;
  let mockRandom: any;
  let allianceBehavior: NationAllianceBehavior;

  beforeEach(() => {
    mockRandom = { chance: vi.fn() };
    mockRequestor = {
      troops: vi.fn(() => 100),
    };
    mockNeighbor = {
      isPlayer: vi.fn(() => true),
      troops: vi.fn(() => 100),
    };

    mockPlayer = {
      incomingTroopPurchaseRequests: vi.fn(),
      relation: vi.fn(),
      troops: vi.fn(() => 220),
      neighbors: vi.fn(() => [mockNeighbor]),
      isFriendly: vi.fn(() => false),
      gold: vi.fn(() => 50n),
      info: vi.fn(
        () => new PlayerInfo("nation", PlayerType.Nation, null, "nation"),
      ),
    };

    mockGame = {
      config: vi.fn(() => ({
        maxTroops: vi.fn(() => 300),
        startingGold: vi.fn(() => 100n),
      })),
    };

    mockRequest = {
      requestor: vi.fn(() => mockRequestor),
      recipient: vi.fn(() => mockPlayer),
      gold: vi.fn(() => 100n),
      createdAt: vi.fn(() => 0 as unknown as Tick),
      status: vi.fn(() => "pending"),
      accept: vi.fn(),
      reject: vi.fn(),
    } as unknown as TroopPurchaseRequest;

    mockPlayer.incomingTroopPurchaseRequests.mockReturnValue([mockRequest]);

    allianceBehavior = new NationAllianceBehavior(
      mockRandom,
      mockGame,
      mockPlayer,
      new NationEmojiBehavior(mockRandom, mockGame, mockPlayer),
    );
  });

  test("accepts when safe after sale, can use gold, and relation is at least neutral", () => {
    mockPlayer.relation.mockReturnValue(2);

    allianceBehavior.handleTroopPurchaseRequests();

    expect(mockRequest.accept).toHaveBeenCalled();
    expect(mockRequest.reject).not.toHaveBeenCalled();
  });

  test("rejects when selling would drop below 80% of strongest non-allied neighbor", () => {
    mockPlayer.relation.mockReturnValue(3);
    mockNeighbor.troops.mockReturnValue(260);

    allianceBehavior.handleTroopPurchaseRequests();

    expect(mockRequest.accept).not.toHaveBeenCalled();
    expect(mockRequest.reject).toHaveBeenCalled();
  });

  test("rejects when relation is below neutral", () => {
    mockPlayer.relation.mockReturnValue(1);

    allianceBehavior.handleTroopPurchaseRequests();

    expect(mockRequest.accept).not.toHaveBeenCalled();
    expect(mockRequest.reject).toHaveBeenCalled();
  });
});
