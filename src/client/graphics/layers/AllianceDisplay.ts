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

    this.addEvent({
      description: `${requestor.name()} requests an alliance!`,
      buttons: [
        {
          text: "Focus",
          className: "btn-gray",
          action: () => this.eventBus.emit(new GoToPlayerEvent(requestor)),
          preventClose: true,
        },
        {
          text: "Accept",
          className: "btn",
          action: () =>
            this.eventBus.emit(
              new SendAllianceReplyIntentEvent(requestor, recipient, true),
            ),
        },
        {
          text: "Reject",
          className: "btn-info",
          action: () =>
            this.eventBus.emit(
              new SendAllianceReplyIntentEvent(requestor, recipient, false),
            ),
        },
      ],
      highlight: true,
      type: MessageType.INFO,
      createdAt: this.game.ticks(),
      onDelete: () =>
        this.eventBus.emit(
          new SendAllianceReplyIntentEvent(requestor, recipient, false),
        ),
      priority: 0,
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
      });
    } else if (betrayed === myPlayer) {
      this.addEvent({
        description: `${traitor.name()}, broke their alliance with you`,
        type: MessageType.ERROR,
        highlight: true,
        createdAt: this.game.ticks(),
        focusID: update.traitorID,
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
    });
  }

  private handleRowClick(player: PlayerView) {
    this.emitGoToPlayerEvent(player);
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
        return "text-green-300";
      case MessageType.INFO:
        return "text-gray-200";
      case MessageType.WARN:
        return "text-yellow-300";
      case MessageType.ERROR:
        return "text-red-300";
      default:
        return "text-white";
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

  renderAllianceEvents() {
    return html`
      <table
        class="w-full border-collapse text-white shadow-lg lg:text-xl text-xs"
        style="pointer-events: auto;"
      >
        <tbody>
          ${this.allianceEvents.map(
            (event, index) => html`
              <tr
                class="border-b border-opacity-0 ${this.getMessageTypeClasses(
                  event.type,
                )}"
              >
                <td class="lg:p-3 p-1 text-left">
                  ${event.focusID
                    ? html`<button
                        @click=${() => {
                          this.emitGoToPlayerEvent(event.focusID);
                        }}
                      >
                        ${this.getEventDescription(event)}
                      </button>`
                    : this.getEventDescription(event)}
                  ${event.buttons
                    ? html`
                        <div class="flex flex-wrap gap-1.5 mt-1">
                          ${event.buttons.map(
                            (btn) => html`
                              <button
                                class="inline-block px-3 py-1 text-white rounded text-sm cursor-pointer transition-colors duration-300
                        ${btn.className.includes("btn-info")
                                  ? "bg-blue-500 hover:bg-blue-600"
                                  : btn.className.includes("btn-gray")
                                    ? "bg-gray-500 hover:bg-gray-600"
                                    : "bg-green-600 hover:bg-green-700"}"
                                @click=${() => {
                                  btn.action();
                                  if (!btn.preventClose) {
                                    this.removeEvent(index);
                                  }
                                  this.requestUpdate();
                                }}
                              >
                                ${btn.text}
                              </button>
                            `,
                          )}
                        </div>
                      `
                    : ""}
                </td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }

  render() {
    return html`
      <div
        class="rounded-md bg-black bg-opacity-60 relative max-h-[30vh] flex flex-col overflow-y-auto lg:bottom-2.5 lg:right-2.5 z-50 lg:max-w-[30vw] lg:w-max pointer-events-auto text-white min-w-96"
      >
        <button
          class="flex justify-between items-center p-2 bg-black sticky top-0 left-0"
          @click=${() => this.toggleAllianceDisplay()}
        >
          <span>Alliances (${this.allies.length})</span>
          <span> ${this._allianceDisplayHidden ? "Show" : "Hide"} </span>
        </button>
        ${this.renderAllianceEvents()}
        <div
          class="${this._allianceDisplayHidden ? "hidden" : ""}"
          @contextmenu=${(e) => e.preventDefault()}
        >
          <div class="flex flex-col w-full">
            ${this.allies.map(
              (player) => html`
                <div
                  class="relative flex flex-col border-b border-white last:border-b-0"
                >
                  <button
                    @click=${() => this.handleRowClick(player.player)}
                    class="text-white h-10 px-2 text-left ${this
                      .selectedPlayer == player.player
                      ? "bg-blue-500/50"
                      : ""}"
                  >
                    ${unsafeHTML(player.name)}
                  </button>
                  <div
                    class="h-10 w-full inset-0 flex flex-wrap z-40 ${this
                      .selectedPlayer == player.player
                      ? "active"
                      : "hidden"}"
                  >
                    <button
                      class="w-1/4 h-full bg-gray-600"
                      @click=${() => this.emitGoToPlayerEvent(player.player)}
                    >
                      Focus
                    </button>
                    <button
                      class="w-1/4 h-full bg-blue-600"
                      @click=${() => {
                        this.selectedPlayer = null;
                      }}
                    >
                      Troops
                    </button>
                    <button class="w-1/4 h-full bg-green-600">Send</button>
                    <button
                      class="w-1/4 h-full bg-red-600"
                      @click=${() => this.selectPlayer(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              `,
            )}
          </div>
        </div>
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
