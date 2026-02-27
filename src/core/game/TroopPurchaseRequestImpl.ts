import { Gold, Player, Tick, TroopPurchaseRequest } from "./Game";
import { GameImpl } from "./GameImpl";
import { GameUpdateType, TroopPurchaseRequestUpdate } from "./GameUpdates";

export class TroopPurchaseRequestImpl implements TroopPurchaseRequest {
  private status_: "pending" | "accepted" | "rejected" = "pending";

  constructor(
    private requestor_: Player,
    private recipient_: Player,
    private gold_: Gold,
    private tickCreated: number,
    private game: GameImpl,
  ) {}

  status(): "pending" | "accepted" | "rejected" {
    return this.status_;
  }

  requestor(): Player {
    return this.requestor_;
  }

  recipient(): Player {
    return this.recipient_;
  }

  gold(): Gold {
    return this.gold_;
  }

  createdAt(): Tick {
    return this.tickCreated;
  }

  accept(): void {
    this.status_ = "accepted";
    this.game.acceptTroopPurchaseRequest(this);
  }

  reject(): void {
    this.status_ = "rejected";
    this.game.rejectTroopPurchaseRequest(this);
  }

  toUpdate(): TroopPurchaseRequestUpdate {
    return {
      type: GameUpdateType.TroopPurchaseRequest,
      requestorID: this.requestor_.smallID(),
      recipientID: this.recipient_.smallID(),
      gold: this.gold_,
      createdAt: this.tickCreated,
    };
  }
}
