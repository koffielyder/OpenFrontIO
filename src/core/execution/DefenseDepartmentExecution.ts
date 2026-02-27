import { Execution, Game, Unit, UnitType } from "../game/Game";
import { TrainStationExecution } from "./TrainStationExecution";

export class DefenseDepartmentExecution implements Execution {
  private active: boolean = true;
  private game: Game;
  private stationCreated = false;

  constructor(private defenseDepartment: Unit) {}

  init(mg: Game, ticks: number): void {
    this.game = mg;
  }

  tick(ticks: number): void {
    if (!this.stationCreated) {
      this.createStation();
      this.stationCreated = true;
    }
    if (!this.defenseDepartment.isActive()) {
      this.active = false;
      return;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  private createStation(): void {
    const structures = this.game.nearbyUnits(
      this.defenseDepartment.tile()!,
      this.game.config().trainStationMaxRange(),
      [
        UnitType.City,
        UnitType.Port,
        UnitType.Factory,
        UnitType.Extractor,
        UnitType.Barracks,
        UnitType.DefenseDepartment,
      ],
    );

    this.game.addExecution(new TrainStationExecution(this.defenseDepartment));
    for (const { unit } of structures) {
      if (!unit.hasTrainStation()) {
        this.game.addExecution(new TrainStationExecution(unit));
      }
    }
  }
}
