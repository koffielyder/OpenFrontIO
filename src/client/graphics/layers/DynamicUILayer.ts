import { renderNumber } from "src/client/Utils";
import { EventBus } from "src/core/EventBus";
import { UnitType } from "src/core/game/Game";
import {
  BonusEventUpdate,
  ConquestUpdate,
  GameUpdateType,
} from "src/core/game/GameUpdates";
import type { GameView, UnitView } from "../../../core/game/GameView";
import { MoveWarshipIntentEvent } from "../../Transport";
import { TransformHandler } from "../TransformHandler";
import { MoveIndicatorUI } from "../ui/MoveIndicatorUI";
import { NavalTarget } from "../ui/NavalTarget";
import { NukeTelegraph } from "../ui/NukeTelegraph";
import { TextIndicator } from "../ui/TextIndicator";
import { UIElement } from "../ui/UIElement";
import { Layer } from "./Layer";

const TEXT_OFFSET_Y = -5;
const TEXT_STACK_SPACING = 8;
const TEXT_DURATION = 2500;

export class DynamicUILayer implements Layer {
  private readonly uiElements: Array<UIElement> = [];
  private lastRefresh = Date.now();

  constructor(
    private readonly game: GameView,
    private transformHandler: TransformHandler,
    private eventBus: EventBus,
  ) {}

  init() {
    // Listen for warship move clicks for MoveIndicatorUI
    this.eventBus.on(MoveWarshipIntentEvent, (e) => {
      const x = this.game.x(e.tile);
      const y = this.game.y(e.tile);
      this.uiElements.push(new MoveIndicatorUI(this.transformHandler, x, y));
    });
  }

  shouldTransform(): boolean {
    return false;
  }

  tick() {
    if (!this.game.config().userSettings()?.fxLayer()) {
      return;
    }

    const updates = this.game.updatesSinceLastTick();
    if (!updates) return;

    updates[GameUpdateType.Unit]?.forEach((unit) => {
      const unitView = this.game.unit(unit.id);
      if (!unitView) return;
      this.onUnitEvent(unitView);
    });

    const bonusEvents = updates[GameUpdateType.BonusEvent] ?? [];
    this.onBonusEvents(bonusEvents);

    updates[GameUpdateType.ConquestEvent]?.forEach((update) => {
      if (update === undefined) return;
      this.onConquestEvent(update);
    });
  }

  private onBonusEvents(events: BonusEventUpdate[]) {
    if (events.length === 0) {
      return;
    }

    const myPlayer = this.game.myPlayer();
    if (!myPlayer) {
      return;
    }

    const aggregatedByTile = new Map<
      number,
      { gold: number; troops: number }
    >();
    for (const bonusEvent of events) {
      if (bonusEvent === undefined) continue;
      if (this.game.player(bonusEvent.player) !== myPlayer) {
        continue;
      }

      const existing = aggregatedByTile.get(bonusEvent.tile);
      if (existing) {
        existing.gold += bonusEvent.gold;
        existing.troops += bonusEvent.troops;
      } else {
        aggregatedByTile.set(bonusEvent.tile, {
          gold: bonusEvent.gold,
          troops: bonusEvent.troops,
        });
      }
    }

    for (const [tile, total] of aggregatedByTile) {
      this.onBonusEvent({
        type: GameUpdateType.BonusEvent,
        player: myPlayer.id(),
        tile,
        gold: total.gold,
        troops: total.troops,
      });
    }
  }

  onBonusEvent(bonus: BonusEventUpdate) {
    // Only display text fx for the current player
    if (this.game.player(bonus.player) !== this.game.myPlayer()) {
      return;
    }
    const tile = bonus.tile;
    const x = this.game.x(tile);
    let y = this.game.y(tile) + TEXT_OFFSET_Y;
    const gold = bonus.gold;
    const troops = bonus.troops;

    if (gold !== 0) {
      this.addNumber(gold, x, y, 1000, 10);
      y += TEXT_STACK_SPACING; // increase y so the next popup starts below
    }

    if (troops !== 0) {
      this.addNumber(troops, x, y, 1000, 10);
    }
  }

  onConquestEvent(conquest: ConquestUpdate) {
    // Only display text for the current player
    const conqueror = this.game.player(conquest.conquerorId);
    if (conqueror !== this.game.myPlayer()) {
      return;
    }
    const nameLocation = this.game.player(conquest.conqueredId).nameLocation();
    const x = nameLocation.x;
    const y = nameLocation.y;
    this.addNumber(conquest.gold, x, y + 8, TEXT_DURATION, 0);
  }

  onUnitEvent(unit: UnitView) {
    switch (unit.type()) {
      case UnitType.HydrogenBomb:
      case UnitType.AtomBomb: {
        this.onBombEvent(unit);
        break;
      }
      case UnitType.TransportShip: {
        this.onTransportShipEvent(unit);
        break;
      }
    }
  }

  onBombEvent(unit: UnitView) {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) {
      return;
    }
    if (
      this.createdThisTick(unit) &&
      (unit.owner() === myPlayer || unit.owner().isOnSameTeam(myPlayer))
    ) {
      const target = new NukeTelegraph(this.transformHandler, this.game, unit);
      this.uiElements.push(target);
    }
  }

  onTransportShipEvent(unit: UnitView) {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) {
      return;
    }
    if (this.createdThisTick(unit) && unit.owner() === myPlayer) {
      const target = new NavalTarget(this.transformHandler, this.game, unit);
      this.uiElements.push(target);
    }
  }

  renderLayer(context: CanvasRenderingContext2D) {
    const now = Date.now();
    const dt = now - this.lastRefresh;
    this.lastRefresh = now;
    if (this.game.config().userSettings()?.fxLayer()) {
      this.renderUIElements(context, dt);
    }
  }

  renderUIElements(context: CanvasRenderingContext2D, delta: number) {
    for (let i = this.uiElements.length - 1; i >= 0; i--) {
      if (!this.uiElements[i].render(context, delta)) {
        this.uiElements.splice(i, 1);
      }
    }
  }

  private createdThisTick(unit: UnitView): boolean {
    return unit.createdAt() === this.game.ticks();
  }

  private addNumber(
    num: bigint | number,
    x: number,
    y: number,
    duration: number,
    riseDistance: number,
  ) {
    if (BigInt(num) === 0n) return; // Don't show anything for 0
    const absNum =
      typeof num === "bigint" ? (num < 0n ? -num : num) : Math.abs(num);
    const shortened = renderNumber(absNum, 0);
    const sign = num >= 0 ? "+" : "-";
    this.uiElements.push(
      new TextIndicator(
        this.transformHandler,
        `${sign} ${shortened}`,
        x,
        y,
        duration,
        riseDistance,
      ),
    );
  }
}
