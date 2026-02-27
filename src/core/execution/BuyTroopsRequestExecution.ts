import {
  Execution,
  Game,
  Gold,
  Player,
  PlayerID,
  TroopPurchaseRequest,
} from "../game/Game";

export class BuyTroopsRequestExecution implements Execution {
  private req: TroopPurchaseRequest | null = null;
  private active = true;
  private mg: Game;

  constructor(
    private requestor: Player,
    private recipientID: PlayerID,
    private gold: Gold,
  ) {}

  init(mg: Game): void {
    try {
      this.mg = mg;
      if (!mg.hasPlayer(this.recipientID)) {
        this.active = false;
        return;
      }

      const recipient = mg.player(this.recipientID);
      if (!this.requestor.canRequestTroopsFrom(recipient)) {
        this.active = false;
        return;
      }

      this.req = this.requestor.createTroopPurchaseRequest(
        recipient,
        this.gold,
      );
    } catch (error) {
      console.error("[BuyTroopsRequestExecution] init failed", error);
      this.active = false;
    }
  }

  tick(): void {
    try {
      if (
        this.req?.status() === "accepted" ||
        this.req?.status() === "rejected"
      ) {
        this.active = false;
        return;
      }

      if (
        this.mg.ticks() - (this.req?.createdAt() ?? 0) >
        this.mg.config().allianceRequestDuration()
      ) {
        this.req?.reject();
        this.active = false;
      }
    } catch (error) {
      console.error("[BuyTroopsRequestExecution] tick failed", error);
      this.active = false;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
