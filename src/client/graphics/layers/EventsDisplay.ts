import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import {
  AllPlayers,
  MessageType,
  PlayerType,
  Tick,
  UnitType,
} from "../../../core/game/Game";
import {
  AttackUpdate,
  DisplayMessageUpdate,
} from "../../../core/game/GameUpdates";
import { EmojiUpdate } from "../../../core/game/GameUpdates";
import { TargetPlayerUpdate } from "../../../core/game/GameUpdates";
import { AllianceExpiredUpdate } from "../../../core/game/GameUpdates";
import { BrokeAllianceUpdate } from "../../../core/game/GameUpdates";
import { AllianceRequestReplyUpdate } from "../../../core/game/GameUpdates";
import { AllianceRequestUpdate } from "../../../core/game/GameUpdates";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { ClientID } from "../../../core/Schemas";
import { Layer } from "./Layer";
import {
  CancelAttackIntentEvent,
  SendAllianceReplyIntentEvent,
} from "../../Transport";
import { unsafeHTML, UnsafeHTMLDirective } from "lit/directives/unsafe-html.js";
import { DirectiveResult } from "lit/directive.js";

import { onlyImages, sanitize } from "../../../core/Util";
import { GameView, PlayerView, UnitView } from "../../../core/game/GameView";
import { renderTroops } from "../../Utils";
import { GoToPlayerEvent, GoToUnitEvent } from "./Leaderboard";

interface Event {
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

@customElement("events-display")
export class EventsDisplay extends LitElement implements Layer {
  public eventBus: EventBus;
  public game: GameView;
  public clientID: ClientID;

  private events: Event[] = [];
  @state() private incomingAttacks: AttackUpdate[] = [];
  @state() private outgoingAttacks: AttackUpdate[] = [];
  @state() private outgoingBoats: UnitView[] = [];
  @state() private _hidden: boolean = false;
  @state() private newEvents: number = 0;

  private toggleHidden() {
    this._hidden = !this._hidden;
    if (this._hidden) {
      this.newEvents = 0;
    }
    this.requestUpdate();
  }

  private updateMap = new Map([
    [GameUpdateType.DisplayEvent, (u) => this.onDisplayMessageEvent(u)],
    [GameUpdateType.Emoji, (u) => this.onEmojiMessageEvent(u)],
  ]);

  constructor() {
    super();
    this.events = [];
    this.incomingAttacks = [];
    this.outgoingAttacks = [];
    this.outgoingBoats = [];
  }

  init() {}

  tick() {
    const updates = this.game.updatesSinceLastTick();
    for (const [ut, fn] of this.updateMap) {
      updates[ut]?.forEach((u) => fn(u));
    }

    let remainingEvents = this.events.filter((event) => {
      const shouldKeep =
        this.game.ticks() - event.createdAt < (event.duration ?? 600);
      if (!shouldKeep && event.onDelete) {
        event.onDelete();
      }
      return shouldKeep;
    });

    if (remainingEvents.length > 30) {
      remainingEvents = remainingEvents.slice(-30);
    }

    if (this.events.length !== remainingEvents.length) {
      this.events = remainingEvents;
      this.requestUpdate();
    }

    const myPlayer = this.game.myPlayer();
    if (!myPlayer) {
      return;
    }

    // Update attacks
    this.incomingAttacks = myPlayer.incomingAttacks().filter((a) => {
      const t = (this.game.playerBySmallID(a.attackerID) as PlayerView).type();
      return t != PlayerType.Bot;
    });

    this.outgoingAttacks = myPlayer
      .outgoingAttacks()
      .filter((a) => a.targetID != 0);

    this.outgoingBoats = myPlayer
      .units()
      .filter((u) => u.type() === UnitType.TransportShip);
    console.log("loan", this.outgoingBoats);

    this.requestUpdate();
  }

  private addEvent(event: Event) {
    this.events = [...this.events, event];
    if (this._hidden == true) {
      this.newEvents++;
    }
    this.requestUpdate();
  }

  private removeEvent(index: number) {
    this.events = [
      ...this.events.slice(0, index),
      ...this.events.slice(index + 1),
    ];
  }

  shouldTransform(): boolean {
    return false;
  }

  renderLayer(): void {}

  onDisplayMessageEvent(event: DisplayMessageUpdate) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (
      event.playerID != null &&
      (!myPlayer || myPlayer.smallID() !== event.playerID)
    ) {
      return;
    }

    this.addEvent({
      description: event.message,
      createdAt: this.game.ticks(),
      highlight: true,
      type: event.messageType,
      unsafeDescription: true,
    });
  }

