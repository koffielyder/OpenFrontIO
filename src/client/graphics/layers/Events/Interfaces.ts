import { MessageType, Tick } from "../../../../core/game/Game";
import { PlayerView } from "../../../../core/game/GameView";

export interface Event {
  message: string;
  type: MessageType;
  createdAt?: number;
  onDelete?: () => void;
  priority?: number;
  duration?: Tick;
  focusID?: number;
}

export interface Front {
  player: PlayerView;
  incoming: Array<Attack>;
  outgoing: Array<Attack>;
  createdAt: number;
  inactive: number | null;
}

export interface Attack {
  playerID: number;
  targetID: number;
  troops: number;
  retreating: boolean;
}

export interface Request {
  player: PlayerView;
  createdAt: number;
  description: string;
  onAccept: () => void;
  onReject: () => void;
  focusID?: number;
}
