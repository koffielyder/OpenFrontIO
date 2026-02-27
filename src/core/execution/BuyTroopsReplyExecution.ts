import { Execution, Game, Player, PlayerID } from "../game/Game";

export class BuyTroopsReplyExecution implements Execution {
  private active = true;

  constructor(
    private recipient: Player,
    private requestorID: PlayerID,
    private accept: boolean,
  ) {}

  init(mg: Game): void {
    try {
      if (!mg.hasPlayer(this.requestorID)) {
        this.active = false;
        return;
      }

      const requestor = mg.player(this.requestorID);
      const request = requestor
        .outgoingTroopPurchaseRequests()
        .find((r) => r.recipient() === this.recipient);

      if (!request) {
        this.active = false;
        return;
      }

      if (this.accept) {
        request.accept();
      } else {
        request.reject();
      }

      this.active = false;
    } catch (error) {
      console.error("[BuyTroopsReplyExecution] init failed", error);
      this.active = false;
    }
  }

  tick(): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
