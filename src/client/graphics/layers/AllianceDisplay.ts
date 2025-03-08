import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML, UnsafeHTMLDirective } from "lit/directives/unsafe-html.js";
import { EventBus, GameEvent } from "../../../core/EventBus";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { ClientID } from "../../../core/Schemas";
import { Layer } from "./Layer";
import { GoToPlayerEvent } from "./Leaderboard";
import {
  AllianceExpiredUpdate,
  AllianceRequestReplyUpdate,
  AllianceRequestUpdate,
  BrokeAllianceUpdate,
  GameUpdateType,
  TargetPlayerUpdate,
} from "../../../core/game/GameUpdates";
import { MessageType, Tick } from "../../../core/game/Game";
import { DirectiveResult } from "lit/directive";
import { onlyImages } from "../../../core/Util";
import { SendAllianceReplyIntentEvent } from "../../Transport";

interface Entry {
  name: string;
  player: PlayerView;
}

interface AllianceEvent {
  description: string;
  unsafeDescription?: boolean;
  buttons?: {
    text: string;
    className: string;
    action: () => void;
    preventClose?: boolean;
  }[];
  type: MessageType;
  highlight?: boolean;
  createdAt: number;
  onDelete?: () => void;
  // lower number: lower on the display
  priority?: number;
  duration?: Tick;
  focusID?: number;
}

interface AllianceRequest extends AllianceEvent {
  onFocus?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
}

@customElement("alliance-display")
export class AllianceDisplay extends LitElement implements Layer {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;
  public selectedPlayer: PlayerView | null = null;

  allies: Entry[] = [];

  @state()
  private _allianceDisplayHidden = true;
  private _shownOnInit = false;
  private allianceEvents: AllianceEvent[] = [];
  private allianceRequests: AllianceRequest[] = [];

  private updateMap = new Map([
    [GameUpdateType.AllianceRequest, (u) => this.onAllianceRequestEvent(u)],
    [
      GameUpdateType.AllianceRequestReply,
      (u) => this.onAllianceRequestReplyEvent(u),
    ],
    [GameUpdateType.BrokeAlliance, (u) => this.onBrokeAllianceEvent(u)],
    [GameUpdateType.TargetPlayer, (u) => this.onTargetPlayerEvent(u)],
    [GameUpdateType.AllianceExpired, (u) => this.onAllianceExpiredEvent(u)],
  ]);

  init() {}

  tick() {
    const updates = this.game.updatesSinceLastTick();
    for (const [ut, fn] of this.updateMap) {
      updates[ut]?.forEach((u) => fn(u));
    }
    if (!this._shownOnInit && !this.game.inSpawnPhase()) {
      this._shownOnInit = true;
      this.showAllianceDisplay();
      this.updateAllianceDisplay();
    }
    if (this._allianceDisplayHidden) {
      return;
    }

    if (this.game.ticks() % 10 == 0) {
      this.updateAllianceDisplay();
    }

    if (this.game.ticks() % 30 == 0) {
      this.clearExpiredEvents();
    }
  }

  private addEvent(event: AllianceEvent) {
    this.allianceEvents = [...this.allianceEvents, event];
    this.requestUpdate();
  }

  private removeEvent(index: number) {
    this.allianceEvents = [
      ...this.allianceEvents.slice(0, index),
      ...this.allianceEvents.slice(index + 1),
    ];
  }

  private addAllianceRequest(request: AllianceRequest) {
    this.allianceRequests = [...this.allianceRequests, request];
    this.requestUpdate();
  }

  private removeAllianceRequest(index: number) {
    this.allianceRequests = [
      ...this.allianceRequests.slice(0, index),
      ...this.allianceRequests.slice(index + 1),
    ];
  }

  private clearExpiredEvents() {
    const curTicks: Tick = this.game.ticks();

    this.allianceEvents = this.allianceEvents.filter((event) => {
      if (event.duration == null) event.duration = 150;
      return curTicks < event.duration + event.createdAt;
    });
  }

  private updateAllianceDisplay() {
    if (this.clientID == null) {
      return;
    }
    const myPlayer = this.game
      .playerViews()
      .find((p) => p.clientID() == this.clientID);

    const allies = myPlayer.allies();

    this.allies = allies.map((player, index) => {
      return {
        name: player.displayName(),
        player: player,
      };
    });

    this.requestUpdate();
  }

  onAllianceRequestEvent(update: AllianceRequestUpdate) {
    console.log("AllianceRequestEvent", update);
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer || update.recipientID !== myPlayer.smallID()) {
      return;
    }

