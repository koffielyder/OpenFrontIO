import { GameView } from "../../../core/game/GameView";
import {
  getResourceNodes,
  RESOURCE_NODE_RADIUS,
  ResourceNode,
  resourceSeedKeyFromGameConfig,
  ResourceType,
} from "../../../core/game/ResourceNodes";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

const RESOURCE_RADIUS = RESOURCE_NODE_RADIUS;
const RENDER_SCALE = 2;

export class ResourceIconsLayer implements Layer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private resourcesDrawn = false;

  constructor(
    private game: GameView,
    private transformHandler: TransformHandler,
  ) {}

  shouldTransform(): boolean {
    return true;
  }

  init(): void {
    this.redraw();
  }

  redraw(): void {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.game.width() * RENDER_SCALE;
    this.canvas.height = this.game.height() * RENDER_SCALE;

    const context = this.canvas.getContext("2d", { alpha: true });
    if (context === null) throw new Error("2d context not supported");
    this.context = context;
    this.resourcesDrawn = false;

    this.drawResources();
  }

  renderLayer(context: CanvasRenderingContext2D): void {
    if (!this.resourcesDrawn) {
      return;
    }
    if (this.transformHandler.scale < 0.18) {
      return;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      this.canvas,
      -this.game.width() / 2,
      -this.game.height() / 2,
      this.game.width(),
      this.game.height(),
    );
  }

  private drawResources(): void {
    if (!this.context || this.resourcesDrawn) {
      return;
    }

    const resourceNodes = this.computeResourceNodes();

    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.globalAlpha = 0.9;
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = "high";

    for (const node of resourceNodes) {
      this.drawResourceCircle(node);
    }

    this.context.globalAlpha = 1;
    this.resourcesDrawn = true;
  }

  private computeResourceNodes(): ResourceNode[] {
    const gameConfig = this.game.config().gameConfig();
    const seedKey = resourceSeedKeyFromGameConfig(gameConfig);
    return getResourceNodes(this.game, seedKey);
  }

  private drawResourceCircle(node: ResourceNode): void {
    const x = this.game.x(node.tile) * RENDER_SCALE;
    const y = this.game.y(node.tile) * RENDER_SCALE;
    const color = this.resourceColor(node.type);

    this.context.beginPath();
    this.context.fillStyle = color;
    this.context.strokeStyle = "rgba(0,0,0,0.8)";
    this.context.lineWidth = RENDER_SCALE;
    this.context.arc(x, y, RESOURCE_RADIUS * RENDER_SCALE, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
  }

  private resourceColor(type: ResourceType): string {
    switch (type) {
      case ResourceType.Ore:
        return "#7c3aed";
      case ResourceType.Grain:
        return "#ca8a04";
      case ResourceType.Stone:
        return "#6b7280";
      default:
        return "#6b7280";
    }
  }
}
