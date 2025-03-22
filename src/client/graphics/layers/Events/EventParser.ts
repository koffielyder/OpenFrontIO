import { AllPlayers, MessageType } from "../../../../core/game/Game";
import {
  AllianceRequestReplyUpdate,
  BrokeAllianceUpdate,
  DisplayMessageUpdate,
  EmojiUpdate,
  GameUpdate,
  GameUpdateType,
  TargetPlayerUpdate,
} from "../../../../core/game/GameUpdates";
import { Event } from "./Interfaces";
import { GameView, PlayerView } from "../../../../core/game/GameView";

export class EventParser {
  private game: GameView;
  private clientID: string;

  // private updateMap = new Map([
  //     [GameUpdateType.DisplayEvent, (u) => this.parseDisplayMessageEvent(u)],
  //     [GameUpdateType.BrokeAlliance, (u) => this.onBrokeAllianceEvent(u)],
  //     [GameUpdateType.BrokeAlliance, (u) => this.onBrokeAllianceEvent(u)],
  //     [
  //         GameUpdateType.AllianceRequestReply,
  //         (u) => this.onAllianceRequestReplyEvent(u),
  //     ],
  //     [GameUpdateType.TargetPlayer, (u) => this.onTargetPlayerEvent(u)],
  //     [GameUpdateType.Emoji, (u) => this.onEmojiMessageEvent(u)],
  // ]);

  constructor(game: GameView, clientID: string) {
    this.game = game;
    this.clientID = clientID;
  }

  currentPlayer(): PlayerView {
    return this.game.playerByClientID(this.clientID);
  }

  parse(update: GameUpdate): Event | undefined {
    switch (update.type) {
      case GameUpdateType.DisplayEvent:
        return this.parseDisplayMessageEvent(update as DisplayMessageUpdate);
      case GameUpdateType.BrokeAlliance:
        return this.parseBrokeAllianceEvent(update as BrokeAllianceUpdate);
      case GameUpdateType.AllianceRequestReply:
        return this.parseAllianceRequestReplyEvent(
          update as AllianceRequestReplyUpdate,
        );
      case GameUpdateType.TargetPlayer:
        return this.parseTargetPlayerEvent(update as TargetPlayerUpdate);
      case GameUpdateType.Emoji:
        return this.parseEmojiMessageEvent(update as EmojiUpdate);
      default:
        return;
    }
  }

  parseDisplayMessageEvent(update: DisplayMessageUpdate): Event | undefined {
    console.log("parseDisplayMessageEvent", update, this.currentPlayer());
    if (
      !this.currentPlayer() ||
      this.currentPlayer().smallID() !== update.playerID
    )
      return;
    return this.parseEvent({
      message: update.message,
      type: update.messageType,
    });
  }

  parseBrokeAllianceEvent(update: BrokeAllianceUpdate): Event {
    if (
      !this.currentPlayer() ||
      ![update.traitorID, update.betrayedID].includes(
        this.currentPlayer().smallID(),
      )
    )
      return;
    let playerIsTraitor = false;
    if (update.traitorID === this.currentPlayer().smallID()) {
      playerIsTraitor = true;
    }

    const otherPlayer = this.game.playerBySmallID(
      playerIsTraitor ? update.betrayedID : update.traitorID,
    ) as PlayerView;
    const message = playerIsTraitor
      ? `You broke the alliance with ${otherPlayer.name()}`
      : `${otherPlayer.name()} broke the alliance with you`;
    const event: Event = {
      message: message,
      type: playerIsTraitor ? MessageType.WARN : MessageType.ERROR,
      priority: playerIsTraitor ? 2 : 3,
    };

    return this.parseEvent(event);
  }

  parseAllianceRequestReplyEvent(update: AllianceRequestReplyUpdate): Event {
    if (
      !this.currentPlayer() ||
      update.request.requestorID !== this.currentPlayer().smallID()
    )
      return;

    const recipient = this.game.playerBySmallID(
      update.request.recipientID,
    ) as PlayerView;

    return this.parseEvent({
      message: `${recipient.name()} ${update.accepted ? "accepted" : "rejected"} your alliance request`,
      type: update.accepted ? MessageType.SUCCESS : MessageType.ERROR,
      createdAt: this.game.ticks(),
      focusID: update.request.recipientID,
      priority: 3,
    });
  }

  parseTargetPlayerEvent(event: TargetPlayerUpdate): Event {
    const other = this.game.playerBySmallID(event.playerID) as PlayerView;
    if (!this.currentPlayer() || !this.currentPlayer().isAlliedWith(other))
      return;

    const target = this.game.playerBySmallID(event.targetID) as PlayerView;

    return this.parseEvent({
      message: `${other.name()} requests you attack ${target.name()}`,
      type: MessageType.INFO,
      focusID: event.targetID,
    });
  }

  parseEmojiMessageEvent(update: EmojiUpdate): Event {
    const recipient =
      update.emoji.recipientID == AllPlayers
        ? AllPlayers
        : this.game.playerBySmallID(update.emoji.recipientID);
    const sender = this.game.playerBySmallID(
      update.emoji.senderID,
    ) as PlayerView;

    if (recipient == this.currentPlayer()) {
      return this.parseEvent({
        message: `${sender.displayName()}:${update.emoji.message}`,
        type: MessageType.INFO,
        focusID: update.emoji.senderID,
        priority: 2,
      });
    } else if (sender === this.currentPlayer() && recipient !== AllPlayers) {
      return this.parseEvent({
        message: `Sent ${(recipient as PlayerView).displayName()}: ${update.emoji.message}`,
        type: MessageType.INFO,
        focusID: recipient.smallID(),
        priority: 2,
      });
    }
  }

  parseEvent(event: Event): Event {
    return {
      duration: 50,
      priority: 1,
      createdAt: this.game.ticks(),
      ...event,
    };
  }
}