    const requestor = this.game.playerBySmallID(
      update.requestorID,
    ) as PlayerView;
    const recipient = this.game.playerBySmallID(
      update.recipientID,
    ) as PlayerView;
    this.addAllianceRequest({
      description: `${requestor.name()} requests an alliance!`,
      type: MessageType.INFO,
      createdAt: this.game.ticks(),
      onFocus: () => this.emitGoToPlayerEvent(requestor),
      onAccept: () =>
        this.eventBus.emit(
          new SendAllianceReplyIntentEvent(requestor, recipient, true),
        ),
      onReject: () =>
        this.eventBus.emit(
          new SendAllianceReplyIntentEvent(requestor, recipient, false),
        ),
      onDelete: () =>
        this.eventBus.emit(
          new SendAllianceReplyIntentEvent(requestor, recipient, false),
        ),
      duration: 150,
      focusID: update.requestorID,
    });
  }

  onAllianceRequestReplyEvent(update: AllianceRequestReplyUpdate) {
    console.log("AllianceRequestReplyEvent", update);
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer || update.request.requestorID !== myPlayer.smallID()) {
      return;
    }

    const recipient = this.game.playerBySmallID(
      update.request.recipientID,
    ) as PlayerView;

    this.addEvent({
      description: `${recipient.name()} ${
        update.accepted ? "accepted" : "rejected"
      } your alliance request`,
      type: update.accepted ? MessageType.SUCCESS : MessageType.ERROR,
      highlight: true,
      createdAt: this.game.ticks(),
      focusID: update.request.recipientID,
      duration: update.accepted ? 50 : 150,
    });
  }

  onBrokeAllianceEvent(update: BrokeAllianceUpdate) {
    console.log("BrokeAllianceEvent", update);
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer) return;

    const betrayed = this.game.playerBySmallID(update.betrayedID) as PlayerView;
    const traitor = this.game.playerBySmallID(update.traitorID) as PlayerView;

    if (!betrayed.isTraitor() && traitor === myPlayer) {
      this.addEvent({
        description: `You broke your alliance with ${betrayed.name()}, making you a TRAITOR`,
        type: MessageType.ERROR,
        highlight: true,
        createdAt: this.game.ticks(),
        focusID: update.betrayedID,
        duration: 100,
      });
    } else if (betrayed === myPlayer) {
      this.addEvent({
        description: `${traitor.name()}, broke their alliance with you`,
        type: MessageType.ERROR,
        highlight: true,
        createdAt: this.game.ticks(),
        focusID: update.traitorID,
        duration: 150,
      });
    }
  }

  onAllianceExpiredEvent(update: AllianceExpiredUpdate) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer) return;

    const otherID =
      update.player1ID === myPlayer.smallID()
        ? update.player2ID
        : update.player2ID === myPlayer.smallID()
          ? update.player1ID
          : null;
    if (!otherID) return;
    const other = this.game.playerBySmallID(otherID) as PlayerView;
    if (!other || !myPlayer.isAlive() || !other.isAlive()) return;

    this.addEvent({
      description: `Your alliance with ${other.name()} expired`,
      type: MessageType.WARN,
      highlight: true,
      createdAt: this.game.ticks(),
      focusID: otherID,
    });
  }

  onTargetPlayerEvent(event: TargetPlayerUpdate) {
    console.log("TargetPlayerEvent", event);
    const other = this.game.playerBySmallID(event.playerID) as PlayerView;
    const myPlayer = this.game.playerByClientID(this.clientID) as PlayerView;
    if (!myPlayer || !myPlayer.isAlliedWith(other)) return;

    const target = this.game.playerBySmallID(event.targetID) as PlayerView;

    this.addEvent({
      description: `${other.name()} requests you attack ${target.name()}`,
      type: MessageType.INFO,
      highlight: true,
      createdAt: this.game.ticks(),
      focusID: event.targetID,
      duration: 300,
    });
  }

  private handleRowClick(player: PlayerView) {
    this.selectPlayer(player);
  }

  private emitGoToPlayerEvent(player: PlayerView | number) {
    if (typeof player === "number")
      player = this.game.playerBySmallID(player) as PlayerView;
    if (!player) return;
    this.eventBus.emit(new GoToPlayerEvent(player));
  }

  private selectPlayer(player: PlayerView | null) {
    if (this.selectedPlayer == player) this.selectedPlayer = null;
    else this.selectedPlayer = player;
    this.requestUpdate();
  }

  private getMessageTypeClasses(type: MessageType): string {
    switch (type) {
      case MessageType.SUCCESS:
        return "bg-green-600/50";
      case MessageType.INFO:
        return "bg-blue-600/50";
      case MessageType.WARN:
        return "bg-yellow-600/50";
      case MessageType.ERROR:
        return "bg-red-600/50";
      default:
        return "bg-gray-600/50";
    }
  }
  private getEventDescription(
    event: AllianceEvent,
  ): string | DirectiveResult<typeof UnsafeHTMLDirective> {
    return event.unsafeDescription
      ? unsafeHTML(onlyImages(event.description))
      : event.description;
  }

  renderLayer(context: CanvasRenderingContext2D) {}
  shouldTransform(): boolean {
    return false;
  }
  static styles = css`
    @keyframes slide-in {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    .animate-slide-in {
      animation: slide-in 0.3s ease-out;
    }
  `;

  renderAllianceEvents() {
    return html`
      <div class="relative z-10 flex w-full flex-col py-2">
        <div class="bg-shadow relative z-20">
          <div
            class="flex flex-col gap-3 p-4 drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]"
          >
            <div class="flex flex-col gap-3 p-4 max-h-[30vh]">
              ${this.allianceEvents.map(
                (event, index) => html`
                  <div
                    class="rounded-lg ${this.getMessageTypeClasses(
                      event.type,
                    )} bg-gradient-to-bl from-black/20 to-black/0 p-3 text-sm text-white shadow-lg animate-slide-in"
                  >
                    ${this.getEventDescription(event)}
                  </div>
                `,
              )}
            </div>
            ${this.allianceRequests.map(
              (request, index) => html`
                <div
                  class="rounded-lg bg-yellow-300/50 text-sm text-white drop-shadow-md animate-slide-in flex flex-col overflow-hidden"
                >
                  <p
                    class="font-semibold py-3 text-center bg-gradient-to-bl bg-yellow-500/75 px-4 text-lg"
                  >
                    ${this.getEventDescription(request)}
                  </p>
                  <div class="flex flex-wrap gap-4 p-4 justify-evenly items">
                    <button
                      @click=${request.onFocus}
                      class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg text-base font-semibold flex items-center justify-center w-full shadow-md"
                    >
                      🔍 Focus
                    </button>
                    <div class="flex items-stretch w-full gap-4">
                      <button
                        @click=${request.onAccept}
                        class="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg text-base font-semibold flex items-center justify-center shadow-md flex-grow"
                      >
                        ✅ Accept
                      </button>
                      <button
                        @click=${request.onReject}
                        class="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg text-base font-semibold flex items-center justify-center shadow-md flex-grow"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                </div>
              `,
            )}
          </div>
        </div>
      </div>
    `;
  }

  renderAllianceOverview() {
    return html`
      <div
        class="relative z-20 rounded-lg bg-gray-800/80 p-4 gap-4 flex flex-col max-h-[30vh] overflow-y-auto"
      >
        <button
          class="flex justify-between items-center sticky top-0 left-0"
          @click=${() => this.toggleAllianceDisplay()}
        >
          <h2 class="text-lg font-semibold">
            Alliances (${this.allies.length})
          </h2>
          <span> ${this._allianceDisplayHidden ? "Show" : "Hide"} </span>
        </button>
        <ul
          class="space-y-2 text-sm ${this._allianceDisplayHidden
            ? "hidden"
            : ""}"
        >
          ${this.allies.map(
            (player) => html`
              <li
                class="rounded bg-green-700 ${this.selectedPlayer ==
                player.player
                  ? "bg-blue-500/50"
                  : ""} p-2"
              >
                <button
                  @click=${() => this.handleRowClick(player.player)}
                  class="text-white w-full"
                >
                  ${unsafeHTML(player.name)}
                </button>
              </li>
            `,
          )}
        </ul>
      </div>
    `;
  }

  render() {
    return html`
      <div
        class="rounded-md relative flex flex-col overflow-y-auto lg:bottom-2.5 lg:right-2.5 z-50 lg:max-w-[30vw] lg:w-max pointer-events-auto text-white min-w-96"
      >
        ${this.renderAllianceEvents()} ${this.renderAllianceOverview()}
      </div>
    `;
  }
  createRenderRoot() {
    return this;
  }

  toggleAllianceDisplay() {
    this._allianceDisplayHidden = !this._allianceDisplayHidden;
    this.requestUpdate();
  }

  hideAllianceDisplay() {
    this._allianceDisplayHidden = true;
    this.requestUpdate();
  }

  showAllianceDisplay() {
    this._allianceDisplayHidden = false;
    this.requestUpdate();
  }

  get isVisible() {
    return !this._allianceDisplayHidden;
  }
}

function formatPercentage(value: number): string {
  const perc = value * 100;
  if (perc > 99.5) {
    return "100%";
  }
  if (perc < 0.01) {
    return "0%";
  }
  if (perc < 0.1) {
    return perc.toPrecision(1) + "%";
  }
  return perc.toPrecision(2) + "%";
}
