import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Layer } from "../Layer";
import { EventBus } from "../../../../core/EventBus";
import { GameView, PlayerView, UnitView } from "../../../../core/game/GameView";
import { ClientID } from "../../../../core/Schemas";
import { Front } from "./Interfaces";
import { AttackUpdate } from "../../../../core/game/GameUpdates";
import { PlayerType } from "../../../../core/game/Game";
import { renderTroops } from "../../../Utils";
import { GoToPlayerEvent } from "../Leaderboard";
@customElement("fronts-display")
export class FrontsDisplay extends LitElement implements Layer {
  public eventBus: EventBus;
  public game: GameView;
  public clientID: ClientID;

  private fronts: Front[] = [];

  @state() private incomingAttacks: AttackUpdate[] = [];
  @state() private outgoingAttacks: AttackUpdate[] = [];
  @state() private outgoingBoats: UnitView[] = [];

  tick() {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer) return;
    // Update attacks
    this.incomingAttacks = myPlayer.incomingAttacks().filter((a) => {
      const t = (this.game.playerBySmallID(a.attackerID) as PlayerView).type();
      return t != PlayerType.Bot;
    });

    this.outgoingAttacks = myPlayer
      .outgoingAttacks()
      .filter((a) => a.targetID != 0);

    this.updateFronts();
  }

  openFront(playerID: number): Front {
    const front: Front = {
      player: this.game.playerBySmallID(playerID) as PlayerView,
      incoming: [],
      outgoing: [],
      createdAt: Date.now(),
      inactive: null,
    };
    return front;
  }

  updateFronts() {
    const incoming = Object.groupBy(
      this.incomingAttacks,
      ({ attackerID }) => attackerID,
    );
    const outgoing = Object.groupBy(
      this.outgoingAttacks,
      ({ targetID }) => targetID,
    );
    const fronts = this.fronts.map((f) => ({
      ...f,
      incoming: [],
      outgoing: [],
    }));
    Object.keys(incoming).forEach((playerID) => {
      let front = fronts.find((f) => f.player.smallID() === Number(playerID));
      if (!front) {
        front = this.openFront(Number(playerID));
        fronts.push(front);
      }
      front.incoming = incoming[playerID];
      front.inactive = null;
    });

    Object.keys(outgoing).forEach((playerID) => {
      let front = fronts.find((f) => f.player.smallID() === Number(playerID));
      if (!front) {
        front = this.openFront(Number(playerID));
        fronts.push(front);
      }
      front.outgoing = outgoing[playerID];
      front.inactive = null;
    });

    // Inactive delay in ticks
    const inactiveDelay = 30;

    // Check and remove fronts that are inactive
    this.fronts = fronts
      .map((f) =>
        !f.inactive && !f.outgoing.length && !f.incoming.length
          ? { ...f, inactive: this.game.ticks() }
          : f,
      )
      .filter(
        (f) =>
          f.inactive === null || f.inactive + inactiveDelay > this.game.ticks(),
      );
  }

  getFronts() {
    return this.fronts;
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
          ${this.getFronts().map(
            (front) => html`
              <li
                class="theme-container flex flex-col items-end pl-4 pr-2 py-1"
              >
                <button
                  @click=${() =>
                    this.emitGoToPlayerEvent(front.player.smallID())}
                >
                  <span class="text-xs text-white">
                    ${front.player.name()}
                  </span>
                </button>
                <div class="text-red-500">
                  ${front.incoming.map(
                    (attack) =>
                      html`<span>${renderTroops(attack.troops)}</span>`,
                  )}
                </div>
                <div class="text-blue-500 flex flex-col gap-1">
                  ${front.outgoing.map(
                    (attack) => html`
                      <div class="flex gap-2 items-center justify-center">
                        <span>${renderTroops(attack.troops)}</span>
                        <button>
                          <span>❌</span>
                        </button>
                      </div>
                    `,
                  )}
                </div>
                ${front.inactive
                  ? html`<span class="text-xs text-gray-500">Inactive</span>`
                  : ""}
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