  emitCancelAttackIntent(id: string) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer) return;
    this.eventBus.emit(new CancelAttackIntentEvent(myPlayer.id(), id));
  }

  emitGoToPlayerEvent(attackerID: number) {
    const attacker = this.game.playerBySmallID(attackerID) as PlayerView;
    if (!attacker) return;
    this.eventBus.emit(new GoToPlayerEvent(attacker));
  }

  emitGoToUnitEvent(unit: UnitView) {
    this.eventBus.emit(new GoToUnitEvent(unit));
  }

  onEmojiMessageEvent(update: EmojiUpdate) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer) return;

    const recipient =
      update.emoji.recipientID == AllPlayers
        ? AllPlayers
        : this.game.playerBySmallID(update.emoji.recipientID);
    const sender = this.game.playerBySmallID(
      update.emoji.senderID,
    ) as PlayerView;

    if (recipient == myPlayer) {
      this.addEvent({
        description: `${sender.displayName()}:${update.emoji.message}`,
        unsafeDescription: true,
        type: MessageType.INFO,
        highlight: true,
        createdAt: this.game.ticks(),
        focusID: update.emoji.senderID,
      });
    } else if (sender === myPlayer && recipient !== AllPlayers) {
      this.addEvent({
        description: `Sent ${(recipient as PlayerView).displayName()}: ${
          update.emoji.message
        }`,
        unsafeDescription: true,
        type: MessageType.INFO,
        highlight: true,
        createdAt: this.game.ticks(),
        focusID: recipient.smallID(),
      });
    }
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
    event: Event,
  ): string | DirectiveResult<typeof UnsafeHTMLDirective> {
    return event.unsafeDescription
      ? unsafeHTML(onlyImages(event.description))
      : event.description;
  }

  private renderAttacks() {
    if (
      this.incomingAttacks.length === 0 &&
      this.outgoingAttacks.length === 0
    ) {
      return html``;
    }

    return html`
      ${this.incomingAttacks.length > 0
        ? html`
            <tr class="border-t border-gray-700">
              <td class="lg:p-3 p-1 text-left text-red-400">
                ${this.incomingAttacks.map(
                  (attack) => html`
                    <button
                      class="ml-2"
                      @click=${() =>
                        this.emitGoToPlayerEvent(attack.attackerID)}
                    >
                      ${renderTroops(attack.troops)}
                      ${(
                        this.game.playerBySmallID(
                          attack.attackerID,
                        ) as PlayerView
                      )?.name()}
                    </button>
                  `,
                )}
              </td>
            </tr>
          `
        : ""}
      ${this.outgoingAttacks.length > 0
        ? html`
            <tr class="border-t border-gray-700">
              <td class="lg:p-3 p-1 text-left text-blue-400">
                ${this.outgoingAttacks.map(
                  (attack) => html`
                    <button
                      class="ml-2"
                      @click=${() => this.emitGoToPlayerEvent(attack.targetID)}
                    >
                      ${renderTroops(attack.troops)}
                      ${(
                        this.game.playerBySmallID(attack.targetID) as PlayerView
                      )?.name()}
                    </button>

                    ${!attack.retreating
                      ? html`<button
                          ${attack.retreating ? "disabled" : ""}
                          @click=${() => {
                            this.emitCancelAttackIntent(attack.id);
                          }}
                        >
                          ❌
                        </button>`
                      : "(retreating...)"}
                  `,
                )}
              </td>
            </tr>
          `
        : ""}
    `;
  }

  private renderBoats() {
    if (this.outgoingBoats.length === 0) {
      return html``;
    }

    return html`
      ${this.outgoingBoats.length > 0
        ? html`
            <tr class="border-t border-gray-700">
              <td
                class="lg:p-3 p-1 text-left text-blue-400 grid grid-cols-3 gap-2"
              >
                ${this.outgoingBoats.map(
                  (boats) => html`
                    <button @click=${() => this.emitGoToUnitEvent(boats)}>
                      Boat: ${renderTroops(boats.troops())}
                    </button>
                  `,
                )}
              </td>
            </tr>
          `
        : ""}
    `;
  }

  render() {
    if (
      this.events.length === 0 &&
      this.incomingAttacks.length === 0 &&
      this.outgoingAttacks.length === 0 &&
      this.outgoingBoats.length === 0
    ) {
      return html``;
    }
    this.events.sort((a, b) => {
      const aPrior = a.priority ?? 100000;
      const bPrior = b.priority ?? 100000;
      if (aPrior == bPrior) {
        return a.createdAt - b.createdAt;
      }
      return bPrior - aPrior;
    });

    return html`
      <div
        class="${this._hidden
          ? "w-fit px-[10px] py-[5px]"
          : ""} rounded-md bg-black bg-opacity-60 relative max-h-[30vh] flex flex-col-reverse overflow-y-auto w-full lg:bottom-2.5 lg:right-2.5 z-50 lg:max-w-[30vw] lg:w-full lg:w-auto"
      >
        <div>
          <div class="w-full bg-black/80 sticky top-0 px-[10px]">
            <button
              class="text-white cursor-pointer pointer-events-auto ${this
                ._hidden
                ? "hidden"
                : ""}"
              @click=${this.toggleHidden}
            >
              Hide
            </button>
          </div>
          <button
            class="text-white cursor-pointer pointer-events-auto ${this._hidden
              ? ""
              : "hidden"}"
            @click=${this.toggleHidden}
          >
            Events
            <span
              class="${this.newEvents
                ? ""
                : "hidden"} inline-block px-2 bg-red-500 rounded-sm"
              >${this.newEvents}</span
            >
          </button>
          <table
            class="w-full border-collapse text-white shadow-lg lg:text-xl text-xs ${this
              ._hidden
              ? "hidden"
              : ""}"
            style="pointer-events: auto;"
          >
            <tbody>
              ${this.events.map(
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
              ${this.renderAttacks()} ${this.renderBoats()}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  createRenderRoot() {
    return this;
  }
}
