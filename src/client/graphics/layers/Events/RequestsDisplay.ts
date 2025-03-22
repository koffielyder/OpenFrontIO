import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Layer } from "../Layer";
import { EventBus } from "../../../../core/EventBus";
import { GameView, PlayerView, UnitView } from "../../../../core/game/GameView";
import { ClientID } from "../../../../core/Schemas";
import { Request } from "./Interfaces";
import {
  AllianceRequestUpdate,
  AttackUpdate,
  GameUpdateType,
} from "../../../../core/game/GameUpdates";
import { PlayerType } from "../../../../core/game/Game";
import { renderTroops } from "../../../Utils";
import { GoToPlayerEvent } from "../Leaderboard";
@customElement("requests-display")
export class RequestsDisplay extends LitElement implements Layer {
  public eventBus: EventBus;
  public game: GameView;
  public clientID: ClientID;

  private requests: Request[] = [];

  @state() private incomingAttacks: AttackUpdate[] = [];
  @state() private outgoingAttacks: AttackUpdate[] = [];
  @state() private outgoingBoats: UnitView[] = [];

  private updateMap = new Map([
    [GameUpdateType.AllianceRequest, (u) => this.onAllianceRequestEvent(u)],
  ]);

  tick() {
    const updates = this.game.updatesSinceLastTick();
    let hasUpdate = false;
    for (const [ut, fn] of this.updateMap) {
      if (!hasUpdate && updates[ut]) hasUpdate = true;
      updates[ut]?.forEach((u) => fn(u));
    }

    if (hasUpdate) this.requestUpdate();
  }

  onAllianceRequestEvent(update: AllianceRequestUpdate) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer || update.recipientID !== myPlayer.smallID()) {
      return;
    }

    const requestor = this.game.playerBySmallID(
      update.requestorID,
    ) as PlayerView;

    this.addRequest({
      player: requestor,
      description: `${requestor.name()} requests an alliance!`,
      createdAt: this.game.ticks(),
      focusID: update.requestorID,
      onAccept: () => {},
      onReject: () => {},
    });
  }

  addRequest(request: Request) {
    this.requests.push(request);
  }

  getRequests() {
    return this.requests;
  }

  emitGoToPlayerEvent(attackerID: number) {
    const attacker = this.game.playerBySmallID(attackerID) as PlayerView;
    if (!attacker) return;
    this.eventBus.emit(new GoToPlayerEvent(attacker));
  }

  render() {
    return html`
      <div class="md:max-w-sm">
        <ul class="flex gap-2 flex-col">
          ${this.getRequests().map(
            (request) => html`
              <li class="theme-container flex flex-col p-4">
                <div>
                  <h3 class="text-lg font-bold">Alliance request</h3>
                  <span>${request.player.name}</span>
                </div>
                <p>${request.description}</p>
                <div class="flex gap-2 justify-between">
                  <button
                    @click=${() => request.onAccept()}
                    class="btn btn-green"
                  >
                    Focus
                  </button>
                  <button
                    @click=${() => request.onAccept()}
                    class="btn btn-green"
                  >
                    Accept
                  </button>
                  <button
                    @click=${() => request.onReject()}
                    class="btn btn-red"
                  >
                    Reject
                  </button>
                </div>
              </li>
            `,
          )}
        </ul>
      </div>
    `;
  }

  createRenderRoot() {
    return this;
  }
}
