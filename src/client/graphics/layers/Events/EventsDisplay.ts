import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Layer } from "../Layer";
import { EventBus } from "../../../../core/EventBus";
import { GameView } from "../../../../core/game/GameView";
import { ClientID } from "../../../../core/Schemas";
import { Event } from "./Interfaces";
import { MessageType } from "../../../../core/game/Game";
import { GameUpdate, GameUpdateType } from "../../../../core/game/GameUpdates";
import { EventParser } from "./EventParser";
@customElement("events-display")
export class EventsDisplay extends LitElement implements Layer {
  public eventBus: EventBus;
  public game: GameView;
  public clientID: ClientID;
  private events: Event[] = [];
  private newEvents: Event[] = [];
  private eventParser: EventParser;

  @state() private _hidden: boolean = false;
  @state() private _collapsed: boolean = true;

  private updateMap = new Map([
    [GameUpdateType.DisplayEvent, (u) => this.onEventUpdate(u)],
    [GameUpdateType.BrokeAlliance, (u) => this.onEventUpdate(u)],
    [GameUpdateType.BrokeAlliance, (u) => this.onEventUpdate(u)],
    [GameUpdateType.AllianceRequestReply, (u) => this.onEventUpdate(u)],
    [GameUpdateType.TargetPlayer, (u) => this.onEventUpdate(u)],
    [GameUpdateType.Emoji, (u) => this.onEventUpdate(u)],
  ]);

  init() {
    this.eventParser = new EventParser(this.game, this.clientID);
  }

  tick() {
    const updates = this.game.updatesSinceLastTick();
    let hasUpdate = false;
    for (const [ut, fn] of this.updateMap) {
      if (!hasUpdate && updates[ut]) hasUpdate = true;
      updates[ut]?.forEach((u) => fn(u));
    }

    if (this.game.ticks() % 10 === 0) {
      // Remove events that have expired
      this.newEvents = this.newEvents.filter((e) => {
        const result =
          e.duration && e.createdAt + e.duration > this.game.ticks();
        if (!result) hasUpdate = true;
        return result;
      });
    }

    // Only request update if changed
    if (hasUpdate) this.requestUpdate();
  }

  onEventUpdate(update: GameUpdate) {
    const event = this.eventParser.parse(update);
    if (event) this.addEvent(event);
  }

  addEvent(event: Event) {
    this.newEvents.push(event);
    this.events.push(event);
  }

  getEvents(): Event[] {
    return this._collapsed ? this.newEvents : this.events;
  }

  getEventClass(event: Event) {
    return `
            ${this.getEventTypeClass(event.type, event.priority ?? 1)} 
            ${this.getEventPrioClass(event.priority)}
        `;
  }

  getEventTypeClass(type: MessageType, prio: number) {
    switch (type) {
      case MessageType.INFO:
        return `${prio === 1 ? "bg-blue-600/30" : "bg-blue-600/50"} shadow-blue-900 py-1`;
      case MessageType.WARN:
        return `${prio === 1 ? "bg-yellow-600/30" : "bg-yellow-600/50"} shadow-yellow-900 py-2`;
      case MessageType.SUCCESS:
        return `${prio === 1 ? "bg-green-600/30" : "bg-green-600/50"} shadow-green-900 py-2`;
      case MessageType.ERROR:
        return `${prio === 1 ? "bg-red-600/30" : "bg-red-600/50"} shadow-red-900 py-2`;
      default:
        return "";
    }
  }

  getEventPrioClass(prio: number | undefined) {
    switch (prio) {
      case 1:
        return "text-xs py-1";
      case 2:
        return "text-sm md:text-base font-bold py-1 md:py-2";
      case 3:
        return "text-sm md:text-base font-bold py-2 md:py-4";
      default:
        return "text-xs py-1";
    }
  }

  render() {
    return html`
      <div
        class="relative flex flex-col pointer-events-auto items-end md:w-full md:max-w-sm p-2 md:p-4 gap-4 max-h-[40vh] !rounded-b-none !rounded-t-lg md:!rounded-tr-none transition-colors ${this
          ._collapsed
          ? ""
          : "theme-container"}"
      >
        <div class="flex flex-col gap-3 overflow-auto h-full relative w-full">
          ${this.getEvents().map(
            (event) => html`
              <p class="theme-container px-4 ${this.getEventClass(event)}">
                ${event.message}
              </p>
            `,
          )}
        </div>
        <button
          @click=${() => (this._collapsed = !this._collapsed)}
          class="py-2 px-4 theme-container rounded-lg max-w-max"
        >
          ${this._collapsed ? "Show" : "Hide"} all events
        </button>
      </div>
    `;
  }

  createRenderRoot() {
    return this;
  }
}
